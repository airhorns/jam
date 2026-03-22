use std::sync::{Arc, Mutex};

use rquickjs::{Context, Function, Object, Runtime, Value};

use crate::pattern::{Pattern, PatternTerm};
use crate::rule::{BodyFn, PatternExpr, Program, RuleSpec};
use crate::term::{Statement, Term};
use crate::transpile;

/// The Jam runtime JavaScript source, transpiled from TypeScript at first use.
fn get_runtime_js() -> &'static str {
    use std::sync::OnceLock;
    static RUNTIME_JS: OnceLock<String> = OnceLock::new();
    RUNTIME_JS.get_or_init(|| {
        let ts = include_str!("../ts/runtime.ts");
        let js = transpile::transpile_ts_to_js(ts, "runtime.ts")
            .expect("Failed to transpile jam runtime");
        transpile::strip_imports(&js)
    })
}

/// A JavaScript runtime for loading Jam programs written in TypeScript.
pub struct JsRuntime {
    runtime: Runtime,
}

impl JsRuntime {
    pub fn new() -> Self {
        let runtime = Runtime::new().expect("Failed to create QuickJS runtime");
        JsRuntime { runtime }
    }

    /// Load a TypeScript program and extract its rules and claims.
    pub fn load_program(&self, name: &str, ts_source: &str) -> Result<Program, String> {
        let js = transpile::transpile_ts_to_js(ts_source, &format!("{name}.ts"))?;
        let js = transpile::strip_imports(&js);
        let runtime_js = get_runtime_js();

        // Create a context for extraction
        let extract_ctx = Context::full(&self.runtime).expect("Failed to create context");

        let (claims, rule_data) = extract_ctx.with(|ctx| {
            ctx.eval::<(), _>(runtime_js)
                .map_err(|e| format!("Runtime eval error: {e}"))?;
            ctx.eval::<(), _>(js.as_str())
                .map_err(|e| format!("Script eval error: {e}"))?;

            let globals = ctx.globals();
            let jam: Object = globals.get("__jam").map_err(|e| format!("{e}"))?;

            // Extract claims
            let claims_val: Value = jam.get("topLevelClaims").map_err(|e| format!("{e}"))?;
            let claims = js_array_to_statements(&claims_val)?;

            // Extract rule metadata (patterns only — bodies will be called in a separate context)
            let rules_val: Value = jam.get("rules").map_err(|e| format!("{e}"))?;
            let rule_data = extract_rule_patterns(&ctx, &rules_val)?;

            Ok::<_, String>((claims, rule_data))
        })?;

        // Create a separate runtime+context for body execution (owned by BodyFn closures)
        let body_runtime = Runtime::new().expect("Failed to create body runtime");
        let body_ctx = Context::full(&body_runtime).expect("Failed to create body context");

        body_ctx.with(|ctx| {
            ctx.eval::<(), _>(runtime_js)
                .expect("Failed to eval runtime");
            ctx.eval::<(), _>(js.as_str())
                .expect("Failed to eval script");
        });

        // Wrap in Arc<Mutex> for Send+Sync (BodyFn requirement)
        let shared = Arc::new(Mutex::new(BodyContext {
            _runtime: body_runtime,
            context: body_ctx,
        }));

        // Build RuleSpecs with body functions that call into the shared context
        let rules = build_rule_specs(&rule_data, &shared);

        Ok(Program {
            name: name.to_string(),
            claims,
            rules,
        })
    }
}

impl Default for JsRuntime {
    fn default() -> Self {
        Self::new()
    }
}

/// Holds the QuickJS runtime + context for body function execution.
/// Must be kept alive as long as any BodyFn closures reference it.
struct BodyContext {
    _runtime: Runtime,
    context: Context,
}

// Safety: QuickJS is single-threaded. We protect access with a Mutex
// and DBSP uses 1 worker thread, so there's no actual concurrent access.
unsafe impl Send for BodyContext {}
unsafe impl Sync for BodyContext {}

