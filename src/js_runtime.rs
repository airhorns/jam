use std::sync::{Arc, Mutex};

use rquickjs::{AsyncContext, AsyncRuntime, Function, Object, Value};

use crate::pattern::{Pattern, PatternTerm};
use crate::rule::{BodyFn, HoldOp, PatternExpr, Program, RuleSpec};
use crate::term::{Statement, Term};
use crate::transpile;

/// Initialize LLRT globals (console, fetch, etc.) on a QuickJS context.
/// Requires BasePrimordials initialization first (caches JS built-in constructors).
fn init_llrt_globals(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    use llrt_utils::primordials::{BasePrimordials, Primordial};
    BasePrimordials::init(ctx)?;
    llrt_modules::console::init(ctx)?;
    llrt_modules::fetch::init(ctx)?;
    Ok(())
}

/// The Jam runtime JavaScript source, transpiled from TypeScript at first use.
/// Includes both the core runtime and the SwiftUI component library.
fn get_runtime_js() -> &'static str {
    use std::sync::OnceLock;
    static RUNTIME_JS: OnceLock<String> = OnceLock::new();
    RUNTIME_JS.get_or_init(|| {
        let runtime_ts = include_str!("../ts/runtime.ts");
        let components_ts = include_str!("../ts/components.ts");

        let runtime_js = transpile::transpile_ts_to_js(runtime_ts, "runtime.ts")
            .expect("Failed to transpile jam runtime");
        let components_js = transpile::transpile_ts_to_js(components_ts, "components.ts")
            .expect("Failed to transpile jam components");

        let runtime_js = transpile::strip_imports(&runtime_js);
        let components_js = transpile::strip_imports(&components_js);

        format!("{runtime_js}\n{components_js}")
    })
}

/// Holds the QuickJS async runtime + context.
/// Shared across all programs and body functions.
struct JsContext {
    runtime: AsyncRuntime,
    context: AsyncContext,
    tokio_rt: tokio::runtime::Runtime,
}

// Safety: QuickJS is single-threaded. We protect access with a Mutex
// and DBSP uses 1 worker thread, so there's no actual concurrent access.
unsafe impl Send for JsContext {}
unsafe impl Sync for JsContext {}

impl JsContext {
    fn new() -> Self {
        let tokio_rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let runtime = tokio_rt
            .block_on(async { AsyncRuntime::new().expect("Failed to create async runtime") });
        let context = tokio_rt
            .block_on(async { AsyncContext::full(&runtime).await })
            .expect("Failed to create async context");

        // Initialize LLRT globals and Jam runtime
        let runtime_js = get_runtime_js();
        tokio_rt.block_on(context.with(|ctx| {
            init_llrt_globals(&ctx).expect("Failed to init LLRT globals");
            ctx.eval::<(), _>(runtime_js).expect("Failed to eval Jam runtime");
        }));

        JsContext {
            runtime,
            context,
            tokio_rt,
        }
    }

    /// Eval additional JS code in the context (e.g., a new program).
    fn eval(&self, js: &str) -> Result<(), String> {
        self.tokio_rt.block_on(self.context.with(|ctx| {
            ctx.eval::<(), _>(js)
                .map_err(|e| format!("Eval error: {e}"))
        }))
    }

    /// Drive any pending async operations (fetch, timers) to completion.
    fn idle(&self) {
        self.tokio_rt.block_on(self.runtime.idle());
    }

    /// Run a sync closure on the context (for reading state).
    fn with<R: Send>(&self, f: impl FnOnce(rquickjs::Ctx<'_>) -> R + Send) -> R {
        self.tokio_rt.block_on(self.context.with(f))
    }
}

/// A JavaScript runtime for loading Jam programs written in TypeScript.
/// Uses a single persistent QuickJS context that all programs share.
pub struct JsRuntime {
    /// Shared context for all programs, body functions, and callbacks.
    shared: Arc<Mutex<JsContext>>,
    /// Number of rules before the latest program load (for extracting new rules).
    rules_before_load: usize,
}

impl JsRuntime {
    pub fn new() -> Self {
        let ctx = JsContext::new();
        JsRuntime {
            shared: Arc::new(Mutex::new(ctx)),
            rules_before_load: 0,
        }
    }

