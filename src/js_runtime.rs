use std::sync::{Arc, Mutex};

use rquickjs::{AsyncContext, AsyncRuntime, Context, Function, Object, Runtime, Value};

use crate::pattern::{Pattern, PatternTerm};
use crate::rule::{BodyFn, HoldOp, PatternExpr, Program, RuleSpec};
use crate::term::{Statement, Term};
use crate::transpile;

/// Initialize LLRT globals (console, etc.) on a QuickJS context.
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

/// A JavaScript runtime for loading Jam programs written in TypeScript.
pub struct JsRuntime {
    /// Tokio runtime for driving async operations (fetch, timers).
    /// Shared between extract and body contexts.
    tokio_rt: tokio::runtime::Runtime,
    /// Async QuickJS runtime for the extraction context.
    extract_runtime: AsyncRuntime,
    /// Stored body context for callback invocation after program load.
    body_ctx: Option<Arc<Mutex<BodyContext>>>,
}

impl JsRuntime {
    pub fn new() -> Self {
        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");
        let extract_runtime = tokio_rt
            .block_on(async { AsyncRuntime::new().expect("Failed to create async runtime") });
        JsRuntime {
            tokio_rt,
            extract_runtime,
            body_ctx: None,
        }
    }

    /// Load a TypeScript program and extract its rules and claims.
    /// If the name ends with .tsx, JSX syntax is enabled.
    pub fn load_program(&mut self, name: &str, ts_source: &str) -> Result<Program, String> {
        // Use the provided name as filename if it has an extension, otherwise default to .ts
        let filename = if name.contains('.') {
            name.to_string()
        } else {
            format!("{name}.ts")
        };
        let js = transpile::transpile_ts_to_js(ts_source, &filename)?;
        let js = transpile::strip_imports(&js);
        let runtime_js = get_runtime_js();

        // Create an async context for extraction (async required for fetch/timers support)
        let extract_ctx = self
            .tokio_rt
            .block_on(async { AsyncContext::full(&self.extract_runtime).await })
            .expect("Failed to create extract context");

        let (claims, rule_data) = self.tokio_rt.block_on(extract_ctx.with(|ctx| {
            init_llrt_globals(&ctx).map_err(|e| format!("LLRT init error: {e}"))?;

            ctx.eval::<(), _>(runtime_js)
                .map_err(|e| format!("Runtime eval error: {e}"))?;
            ctx.eval::<(), _>(js.as_str())
                .map_err(|e| format!("Script eval error: {e}"))?;

            let globals = ctx.globals();
            let jam: Object = globals.get("__jam").map_err(|e| format!("{e}"))?;

            let claims_val: Value = jam.get("topLevelClaims").map_err(|e| format!("{e}"))?;
            let claims = js_array_to_statements(&claims_val)?;

            let rules_val: Value = jam.get("rules").map_err(|e| format!("{e}"))?;
            let rule_data = extract_rule_patterns(&ctx, &rules_val)?;

            Ok::<_, String>((claims, rule_data))
        }))?;

        // Drive any async operations from program initialization
        self.tokio_rt.block_on(self.extract_runtime.idle());

        // Create async runtime+context for body execution.
        // AsyncRuntime is required so that fetch() Promises can be driven via tokio.
        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let body_runtime =
            tokio_rt.block_on(async { AsyncRuntime::new().expect("Failed to create async runtime") });
        let body_ctx = tokio_rt
            .block_on(async { AsyncContext::full(&body_runtime).await })
            .expect("Failed to create async context");

        tokio_rt.block_on(body_ctx.with(|ctx| {
            init_llrt_globals(&ctx).expect("Failed to init LLRT globals");
            ctx.eval::<(), _>(runtime_js).expect("Failed to eval runtime");
            ctx.eval::<(), _>(js.as_str()).expect("Failed to eval script");
        }));

        // Drive any pending futures from program initialization (e.g., top-level fetch)
        tokio_rt.block_on(body_runtime.idle());

        // Wrap in Arc<Mutex> for Send+Sync (BodyFn requirement)
        let shared = Arc::new(Mutex::new(BodyContext {
            runtime: body_runtime,
            context: body_ctx,
            tokio_rt,
        }));

        // Store body context for later callback invocation
        self.body_ctx = Some(shared.clone());

        // Extract any hold operations from top-level evaluation
        let hold_ops = self.extract_hold_ops()?;

        // Build RuleSpecs with body functions that call into the shared context
        let rules = build_rule_specs(&rule_data, &shared);

        Ok(Program {
            name: name.to_string(),
            claims,
            rules,
            hold_ops,
        })
    }