/// Extracted rule data (patterns + nested structure, no JS function references).
struct RuleData {
    pattern: PatternExpr,
    rule_index: usize,
    whens: Vec<RuleData>,
}

/// Convert a JS array of term arrays to Vec<Statement>.
fn js_array_to_statements(val: &Value) -> Result<Vec<Statement>, String> {
    let arr = val.clone().into_array().ok_or("Expected array")?;
    let mut stmts = Vec::new();
    for i in 0..arr.len() {
        let item: Value = arr.get(i).map_err(|e| format!("{e}"))?;
        stmts.push(js_term_array_to_statement(&item)?);
    }
    Ok(stmts)
}

/// Convert a JS array of terms to a Statement.
fn js_term_array_to_statement(val: &Value) -> Result<Statement, String> {
    let arr = val.clone().into_array().ok_or("Expected array")?;
    let mut terms = Vec::new();
    for i in 0..arr.len() {
        let v: Value = arr.get(i).map_err(|e| format!("{e}"))?;
        terms.push(js_value_to_term(&v)?);
    }
    Ok(Statement::new(terms))
}

/// Convert a JS value to a Rust Term.
fn js_value_to_term(val: &Value) -> Result<Term, String> {
    if let Some(s) = val.as_string() {
        Ok(Term::Symbol(s.to_string().map_err(|e| format!("{e}"))?))
    } else if let Some(n) = val.as_int() {
        Ok(Term::Int(n as i64))
    } else if let Some(n) = val.as_float() {
        Ok(Term::Int(n as i64))
    } else if let Some(b) = val.as_bool() {
        Ok(Term::Bool(b))
    } else {
        Err("Unsupported term value type".to_string())
    }
}

/// Intermediate: a pattern position is either a normal PatternTerm or an Or expansion.
enum PatternTermOrOr {
    Term(PatternTerm),
    Or(Vec<Term>),
}

/// Convert a JS value to a pattern term.
fn js_value_to_pattern_term(val: &Value) -> Result<PatternTermOrOr, String> {
    if let Some(obj) = val.as_object() {
        // Binding marker: { __binding: true, name: "x" }
        if let Ok(true) = obj.get::<_, bool>("__binding") {
            let name: String = obj.get("name").map_err(|e| format!("{e}"))?;
            return Ok(PatternTermOrOr::Term(PatternTerm::Bind(name)));
        }
        // Or marker: { __or: true, values: [...] }
        if let Ok(true) = obj.get::<_, bool>("__or") {
            let vals: Value = obj.get("values").map_err(|e| format!("{e}"))?;
            let arr = vals.into_array().ok_or("Expected array for or values")?;
            let mut terms = Vec::new();
            for i in 0..arr.len() {
                let v: Value = arr.get(i).map_err(|e| format!("{e}"))?;
                terms.push(js_value_to_term(&v)?);
            }
            return Ok(PatternTermOrOr::Or(terms));
        }
    }
    // Wildcard symbol
    if val.is_symbol() {
        return Ok(PatternTermOrOr::Term(PatternTerm::Wildcard));
    }
    // Literal
    let term = js_value_to_term(val)?;
    Ok(PatternTermOrOr::Term(PatternTerm::Exact(term)))
}