    /// Load a TypeScript program and extract its rules and claims.
    /// Multiple programs can be loaded — they share the same QuickJS context.
    pub fn load_program(&mut self, name: &str, ts_source: &str) -> Result<Program, String> {
        let filename = if name.contains('.') {
            name.to_string()
        } else {
            format!("{name}.ts")
        };
        let js = transpile::transpile_ts_to_js(ts_source, &filename)?;
        let js = transpile::strip_imports(&js);

        let guard = self.shared.lock().unwrap();

        // Remember how many rules exist before this program
        let rules_before = guard.with(|ctx| {
            let jam: Object = ctx.globals().get("__jam").unwrap();
            let rules: rquickjs::Array = jam.get("rules").unwrap();
            rules.len()
        });

        // Clear top-level claims from any previous program
        guard.with(|ctx| {
            ctx.eval::<(), _>("__jam.topLevelClaims.length = 0;").ok();
        });

        // Eval the user's program
        guard.eval(&js)?;

        // Drive any async operations (top-level fetch, etc.)
        guard.idle();

        // Finalize: register any imperative when() markers not consumed by render()
        guard.with(|ctx| {
            let jam: Object = ctx.globals().get("__jam").unwrap();
            let finalize: Function = jam.get("finalize").unwrap();
            finalize.call::<_, ()>(()).ok();
        });

        // Extract claims and new rules
        let (claims, rule_data) = guard.with(|ctx| {
            let globals = ctx.globals();
            let jam: Object = globals.get("__jam").map_err(|e| format!("{e}"))?;

            let claims_val: Value = jam.get("topLevelClaims").map_err(|e| format!("{e}"))?;
            let claims = js_array_to_statements(&claims_val)?;

            let rules_val: Value = jam.get("rules").map_err(|e| format!("{e}"))?;
            let rule_data = extract_rule_patterns(&ctx, &rules_val)?;

            Ok::<_, String>((claims, rule_data))
        })?;

        // Only build RuleSpecs for the NEW rules (from this program)
        let new_rules = &rule_data[rules_before..];
        let shared = self.shared.clone();
        let rules = build_rule_specs(new_rules, &shared, rules_before);

        // Extract hold ops from this program's top-level evaluation
        let hold_ops = guard.with(|ctx| read_hold_ops(&ctx)).unwrap_or_default();

        drop(guard);

        self.rules_before_load = rules_before + new_rules.len();

        Ok(Program {
            name: name.to_string(),
            claims,
            rules,
            hold_ops,
        })
    }

    /// Fire a callback registered by render() (e.g., onPress).
    /// Returns any hold operations produced by the callback.
    /// Fire a callback by its deterministic ID (e.g., "root/app/btn:onPress").
    pub fn fire_callback(
        &self,
        callback_id: &str,
    ) -> Result<Vec<HoldOp>, String> {
        let guard = self.shared.lock().unwrap();

        let result = guard.with(|ctx| {
            let jam: Object = ctx.globals().get("__jam").map_err(|e| format!("{e}"))?;
            let fire: Function = jam.get("fireCallback").map_err(|e| format!("{e}"))?;

            let result: bool = fire
                .call((callback_id,))
                .map_err(|e| format!("Callback error: {e}"))?;

            if !result {
                return Err(format!(
                    "No callback registered for {callback_id}"
                ));
            }
            Ok(())
        });
        result?;

        // Drive any async operations (fetch in callback)
        guard.idle();

        guard.with(|ctx| read_hold_ops(&ctx))
    }