    /// Fire a callback registered by render() (e.g., onPress).
    /// Returns any hold operations produced by the callback.
    pub fn fire_callback(
        &self,
        entity_id: &str,
        event_name: &str,
    ) -> Result<Vec<HoldOp>, String> {
        let body_ctx = self
            .body_ctx
            .as_ref()
            .ok_or("No program loaded")?;
        let guard = body_ctx.lock().unwrap();
        let result = guard.tokio_rt.block_on(guard.context.with(|ctx| {
            let jam: Object = ctx.globals().get("__jam").map_err(|e| format!("{e}"))?;
            let fire: Function = jam.get("fireCallback").map_err(|e| format!("{e}"))?;

            let result: bool = fire
                .call((entity_id, event_name))
                .map_err(|e| format!("Callback error: {e}"))?;

            if !result {
                return Err(format!(
                    "No callback registered for {entity_id}:{event_name}"
                ));
            }

            Ok(())
        }));
        result?;

        // Drive any async operations started by the callback (e.g., fetch)
        guard.tokio_rt.block_on(guard.runtime.idle());

        // Read hold operations produced by the callback
        guard.tokio_rt.block_on(guard.context.with(|ctx| Self::read_hold_ops(&ctx)))
    }

    /// Refresh callbacks by re-deriving them from current facts.
    /// Called after fire_event steps to fix stale closures from DBSP retraction ordering.
    pub fn refresh_callbacks(&self, facts_json: &str) -> Result<(), String> {
        let body_ctx = self.body_ctx.as_ref().ok_or("No body context")?;
        let guard = body_ctx.lock().unwrap();
        guard.tokio_rt.block_on(guard.context.with(|ctx| {
            let jam: Object = ctx.globals().get("__jam").map_err(|e| format!("{e}"))?;
            let refresh: Function =
                jam.get("refreshCallbacks").map_err(|e| format!("{e}"))?;
            refresh
                .call::<_, ()>((facts_json,))
                .map_err(|e| format!("Callback refresh error: {e}"))?;
            Ok(())
        }))
    }

    /// Extract pending hold operations from the JS context.
    fn extract_hold_ops(&self) -> Result<Vec<HoldOp>, String> {
        let body_ctx = self.body_ctx.as_ref().ok_or("No body context")?;
        let guard = body_ctx.lock().unwrap();
        guard.tokio_rt.block_on(guard.context.with(|ctx| Self::read_hold_ops(&ctx)))
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
}

impl Default for JsRuntime {
    fn default() -> Self {
        Self::new()
    }
}

/// Holds the QuickJS async runtime + context for body function execution.
/// Uses AsyncRuntime so that fetch() Promises can be driven via tokio.
/// Must be kept alive as long as any BodyFn closures reference it.
struct BodyContext {
    runtime: AsyncRuntime,
    context: AsyncContext,
    /// Tokio runtime for blocking on async operations from sync code (DBSP flat_map).
    tokio_rt: tokio::runtime::Runtime,
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
    // Try to extract as number first. QuickJS uses a tagged value representation
    // where integers and floats are distinct. rquickjs's as_number() handles both.
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

/// Build RuleSpecs from extracted rule data + shared body context.
fn build_rule_specs(
    rule_data: &[RuleData],
    shared: &Arc<Mutex<BodyContext>>,
) -> Vec<RuleSpec> {
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
                        // Use i32 for small numbers to ensure QuickJS stores as integer
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
                claim("omar", "is", "cool");
            "#,
            )
            .unwrap();

        assert_eq!(program.name, "test");
        assert_eq!(program.claims.len(), 1);
        assert_eq!(
            program.claims[0],
            Statement::new(vec![
                Term::sym("omar"),
                Term::sym("is"),
                Term::sym("cool")
            ])
        );
        assert!(program.rules.is_empty());
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

        // Call the body function with test bindings
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
        let results = (program.rules[0].body)(&bindings, true);
        assert_eq!(results.len(), 2);

        // With x = "alice", should produce 1 claim
        bindings.insert("x".to_string(), Term::sym("alice"));
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

        // Should have: omar is cool (+1), omar is awesome (+1)
        assert_eq!(result.deltas.len(), 2);
        assert!(result.deltas.iter().all(|(_, w)| *w == 1));
    }
}