/// Convert a JS pattern array to a PatternExpr.
fn js_pattern_to_expr(val: &Value) -> Result<PatternExpr, String> {
    let arr = val
        .clone()
        .into_array()
        .ok_or("Expected array for pattern")?;
    let mut terms: Vec<PatternTermOrOr> = Vec::new();
    for i in 0..arr.len() {
        let v: Value = arr.get(i).map_err(|e| format!("{e}"))?;
        terms.push(js_value_to_pattern_term(&v)?);
    }

    let has_or = terms.iter().any(|t| matches!(t, PatternTermOrOr::Or(_)));
    if !has_or {
        let pts: Vec<PatternTerm> = terms
            .into_iter()
            .map(|t| match t {
                PatternTermOrOr::Term(pt) => pt,
                PatternTermOrOr::Or(_) => unreachable!(),
            })
            .collect();
        return Ok(PatternExpr::Single(Pattern::new(pts)));
    }

    // Expand or() into cross-product
    let mut alts: Vec<Vec<PatternTerm>> = vec![vec![]];
    for term in terms {
        match term {
            PatternTermOrOr::Term(pt) => {
                for alt in &mut alts {
                    alt.push(pt.clone());
                }
            }
            PatternTermOrOr::Or(values) => {
                let mut new_alts = Vec::new();
                for alt in &alts {
                    for val in &values {
                        let mut a = alt.clone();
                        a.push(PatternTerm::Exact(val.clone()));
                        new_alts.push(a);
                    }
                }
                alts = new_alts;
            }
        }
    }

    let exprs: Vec<PatternExpr> = alts
        .into_iter()
        .map(|ts| PatternExpr::Single(Pattern::new(ts)))
        .collect();
    Ok(if exprs.len() == 1 {
        exprs.into_iter().next().unwrap()
    } else {
        PatternExpr::Or(exprs)
    })
}

/// Extract rule patterns from JS __rules array (no function references).
fn extract_rule_patterns(
    _ctx: &rquickjs::Ctx<'_>,
    rules_val: &Value,
) -> Result<Vec<RuleData>, String> {
    let arr = rules_val.clone().into_array().ok_or("Expected array")?;
    let mut rules = Vec::new();

    for i in 0..arr.len() {
        let rule_obj: Object = arr.get(i).map_err(|e| format!("{e}"))?;

        // Extract patterns
        let patterns_val: Value = rule_obj.get("patterns").map_err(|e| format!("{e}"))?;
        let patterns_arr = patterns_val
            .clone()
            .into_array()
            .ok_or("Expected patterns array")?;

        let mut exprs = Vec::new();
        for j in 0..patterns_arr.len() {
            let p: Value = patterns_arr.get(j).map_err(|e| format!("{e}"))?;
            exprs.push(js_pattern_to_expr(&p)?);
        }

        let pattern = match exprs.len() {
            0 => return Err("Rule must have at least one pattern".into()),
            1 => exprs.into_iter().next().unwrap(),
            _ => PatternExpr::And(exprs),
        };

        // Extract nested whens
        let whens_val: Value = rule_obj.get("whens").map_err(|e| format!("{e}"))?;
        let whens = extract_rule_patterns(_ctx, &whens_val)?;

        rules.push(RuleData {
            pattern,
            rule_index: i,
            whens,
        });
    }
    Ok(rules)
}

/// Build RuleSpecs from extracted rule data + shared body context.
fn build_rule_specs(rule_data: &[RuleData], shared: &Arc<Mutex<BodyContext>>) -> Vec<RuleSpec> {
    rule_data
        .iter()
        .map(|rd| {
            let body = create_body_fn(rd.rule_index, shared.clone());
            let whens = build_rule_specs(&rd.whens, shared);
            RuleSpec {
                pattern: rd.pattern.clone(),
                body,
                whens,
            }
        })
        .collect()
}