    /// Refresh callbacks by re-deriving them from current facts.
    pub fn refresh_callbacks(&self, facts_json: &str) -> Result<(), String> {
        let guard = self.shared.lock().unwrap();
        guard.with(|ctx| {
            let jam: Object = ctx.globals().get("__jam").map_err(|e| format!("{e}"))?;
            let refresh: Function =
                jam.get("refreshCallbacks").map_err(|e| format!("{e}"))?;
            refresh
                .call::<_, ()>((facts_json,))
                .map_err(|e| format!("Callback refresh error: {e}"))?;
            Ok(())
        })
    }
}

impl Default for JsRuntime {
    fn default() -> Self {
        Self::new()
    }
}

/// Read and clear hold operations from the JS __jam object.
fn read_hold_ops(ctx: &rquickjs::Ctx<'_>) -> Result<Vec<HoldOp>, String> {
    let jam: Object = ctx.globals().get("__jam").map_err(|e| format!("{e}"))?;
    let get_hold_ops: Function = jam.get("getHoldOps").map_err(|e| format!("{e}"))?;
    let hold_ops_val: Value = get_hold_ops.call(()).map_err(|e| format!("{e}"))?;

    let arr = match hold_ops_val.into_array() {
        Some(a) => a,
        None => return Ok(vec![]),
    };

    let mut ops = Vec::new();
    for i in 0..arr.len() {
        let item: Object = arr.get(i).map_err(|e| format!("{e}"))?;
        let key: String = item.get("key").map_err(|e| format!("{e}"))?;
        let stmts_val: Value = item.get("stmts").map_err(|e| format!("{e}"))?;
        let stmts = js_array_to_statements(&stmts_val)?;
        ops.push(HoldOp { key, stmts });
    }
    Ok(ops)
}

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
    if let Some(n) = val.as_number() {
        return Ok(Term::Int(n as i64));
    }
    if let Some(n) = val.as_int() {
        return Ok(Term::Int(n as i64));
    }
    if let Some(n) = val.as_float() {
        return Ok(Term::Int(n as i64));
    }
    if let Some(s) = val.as_string() {
        Ok(Term::Symbol(
            s.to_string().map_err(|e| format!("{e}"))?,
        ))
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
    let arr = val.clone().into_array().ok_or("Expected array for pattern")?;
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
    let mut alternatives: Vec<Vec<PatternTerm>> = vec![vec![]];
    for term in terms {
        match term {
            PatternTermOrOr::Term(pt) => {
                for alt in &mut alternatives {
                    alt.push(pt.clone());
                }
            }
            PatternTermOrOr::Or(values) => {
                let mut new_alts = Vec::new();
                for val in values {
                    for alt in &alternatives {
                        let mut new_alt = alt.clone();
                        new_alt.push(PatternTerm::Exact(val.clone()));
                        new_alts.push(new_alt);
                    }
                }
                alternatives = new_alts;
            }
        }
    }

    if alternatives.len() == 1 {
        Ok(PatternExpr::Single(Pattern::new(
            alternatives.into_iter().next().unwrap(),
        )))
    } else {
        Ok(PatternExpr::Or(
            alternatives
                .into_iter()
                .map(|pts| PatternExpr::Single(Pattern::new(pts)))
                .collect(),
        ))
    }
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
        let patterns_arr = patterns_val.clone().into_array().ok_or("Expected patterns array")?;

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

/// Build RuleSpecs from extracted rule data + shared context.
/// `rule_index_offset` adjusts indices for programs loaded after the first.
fn build_rule_specs(
    rule_data: &[RuleData],
    shared: &Arc<Mutex<JsContext>>,
    rule_index_offset: usize,
) -> Vec<RuleSpec> {
    rule_data
        .iter()
        .map(|rd| {
            let body = create_body_fn(rd.rule_index + rule_index_offset, shared.clone());
            let whens = build_rule_specs(&rd.whens, shared, rule_index_offset);
            RuleSpec {
                pattern: rd.pattern.clone(),
                body,
                whens,
            }
        })
        .collect()
}

/// Create a BodyFn that calls a JS function by rule index.
fn create_body_fn(rule_index: usize, shared: Arc<Mutex<JsContext>>) -> BodyFn {
    Arc::new(move |bindings, is_insertion| {
        let guard = shared.lock().unwrap();
        // Use futures::executor::block_on instead of tokio because DBSP's
        // worker thread already runs inside a tokio runtime (nested block_on panics).
        futures::executor::block_on(guard.context.with(|ctx| {
            // Set empty collector for accumulating claims from the body
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
                        if *n >= i32::MIN as i64 && *n <= i32::MAX as i64 {
                            bindings_obj.set(name.as_str(), *n as i32).ok();
                        } else {
                            bindings_obj.set(name.as_str(), *n as f64).ok();
                        }
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

            if let Err(e) = body.call::<_, ()>((bindings_obj, is_insertion)) {
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
        }))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_simple_program() {
        let mut rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                claim("hello", "world");
            "#,
            )
            .unwrap();

        assert_eq!(program.claims.len(), 1);
        assert_eq!(
            program.claims[0],
            Statement::new(vec![Term::sym("hello"), Term::sym("world")])
        );
    }

    #[test]
    fn test_load_program_with_rule() {
        let mut rt = JsRuntime::new();
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
        let mut rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                interface Foo { bar: string; }
                const pattern: readonly [string, string, string] = ["x", "is", "cool"] as const;
                claim("ts", "works");
            "#,
            )
            .unwrap();

        assert_eq!(program.claims.len(), 1);
    }

    #[test]
    fn test_body_function_produces_claims() {
        let mut rt = JsRuntime::new();
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

        let mut bindings = crate::pattern::Bindings::new();
        bindings.insert("x".to_string(), Term::sym("omar"));
        let results = (program.rules[0].body)(&bindings, true);

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
        let mut rt = JsRuntime::new();
        let program = rt
            .load_program(
                "test",
                r#"
                when([$.entity, "is", "cool"], ({ entity }) => {
                    if (entity !== "skip") {
                        claim(entity, "is", "awesome");
                    }
                });
            "#,
            )
            .unwrap();

        let mut bindings = crate::pattern::Bindings::new();
        bindings.insert("entity".to_string(), Term::sym("skip"));
        let results = (program.rules[0].body)(&bindings, true);
        assert!(results.is_empty());

        bindings.insert("entity".to_string(), Term::sym("omar"));
        let results = (program.rules[0].body)(&bindings, true);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_full_pipeline_with_engine() {
        use crate::engine::Engine;

        let mut rt = JsRuntime::new();
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

        assert!(result
            .deltas
            .iter()
            .any(|(s, w)| *w > 0 && s == &Statement::new(vec![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("awesome")
            ])));
    }

    #[test]
    fn test_multiple_programs() {
        let mut rt = JsRuntime::new();

        let program1 = rt
            .load_program(
                "program1",
                r#"
                claim("from", "program1");
            "#,
            )
            .unwrap();

        let program2 = rt
            .load_program(
                "program2",
                r#"
                claim("from", "program2");
            "#,
            )
            .unwrap();

        assert_eq!(program1.claims.len(), 1);
        assert_eq!(program2.claims.len(), 1);
        assert_eq!(
            program1.claims[0],
            Statement::new(vec![Term::sym("from"), Term::sym("program1")])
        );
        assert_eq!(
            program2.claims[0],
            Statement::new(vec![Term::sym("from"), Term::sym("program2")])
        );
    }
}