/// Create a BodyFn that calls a JS function by rule index.
fn create_body_fn(rule_index: usize, shared: Arc<Mutex<BodyContext>>) -> BodyFn {
    Arc::new(move |bindings| {
        let guard = shared.lock().unwrap();
        guard.context.with(|ctx| {
            // Set empty collector
            let jam: Object = ctx.globals().get("__jam").unwrap();
            let set_collector: Function = jam.get("setCollector").unwrap();
            let empty_arr = rquickjs::Array::new(ctx.clone()).unwrap();
            set_collector.call::<_, ()>((empty_arr,)).unwrap();

            // Build bindings object
            let bindings_obj = Object::new(ctx.clone()).unwrap();
            for (name, term) in bindings {
                match term {
                    Term::Symbol(s) | Term::Str(s) => {
                        bindings_obj.set(name.as_str(), s.as_str()).ok();
                    }
                    Term::Int(n) => {
                        bindings_obj.set(name.as_str(), *n as f64).ok();
                    }
                    Term::Bool(b) => {
                        bindings_obj.set(name.as_str(), *b).ok();
                    }
                    Term::Nil => {}
                }
            }

            // Call the body function
            let rules: rquickjs::Array = jam.get("rules").unwrap();
            let rule: Object = rules.get(rule_index).unwrap();
            let body: Function = rule.get("body").unwrap();

            if let Err(e) = body.call::<_, ()>((bindings_obj,)) {
                eprintln!("Rule body error: {e}");
            }

            // Read collector
            let get_collector: Function = jam.get("getCollector").unwrap();
            let collector_val: Value = get_collector.call(()).unwrap();

            if let Some(arr) = collector_val.into_array() {
                let mut stmts = Vec::new();
                for k in 0..arr.len() {
                    if let Ok(item) = arr.get::<Value>(k)
                        && let Ok(stmt) = js_term_array_to_statement(&item)
                    {
                        stmts.push(stmt);
                    }
                }
                stmts
            } else {
                vec![]
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_simple_program() {
        let rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                claim("omar", "is", "cool");
            "#,
            )
            .unwrap();

        assert_eq!(program.name, "test");
        assert_eq!(program.claims.len(), 1);
        assert_eq!(
            program.claims[0],
            Statement::new(vec![Term::sym("omar"), Term::sym("is"), Term::sym("cool")])
        );
        assert!(program.rules.is_empty());
    }

    #[test]
    fn test_load_program_with_rule() {
        let rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                claim("omar", "is", "cool");
                when([$.x, "is", "cool"], ({ x }) => {
                    claim(x, "is", "awesome");
                });
            "#,
            )
            .unwrap();

        assert_eq!(program.claims.len(), 1);
        assert_eq!(program.rules.len(), 1);
    }

    #[test]
    fn test_load_typescript_program() {
        let rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                import { $, when, claim } from "./jam";

                const x: string = "omar";
                claim(x, "is", "cool");

                when([$.entity, "is", "cool"], ({ entity }: { entity: string }) => {
                    claim(entity, "is", "awesome");
                });
            "#,
            )
            .unwrap();

        assert_eq!(program.claims.len(), 1);
        assert_eq!(program.rules.len(), 1);
    }

    #[test]
    fn test_body_function_produces_claims() {
        let rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                when([$.x, "is", "cool"], ({ x }) => {
                    claim(x, "is", "awesome");
                });
            "#,
            )
            .unwrap();

        // Call the body function with test bindings
        let mut bindings = crate::pattern::Bindings::new();
        bindings.insert("x".to_string(), Term::sym("omar"));
        let results = (program.rules[0].body)(&bindings);

        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0],
            Statement::new(vec![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("awesome")
            ])
        );
    }

    #[test]
    fn test_conditional_body() {
        let rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                when([$.x, "is", "cool"], ({ x }) => {
                    claim(x, "is", "awesome");
                    if (x === "omar") {
                        claim(x, "is", "special");
                    }
                });
            "#,
            )
            .unwrap();

        // With x = "omar", should produce 2 claims
        let mut bindings = crate::pattern::Bindings::new();
        bindings.insert("x".to_string(), Term::sym("omar"));
        let results = (program.rules[0].body)(&bindings);
        assert_eq!(results.len(), 2);

        // With x = "alice", should produce 1 claim
        bindings.insert("x".to_string(), Term::sym("alice"));
        let results = (program.rules[0].body)(&bindings);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_full_pipeline_with_engine() {
        use crate::engine::Engine;

        let rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                claim("omar", "is", "cool");
                when([$.x, "is", "cool"], ({ x }) => {
                    claim(x, "is", "awesome");
                });
            "#,
            )
            .unwrap();

        let mut engine = Engine::new();
        engine.add_program(program);
        let result = engine.step();

        // Should have: omar is cool (+1), omar is awesome (+1)
        assert_eq!(result.deltas.len(), 2);
        assert!(result.deltas.iter().all(|(_, w)| *w == 1));
    }
}
