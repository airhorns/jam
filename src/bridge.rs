// swift_bridge macro generates casts that clippy flags
#![allow(clippy::unnecessary_cast)]

use crate::engine::{Engine, HoldKey};
use crate::js_runtime::JsRuntime;
use crate::rule::HoldOp;
use crate::term::{Statement, Term};
use crate::transpile;

/// Combined engine wrapper exposed to Swift via swift-bridge.
/// Owns both the DBSP Engine and the QuickJS JsRuntime.
pub struct JamEngine {
    engine: Engine,
    js_runtime: JsRuntime,
    /// Program ID of the most recently loaded program. Used for routing hold ops
    /// from callbacks to the correct program's hold key scope.
    active_program_id: Option<u64>,
}

impl Default for JamEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl JamEngine {
    pub fn new() -> Self {
        JamEngine {
            engine: Engine::new(),
            js_runtime: JsRuntime::new(),
            active_program_id: None,
        }
    }

    /// Load a TypeScript program. Returns the program ID as a string,
    /// or an error string prefixed with "ERROR: ".
    pub fn load_program(&mut self, name: &str, ts_source: &str) -> String {
        match self.js_runtime.load_program(name, ts_source) {
            Ok(program) => {
                // Extract hold ops before moving program
                let hold_ops: Vec<HoldOp> = program.hold_ops.clone();
                let id = self.engine.add_program(program);
                self.active_program_id = Some(id);

                // Apply any top-level hold operations
                for op in &hold_ops {
                    self.apply_hold_op(id, op);
                }

                // Apply any top-level assert/retract operations
                self.apply_pending_facts();

                id.to_string()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    /// Load a multi-file TypeScript program as ES modules.
    /// `files_json` is a JSON array of `[path, source]` pairs.
    /// The last file is the entry point.
    pub fn load_program_files(&mut self, name: &str, files_json: &str) -> String {
        let files: Vec<(String, String)> = match serde_json::from_str(files_json) {
            Ok(f) => f,
            Err(e) => return format!("ERROR: Invalid files JSON: {e}"),
        };
        let file_refs: Vec<(&str, &str)> = files.iter().map(|(p, s)| (p.as_str(), s.as_str())).collect();

        match self.js_runtime.load_program_files(name, &file_refs) {
            Ok(program) => {
                let hold_ops: Vec<HoldOp> = program.hold_ops.clone();
                let id = self.engine.add_program(program);
                self.active_program_id = Some(id);

                for op in &hold_ops {
                    self.apply_hold_op(id, op);
                }
                self.apply_pending_facts();

                id.to_string()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    /// Load a multi-file TypeScript program as ES modules (native Rust API).
    pub fn load_program_files_native(&mut self, name: &str, files: &[(&str, &str)]) -> String {
        match self.js_runtime.load_program_files(name, files) {
            Ok(program) => {
                let hold_ops: Vec<HoldOp> = program.hold_ops.clone();
                let id = self.engine.add_program(program);
                self.active_program_id = Some(id);

                for op in &hold_ops {
                    self.apply_hold_op(id, op);
                }
                self.apply_pending_facts();

                id.to_string()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    /// Fire an event callback by its full callback ID (e.g., "root/app/btn:onPress").
    pub fn fire_event_by_callback_id(&mut self, callback_id: &str) -> String {
        self.fire_callback_internal(callback_id, None)
    }

    /// Fire an event callback on an entity, optionally passing data (e.g., text from TextField).
    /// Callback IDs are deterministic: "entityId:eventName".
    pub fn fire_event(&mut self, entity_id: &str, event_name: &str) -> String {
        let callback_id = format!("{entity_id}:{event_name}");
        self.fire_callback_internal(&callback_id, None)
    }

    /// Fire an event with data (e.g., TextField onSubmit with the text value).
    pub fn fire_event_with_data(
        &mut self,
        entity_id: &str,
        event_name: &str,
        data: &str,
    ) -> String {
        let callback_id = format!("{entity_id}:{event_name}");
        self.fire_callback_internal(&callback_id, Some(data))
    }

    fn fire_callback_internal(&mut self, callback_id: &str, data: Option<&str>) -> String {
        match self.js_runtime.fire_callback(callback_id, data) {
            Ok(result) => {
                // Apply hold operations produced by the callback
                let pid = self.active_program_id.unwrap_or(0);
                for op in &result.hold_ops {
                    self.apply_hold_op(pid, op);
                }

                // Apply raw assert/retract operations
                for stmt in result.asserts {
                    self.engine.assert_fact(stmt);
                }
                for stmt in result.retracts {
                    self.engine.retract_fact(stmt);
                }

                // Step the engine to propagate changes
                self.step_json()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    fn apply_hold_op(&mut self, program_id: u64, op: &HoldOp) {
        let key = HoldKey {
            program_id,
            name: Some(op.key.clone()),
        };
        self.engine.hold(key, op.stmts.clone());
    }

    /// Read and apply pending assert/retract operations from the JS context.
    fn apply_pending_facts(&mut self) {
        let guard = self.js_runtime.shared.lock().unwrap();
        let asserts = guard.with(|ctx| crate::js_runtime::read_pending_facts(&ctx, "getAsserts").unwrap_or_default());
        let retracts = guard.with(|ctx| crate::js_runtime::read_pending_facts(&ctx, "getRetracts").unwrap_or_default());
        drop(guard);
        self.apply_pending_facts_from(asserts, retracts);
    }

    fn apply_pending_facts_from(&mut self, asserts: Vec<Statement>, retracts: Vec<Statement>) {
        for stmt in asserts {
            self.engine.assert_fact(stmt);
        }
        for stmt in retracts {
            self.engine.retract_fact(stmt);
        }
    }

    pub fn remove_program(&mut self, program_id: u64) {
        self.engine.remove_program(program_id);
    }

    /// Assert a fact from JSON. Returns empty string on success, or "ERROR: ..." on failure.
    pub fn assert_fact_json(&mut self, json: &str) -> String {
        match json_to_statement(json) {
            Ok(stmt) => {
                self.engine.assert_fact(stmt);
                String::new()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    /// Retract a fact from JSON. Returns empty string on success, or "ERROR: ..." on failure.
    pub fn retract_fact_json(&mut self, json: &str) -> String {
        match json_to_statement(json) {
            Ok(stmt) => {
                self.engine.retract_fact(stmt);
                String::new()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    /// Eval JS code in the shared context (for testing/scripting).
    /// Uses eval (not module eval) so globals are available without imports.
    /// Claims produced go to __topLevelClaims.
    pub fn eval_js(&mut self, code: &str) -> Result<(), String> {
        let js = transpile::transpile_ts_to_js(code, "eval.ts")?;
        let js = transpile::strip_imports(&js); // eval snippets don't have real imports

        let guard = self.js_runtime.shared.lock().unwrap();
        guard.with(|ctx| {
            ctx.eval::<(), _>("__jam.topLevelClaims.length = 0;").ok();
        });
        guard.eval(&js)?;
        guard.settle(std::time::Duration::from_secs(10));
        drop(guard);

        // Extract any new claims and add them as base facts
        let guard = self.js_runtime.shared.lock().unwrap();
        let claims = guard.with(|ctx| {
            let jam: rquickjs::Object = ctx.globals().get("__jam").unwrap();
            let claims_val: rquickjs::Value = jam.get("topLevelClaims").unwrap();
            crate::js_runtime::js_array_to_statements(&claims_val).unwrap_or_default()
        });
        // Extract hold ops and assert/retract ops
        let hold_ops = guard.with(|ctx| crate::js_runtime::read_hold_ops(&ctx).unwrap_or_default());
        let asserts = guard.with(|ctx| crate::js_runtime::read_pending_facts(&ctx, "getAsserts").unwrap_or_default());
        let retracts = guard.with(|ctx| crate::js_runtime::read_pending_facts(&ctx, "getRetracts").unwrap_or_default());
        drop(guard);

        for claim in claims {
            self.engine.assert_fact(claim);
        }

        // Apply hold operations
        let pid = self.active_program_id.unwrap_or(0);
        for op in &hold_ops {
            self.apply_hold_op(pid, op);
        }

        // Apply assert/retract operations
        self.apply_pending_facts_from(asserts, retracts);

        Ok(())
    }

    pub fn step_json(&mut self) -> String {
        let result = self.engine.step();
        let deltas: Vec<serde_json::Value> = result
            .deltas
            .iter()
            .map(|(stmt, weight)| {
                serde_json::json!({
                    "terms": statement_to_json(stmt),
                    "weight": weight
                })
            })
            .collect();
        serde_json::to_string(&deltas).unwrap_or_else(|_| "[]".to_string())
    }

    /// Collect any hold ops produced by async JS work (resolved promises, timers).
    /// drive() handles I/O in the background; this just reads accumulated results.
    /// Uses try_lock to avoid blocking the main thread if drive() is busy.
    /// Returns "CHANGED" if hold ops were applied, "EMPTY" otherwise.
    pub fn drain_async(&mut self) -> String {
        let guard = match self.js_runtime.shared.try_lock() {
            Ok(g) => g,
            Err(_) => return "BUSY".to_string(), // drive() is busy, try again later
        };
        guard.drain_jobs();

        let hold_ops = guard.with(|ctx| crate::js_runtime::read_hold_ops(&ctx).unwrap_or_default());
        let asserts = guard.with(|ctx| crate::js_runtime::read_pending_facts(&ctx, "getAsserts").unwrap_or_default());
        let retracts = guard.with(|ctx| crate::js_runtime::read_pending_facts(&ctx, "getRetracts").unwrap_or_default());
        drop(guard);

        let pid = self.active_program_id.unwrap_or(0);
        for op in &hold_ops {
            self.apply_hold_op(pid, op);
        }
        for stmt in &asserts {
            self.engine.assert_fact(stmt.clone());
        }
        for stmt in &retracts {
            self.engine.retract_fact(stmt.clone());
        }

        if !hold_ops.is_empty() || !asserts.is_empty() || !retracts.is_empty() {
            self.step_json();
            "CHANGED".to_string()
        } else {
            "EMPTY".to_string()
        }
    }

    pub fn eval_js_ffi(&mut self, code: &str) -> String {
        match self.eval_js(code) {
            Ok(()) => {
                self.step_json();
                "OK".to_string()
            }
            Err(e) => format!("ERROR: {e}"),
        }
    }

    pub fn current_facts_json(&self) -> String {
        let facts: Vec<serde_json::Value> =
            self.engine.current_facts().map(statement_to_json).collect();
        serde_json::to_string(&facts).unwrap_or_else(|_| "[]".to_string())
    }
}

// --- JSON ↔ Term conversion ---
// Uses a simplified format: JSON strings→Symbol, numbers→Int, bools→Bool, null→Nil

fn json_value_to_term(v: &serde_json::Value) -> Result<Term, String> {
    match v {
        serde_json::Value::String(s) => Ok(Term::Symbol(s.clone())),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(Term::Int(i))
            } else {
                Err(format!("Unsupported number: {n}"))
            }
        }
        serde_json::Value::Bool(b) => Ok(Term::Bool(*b)),
        serde_json::Value::Null => Ok(Term::Nil),
        _ => Err(format!("Unsupported JSON value: {v}")),
    }
}

fn json_to_statement(json: &str) -> Result<Statement, String> {
    let arr: Vec<serde_json::Value> =
        serde_json::from_str(json).map_err(|e| format!("Invalid JSON: {e}"))?;
    let terms: Result<Vec<Term>, String> = arr.iter().map(json_value_to_term).collect();
    Ok(Statement::new(terms?))
}

fn term_to_json(term: &Term) -> serde_json::Value {
    match term {
        Term::Nil => serde_json::Value::Null,
        Term::Symbol(s) => serde_json::Value::String(s.clone()),
        Term::Int(n) => serde_json::json!(n),
        Term::Str(s) => serde_json::Value::String(s.clone()),
        Term::Bool(b) => serde_json::Value::Bool(*b),
    }
}

fn statement_to_json(stmt: &Statement) -> serde_json::Value {
    serde_json::Value::Array(stmt.terms.iter().map(term_to_json).collect())
}

// --- swift-bridge FFI declarations ---

#[allow(clippy::unnecessary_cast)]
#[swift_bridge::bridge]
mod ffi {
    extern "Rust" {
        type JamEngine;

        #[swift_bridge(init)]
        fn new() -> JamEngine;

        fn load_program(&mut self, name: &str, ts_source: &str) -> String;

        fn load_program_files(&mut self, name: &str, files_json: &str) -> String;

        fn remove_program(&mut self, program_id: u64);

        fn assert_fact_json(&mut self, json: &str) -> String;

        fn retract_fact_json(&mut self, json: &str) -> String;

        fn step_json(&mut self) -> String;

        fn current_facts_json(&self) -> String;

        fn fire_event(&mut self, entity_id: &str, event_name: &str) -> String;

        fn fire_event_with_data(&mut self, entity_id: &str, event_name: &str, data: &str)
        -> String;

        fn eval_js_ffi(&mut self, code: &str) -> String;

        fn drain_async(&mut self) -> String;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_roundtrip() {
        let stmt = Statement::new(vec![
            Term::Symbol("counter".into()),
            Term::Symbol("count".into()),
            Term::Int(5),
        ]);
        let json = statement_to_json(&stmt);
        assert_eq!(json, serde_json::json!(["counter", "count", 5]));

        let back = json_to_statement(r#"["counter", "count", 5]"#).unwrap();
        assert_eq!(back, stmt);
    }

    #[test]
    fn test_engine_via_bridge() {
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim("hello", "world");
        "#;
        let program_id = engine.load_program("test", ts_source);
        assert_eq!(program_id, "1");

        let step_result = engine.step_json();
        let deltas: Vec<serde_json::Value> = serde_json::from_str(&step_result).unwrap();
        assert!(!deltas.is_empty());

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["hello", "world"]))
        );
    }

    #[test]
    fn test_assert_retract_via_json() {
        let mut engine = JamEngine::new();

        let result = engine.assert_fact_json(r#"["omar", "is", "cool"]"#);
        assert!(!result.starts_with("ERROR"));
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["omar", "is", "cool"]))
        );

        let result = engine.retract_fact_json(r#"["omar", "is", "cool"]"#);
        assert!(!result.starts_with("ERROR"));
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["omar", "is", "cool"]))
        );
    }

    #[test]
    fn test_child_claims() {
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim($this, "isa", "VStack");
            child("title", () => {
                claim($this, "isa", "Text");
                claim($this, "text", "Hello");
            });
        "#;
        let result = engine.load_program("test", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Root claims
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root", "isa", "VStack"]))
        );
        // Auto parent-child claim
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root", "child", "00000#title", "root/title"]))
        );
        // Child claims
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/title", "isa", "Text"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/title", "text", "Hello"]))
        );
    }

    #[test]
    fn test_nested_children() {
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim($this, "isa", "VStack");
            child("buttons", () => {
                claim($this, "isa", "HStack");
                child("dec", () => {
                    claim($this, "isa", "Button");
                    claim($this, "label", "-");
                });
                child("inc", () => {
                    claim($this, "isa", "Button");
                    claim($this, "label", "+");
                });
            });
        "#;
        let result = engine.load_program("test", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Root → buttons
        assert!(
            facts_arr.iter().any(
                |f| f == &serde_json::json!(["root", "child", "00000#buttons", "root/buttons"])
            )
        );
        // buttons → dec, inc
        assert!(
            facts_arr.iter().any(|f| f
                == &serde_json::json!(["root/buttons", "child", "00000#dec", "root/buttons/dec"]))
        );
        assert!(
            facts_arr.iter().any(|f| f
                == &serde_json::json!(["root/buttons", "child", "00001#inc", "root/buttons/inc"]))
        );
        // Nested entity properties
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons", "isa", "HStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/dec", "isa", "Button"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/dec", "label", "-"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/inc", "label", "+"]))
        );
    }

    #[test]
    fn test_child_in_when_with_reactive_data() {
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim($this, "isa", "VStack");
            when(["counter", "count", $.value], ({ value }) => {
                child("display", () => {
                    claim($this, "isa", "Text");
                    claim($this, "text", "Count: " + value);
                });
            });
        "#;
        let result = engine.load_program("test", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");

        // Assert initial counter value
        engine.assert_fact_json(r#"["counter", "count", 0]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // The when rule should have produced child claims
        assert!(
            facts_arr.iter().any(
                |f| f == &serde_json::json!(["root", "child", "00000#display", "root/display"])
            ),
            "missing child claim. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/display", "isa", "Text"])),
            "missing isa claim. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/display", "text", "Count: 0"])),
            "missing text claim. facts: {facts_arr:?}"
        );

        // Update counter: retract old, assert new
        engine.retract_fact_json(r#"["counter", "count", 0]"#);
        engine.assert_fact_json(r#"["counter", "count", 5]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Old text should be gone, new text should appear
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/display", "text", "Count: 0"])),
            "old text still present. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/display", "text", "Count: 5"])),
            "new text missing. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_component_function_pattern() {
        let mut engine = JamEngine::new();

        // Test that components as plain functions work
        let ts_source = r#"
            function MyButton(label, action) {
                claim($this, "isa", "Button");
                claim($this, "label", label);
                claim($this, "action", action);
            }

            claim($this, "isa", "HStack");
            child("save", () => MyButton("Save", "save"));
            child("cancel", () => MyButton("Cancel", "cancel"));
        "#;
        let result = engine.load_program("test", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/save", "isa", "Button"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/save", "label", "Save"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/save", "action", "save"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/cancel", "label", "Cancel"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/cancel", "action", "cancel"]))
        );
    }

    #[test]
    fn test_counter_app_full_pipeline() {
        let mut engine = JamEngine::new();

        // This is the actual counter.ts program
        let ts_source = r#"
            function CounterButton(label, action) {
                claim($this, "isa", "Button");
                claim($this, "label", label);
                claim($this, "action", action);
            }

            claim($this, "isa", "VStack");

            child("title", () => {
                claim($this, "isa", "Text");
                claim($this, "text", "Jam Counter");
                claim($this, "font", "title");
            });

            when(["counter", "count", $.value], ({ value }) => {
                child("count-display", () => {
                    claim($this, "isa", "Text");
                    claim($this, "text", "Count: " + value);
                    claim($this, "font", "largeTitle");
                });
            });

            child("buttons", () => {
                claim($this, "isa", "HStack");
                child("dec", () => CounterButton("-", "decrement"));
                child("inc", () => CounterButton("+", "increment"));
            });
        "#;

        let result = engine.load_program("counter", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");

        // Assert initial counter
        engine.assert_fact_json(r#"["counter", "count", 0]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Verify the complete UI tree
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root", "isa", "VStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/title", "text", "Jam Counter"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/title", "font", "title"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/count-display", "text", "Count: 0"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/count-display", "font", "largeTitle"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons", "isa", "HStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/dec", "label", "-"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/inc", "label", "+"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/inc", "action", "increment"]))
        );

        // Simulate increment: retract old count, assert new
        engine.retract_fact_json(r#"["counter", "count", 0]"#);
        engine.assert_fact_json(r#"["counter", "count", 1]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Counter display should update reactively
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/count-display", "text", "Count: 0"])),
            "old count still present"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/count-display", "text", "Count: 1"])),
            "new count missing"
        );

        // Static elements should still be there
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/title", "text", "Jam Counter"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/buttons/dec", "label", "-"]))
        );
    }

    #[test]
    fn test_load_error_handling() {
        let mut engine = JamEngine::new();
        let result = engine.load_program("bad", "this is not valid javascript {{{{");
        assert!(result.starts_with("ERROR"), "expected error, got: {result}");
    }

    #[test]
    fn test_invalid_json_error() {
        let mut engine = JamEngine::new();
        let result = engine.assert_fact_json("not json");
        assert!(result.starts_with("ERROR"), "expected error, got: {result}");
    }

    // ========================================================================
    // JSX tests
    // ========================================================================

    #[test]
    fn test_jsx_basic_render() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <VStack>
                    <Text key="title" font="title">Hello World</Text>
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Root VStack
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0", "isa", "VStack"])),
            "missing VStack. facts: {facts_arr:?}"
        );
        // Child Text with key
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0/title", "isa", "Text"])),
            "missing Text. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0/title", "font", "title"])),
            "missing font. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0/title", "text", "Hello World"])),
            "missing text content. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_jsx_nested_layout() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <VStack key="root-stack">
                    <HStack key="buttons">
                        <Button key="a" label="A" />
                        <Button key="b" label="B" />
                    </HStack>
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/root-stack", "isa", "VStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/root-stack/buttons", "isa", "HStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/root-stack/buttons/a", "isa", "Button"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/root-stack/buttons/a", "label", "A"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/root-stack/buttons/b", "label", "B"]))
        );
    }

    #[test]
    fn test_jsx_button_with_children() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <Button key="btn" label="">
                    <HStack key="inner" spacing={8}>
                        <Text key="t1" font="body">Hello</Text>
                    </HStack>
                </Button>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        eprintln!("Button children facts: {facts}");
        assert!(facts.contains("inner"), "should have inner HStack: {facts}");
        assert!(facts.contains("Hello"), "should have text content: {facts}");
    }

    #[test]
    fn test_jsx_button_children_in_when() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            claim("item", "x", "name", "hello");

            render(
                <VStack key="root">
                    {when(["item", $.id, "name", $.name], ({ id, name }) => (
                        <Button key={`btn-${id}`} label="">
                            <HStack key={`inner-${id}`} spacing={8}>
                                <Text key="label" font="body">{name}</Text>
                            </HStack>
                        </Button>
                    ))}
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        eprintln!("When button children: {facts}");
        assert!(facts.contains("btn-x"), "should have button: {facts}");
        assert!(
            facts.contains("inner-x"),
            "should have inner HStack child: {facts}"
        );
        assert!(facts.contains("hello"), "should have text content: {facts}");
    }

    #[test]
    fn test_jsx_custom_component() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            function MyButton(props) {
                return <Button label={props.label} />;
            }

            render(
                <HStack key="row">
                    <MyButton key="save" label="Save" />
                    <MyButton key="cancel" label="Cancel" />
                </HStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Custom components are transparent — the Button is what gets rendered
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/row/save", "isa", "Button"])),
            "missing save button. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/row/save", "label", "Save"])),
            "missing save label. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/row/cancel", "label", "Cancel"])),
            "missing cancel label. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_jsx_when_in_tree() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <VStack key="main">
                    <Text key="title">Static Title</Text>
                    {when(["counter", "count", $.value], ({ value }) =>
                        <Text key="display" font="largeTitle">{"Count: " + value}</Text>
                    )}
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");

        engine.assert_fact_json(r#"["counter", "count", 42]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Static title
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/main/title", "text", "Static Title"])),
            "missing static title. facts: {facts_arr:?}"
        );
        // Reactive display from when
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/main/display", "text", "Count: 42"])),
            "missing reactive display. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/main/display", "font", "largeTitle"])),
            "missing font on reactive display. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_jsx_when_reactive_update() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <VStack key="main">
                    {when(["data", "value", $.v], ({ v }) =>
                        <Text key="val">{"Value: " + v}</Text>
                    )}
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");

        // Initial value
        engine.assert_fact_json(r#"["data", "value", 10]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/main/val", "text", "Value: 10"]))
        );

        // Update value — old should retract, new should appear
        engine.retract_fact_json(r#"["data", "value", 10]"#);
        engine.assert_fact_json(r#"["data", "value", 99]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/main/val", "text", "Value: 10"])),
            "old value still present"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/main/val", "text", "Value: 99"])),
            "new value missing"
        );
    }

    #[test]
    fn test_jsx_counter_full_pipeline() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            function CounterButton(props) {
                return <Button label={props.label} />;
            }

            render(
                <VStack key="app">
                    <Text key="title" font="title">Jam Counter</Text>
                    {when(["counter", "count", $.value], ({ value }) =>
                        <Text key="display" font="largeTitle">{"Count: " + value}</Text>
                    )}
                    <HStack key="buttons">
                        <CounterButton key="dec" label="-" />
                        <CounterButton key="inc" label="+" />
                    </HStack>
                </VStack>
            );
        "#;

        let result = engine.load_program("counter.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");

        engine.assert_fact_json(r#"["counter", "count", 0]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Full tree verification
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app", "isa", "VStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/title", "font", "title"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/title", "text", "Jam Counter"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 0"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/buttons", "isa", "HStack"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/buttons/dec", "label", "-"]))
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/buttons/inc", "label", "+"]))
        );

        // Increment
        engine.retract_fact_json(r#"["counter", "count", 0]"#);
        engine.assert_fact_json(r#"["counter", "count", 1]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 1"]))
        );
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 0"]))
        );
    }

    #[test]
    fn test_jsx_auto_indexing() {
        let mut engine = JamEngine::new();

        // No explicit keys — should auto-index
        let tsx = r#"
            render(
                <VStack>
                    <Text>First</Text>
                    <Text>Second</Text>
                    <Text>Third</Text>
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Auto-indexed children
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0/0", "text", "First"])),
            "missing First. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0/1", "text", "Second"])),
            "missing Second. facts: {facts_arr:?}"
        );
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/0/2", "text", "Third"])),
            "missing Third. facts: {facts_arr:?}"
        );
    }

    // ========================================================================
    // Hold + onPress + fire_event tests
    // ========================================================================

    #[test]
    fn test_hold_initial_state() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("mystate", () => { claim("greeting", "is", "hello"); });
            render(<Text key="msg">hi</Text>);
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["greeting", "is", "hello"])),
            "hold state missing. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_onpress_registers_callback() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <Button key="btn" label="Click" onPress={() => {}} />
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // onPress should have a deterministic callback ID: "entityId:eventName"
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/btn", "onPress", "root/btn:onPress"])),
            "onPress callback ID missing. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_fire_event_invokes_callback() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("state", () => { claim("clicked", false); });
            render(
                <Button key="btn" label="Click" onPress={() => {
                    hold("state", () => { claim("clicked", true); });
                }} />
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Before click
        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["clicked", false])),
            "initial state wrong. facts: {facts_arr:?}"
        );

        // Fire the button press
        let result = engine.fire_event("root/btn", "onPress");
        assert!(!result.starts_with("ERROR"), "fire_event failed: {result}");

        // After click
        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["clicked", true])),
            "callback didn't fire. facts: {facts_arr:?}"
        );
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["clicked", false])),
            "old state not retracted. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_self_contained_counter() {
        // The counter program owns ALL state and logic — no Swift-side counter management
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("counter", () => { claim("counter", "count", 0); });

            render(
                <VStack key="app">
                    {when(["counter", "count", $.value], ({ value }) =>
                        <>
                            <Text key="display" font="largeTitle">{"Count: " + value}</Text>
                            <HStack key="buttons">
                                <Button key="dec" label="-" onPress={() => {
                                    hold("counter", () => { claim("counter", "count", value - 1); });
                                }} />
                                <Button key="inc" label="+" onPress={() => {
                                    hold("counter", () => { claim("counter", "count", value + 1); });
                                }} />
                            </HStack>
                        </>
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("counter.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Initial state: count = 0
        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 0"])),
            "initial count wrong. facts: {facts_arr:?}"
        );

        // Press increment
        let result = engine.fire_event("root/app/buttons/inc", "onPress");
        assert!(!result.starts_with("ERROR"), "fire_event failed: {result}");

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 1"])),
            "count didn't increment. facts: {facts_arr:?}"
        );
        assert!(
            !facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 0"])),
            "old count not retracted. facts: {facts_arr:?}"
        );

        // Press increment again
        engine.fire_event("root/app/buttons/inc", "onPress");
        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 2"])),
            "second increment failed. facts: {facts_arr:?}"
        );

        // Press decrement
        engine.fire_event("root/app/buttons/dec", "onPress");
        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(
            facts_arr
                .iter()
                .any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 1"])),
            "decrement failed. facts: {facts_arr:?}"
        );
    }

    #[test]
    fn test_counter_increment_decrement_cycle() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("counter", () => { claim("counter", "count", 0); });

            render(
                <VStack key="app">
                    {when(["counter", "count", $.value], ({ value }) =>
                        <>
                            <Text key="display" font="largeTitle">{"Count: " + value}</Text>
                            <HStack key="buttons">
                                <Button key="dec" label="-" onPress={() => {
                                    hold("counter", () => { claim("counter", "count", value - 1); });
                                }} />
                                <Button key="inc" label="+" onPress={() => {
                                    hold("counter", () => { claim("counter", "count", value + 1); });
                                }} />
                            </HStack>
                        </>
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("counter.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Increment 3 times
        for expected in 1..=3 {
            engine.fire_event("root/app/buttons/inc", "onPress");
            let facts = engine.current_facts_json();
            let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
            assert!(
                facts_arr.iter().any(|f| f
                    == &serde_json::json!([
                        "root/app/display",
                        "text",
                        format!("Count: {expected}")
                    ])),
                "after increment {expected}, expected Count: {expected}. facts: {facts_arr:?}"
            );
        }

        // Decrement 3 times
        for i in 0..3 {
            let expected = 2 - i; // 2, 1, 0
            engine.fire_event("root/app/buttons/dec", "onPress");
            let facts = engine.current_facts_json();
            let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
            assert!(
                facts_arr.iter().any(|f| f
                    == &serde_json::json!([
                        "root/app/display",
                        "text",
                        format!("Count: {expected}")
                    ])),
                "after decrement, expected Count: {expected}. facts: {facts_arr:?}"
            );
        }
    }

    #[test]
    fn test_hold_closure_type_preservation() {
        // Minimal repro: set a binding from Rust, capture in closure, call from Rust
        let mut engine = JamEngine::new();

        // This program uses imperative style (no JSX) to test the closure
        let ts = r#"
            hold("s", () => { claim("val", 0); });

            when(["val", $.v], ({ v }) => {
                // Register a callback that closes over v
                child("btn", () => {
                    claim($this, "isa", "Button");
                    claim($this, "label", "go");
                    claim($this, "captured_type", typeof v);
                    claim($this, "captured_value", v);
                });
            });
        "#;

        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        eprintln!("facts: {f}");
        // Check what type the captured v has
        assert!(
            f.contains("\"captured_type\",\"number\""),
            "v should be number type: {f}"
        );
    }

    #[test]
    fn test_hold_number_from_dbsp_binding() {
        // Test: closure over a DBSP binding captures the number correctly
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("val", 0); });
            render(
                <VStack key="x">
                    {when(["val", $.v], ({ v }) =>
                        <Button key="btn" label="go" onPress={() => {
                            hold("s", () => { claim("val", v + 1); });
                        }} />
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Initial: val should be 0 (number)
        let f = engine.current_facts_json();
        assert!(f.contains("[\"val\",0]"), "initial: {f}");

        // Press: v=0, v+1=1 → should be number 1
        engine.fire_event("root/x/btn", "onPress");
        let f = engine.current_facts_json();
        assert!(
            f.contains("[\"val\",1]"),
            "after 1st press should be number 1: {f}"
        );

        // Press again: v=1, v+1=2 → should be number 2
        engine.fire_event("root/x/btn", "onPress");
        let f = engine.current_facts_json();
        assert!(
            f.contains("[\"val\",2]"),
            "after 2nd press should be number 2: {f}"
        );
    }

    #[test]
    fn test_three_term_pattern_refresh() {
        // Minimal repro: 3-term pattern with hold, fire_event, check value type
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("a", "b", 0); });
            render(
                <VStack key="x">
                    {when(["a", "b", $.v], ({ v }) =>
                        <>
                            <Text key="d">{"v=" + v + " type=" + typeof v}</Text>
                            <Button key="btn" label="go" onPress={() => {
                                hold("s", () => { claim("a", "b", v + 1); });
                            }} />
                        </>
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        eprintln!("initial: {f}");
        assert!(f.contains("\"v=0 type=number\""), "initial: {f}");

        engine.fire_event("root/x/btn", "onPress");
        let f = engine.current_facts_json();
        eprintln!("after 1st press: {f}");
        assert!(f.contains("\"v=1 type=number\""), "after 1st: {f}");

        engine.fire_event("root/x/btn", "onPress");
        let f = engine.current_facts_json();
        eprintln!("after 2nd press: {f}");
        assert!(f.contains("\"v=2 type=number\""), "after 2nd: {f}");
    }

    #[test]
    fn test_two_button_closures() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("v", () => { claim("v", 0); });

            render(
                <VStack key="app">
                    {when(["v", $.n], ({ n }) =>
                        <>
                            <Text key="d">{"n=" + n}</Text>
                            <Button key="inc" label="+" onPress={() => {
                                hold("v", () => { claim("v", n + 1); });
                            }} />
                            <Button key="dec" label="-" onPress={() => {
                                hold("v", () => { claim("v", n - 1); });
                            }} />
                        </>
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // n=0, inc → n=1
        engine.fire_event("root/app/inc", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains("\"n=1\""), "expected n=1: {f}");

        // n=1, dec → n=0
        engine.fire_event("root/app/dec", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains("\"n=0\""), "expected n=0: {f}");

        // n=0, inc → n=1
        engine.fire_event("root/app/inc", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains("\"n=1\""), "expected n=1 again: {f}");

        // n=1, inc → n=2
        engine.fire_event("root/app/inc", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains("\"n=2\""), "expected n=2: {f}");

        // n=2, dec → n=1
        engine.fire_event("root/app/dec", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains("\"n=1\""), "expected n=1 after dec from 2: {f}");

        // n=1, dec → n=0
        engine.fire_event("root/app/dec", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains("\"n=0\""), "expected n=0 after second dec: {f}");
    }

    #[test]
    fn test_callback_closure_updates() {
        // Minimal test: verify callbacks get fresh closures after each step
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("val", () => { claim("val", 0); });

            render(
                <VStack key="app">
                    {when(["val", $.v], ({ v }) =>
                        <>
                            <Text key="display">{"v=" + v}</Text>
                            <Button key="inc" label="+" onPress={() => {
                                hold("val", () => { claim("val", v + 1); });
                            }} />
                        </>
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // v=0
        let facts_json = engine.current_facts_json();
        assert!(
            facts_json.contains("\"v=0\""),
            "expected v=0, got: {facts_json}"
        );

        // Press: 0→1
        engine.fire_event("root/app/inc", "onPress");
        let facts_json = engine.current_facts_json();
        assert!(
            facts_json.contains("\"v=1\""),
            "expected v=1 after first press, got: {facts_json}"
        );

        // Press: 1→2
        engine.fire_event("root/app/inc", "onPress");
        let facts_json = engine.current_facts_json();
        assert!(
            facts_json.contains("\"v=2\""),
            "expected v=2 after second press, got: {facts_json}"
        );

        // Press: 2→3
        engine.fire_event("root/app/inc", "onPress");
        let facts_json = engine.current_facts_json();
        assert!(
            facts_json.contains("\"v=3\""),
            "expected v=3 after third press, got: {facts_json}"
        );

        // Press: 3→4
        engine.fire_event("root/app/inc", "onPress");
        let facts_json = engine.current_facts_json();
        assert!(
            facts_json.contains("\"v=4\""),
            "expected v=4 after fourth press, got: {facts_json}"
        );
    }

    #[test]
    fn test_fire_event_nonexistent_callback() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(<Text key="msg">No buttons here</Text>);
        "#;
        engine.load_program("test.tsx", tsx);
        let _ = engine.step_json();

        let result = engine.fire_event("root/nonexistent", "onPress");
        assert!(
            result.starts_with("ERROR"),
            "expected error for missing callback, got: {result}"
        );
    }

    #[test]
    fn test_claim_inside_callback_is_error() {
        // claim() inside a callback is a runtime error — use hold() instead.
        // Claims have no lifecycle management in callbacks (no automatic retraction).
        let mut engine = JamEngine::new();

        let tsx = r#"
            render(
                <Button key="btn" label="Add" onPress={() => {
                    claim("added", "fact", "from", "callback");
                }} />
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Press the button — the callback calls claim(), which should error
        let result = engine.fire_event("root/btn", "onPress");
        assert!(
            result.starts_with("ERROR"),
            "claim() in callback should produce an error: {result}"
        );
    }

    #[test]
    fn test_hold_with_multiple_claims() {
        // hold() callback can make multiple claims, all managed as a unit
        let mut engine = JamEngine::new();
        let ts = r#"
            hold("person", () => {
                claim("name", "Alice");
                claim("age", 30);
                claim("role", "engineer");
            });
        "#;
        engine.load_program("test", ts);
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""name","Alice""#), "name: {f}");
        assert!(f.contains(r#""age",30"#), "age: {f}");
        assert!(f.contains(r#""role","engineer""#), "role: {f}");
    }

    #[test]
    fn test_hold_replaces_all_previous_claims() {
        // When hold() is called again with same key, ALL old facts are retracted
        let mut engine = JamEngine::new();
        let ts = r#"
            hold("data", () => {
                claim("a", 1);
                claim("b", 2);
                claim("c", 3);
            });
        "#;
        engine.load_program("test", ts);
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""a",1"#), "initial a: {f}");
        assert!(f.contains(r#""b",2"#), "initial b: {f}");
        assert!(f.contains(r#""c",3"#), "initial c: {f}");

        // Replace with different claims
        engine
            .eval_js(
                r#"
            hold("data", () => {
                claim("x", 10);
                claim("y", 20);
            });
        "#,
            )
            .unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""x",10"#), "new x: {f}");
        assert!(f.contains(r#""y",20"#), "new y: {f}");
        assert!(!f.contains(r#""a",1"#), "old a retracted: {f}");
        assert!(!f.contains(r#""b",2"#), "old b retracted: {f}");
        assert!(!f.contains(r#""c",3"#), "old c retracted: {f}");
    }

    #[test]
    fn test_hold_with_conditional_claims() {
        // hold() can use if/else logic inside the callback
        let mut engine = JamEngine::new();
        let ts = r#"
            let showDetails = false;
            hold("profile", () => {
                claim("user", "name", "Bob");
                if (showDetails) {
                    claim("user", "email", "bob@example.com");
                    claim("user", "phone", "555-1234");
                }
            });
        "#;
        engine.load_program("test", ts);
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""name","Bob""#), "name: {f}");
        assert!(!f.contains("email"), "no email initially: {f}");

        // Toggle showDetails and re-hold
        engine
            .eval_js(
                r#"
            showDetails = true;
            hold("profile", () => {
                claim("user", "name", "Bob");
                if (showDetails) {
                    claim("user", "email", "bob@example.com");
                    claim("user", "phone", "555-1234");
                }
            });
        "#,
            )
            .unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""name","Bob""#), "name still: {f}");
        assert!(f.contains("bob@example.com"), "email now shown: {f}");
        assert!(f.contains("555-1234"), "phone now shown: {f}");
    }

    #[test]
    fn test_hold_with_loop() {
        // hold() can use loops to generate multiple claims
        let mut engine = JamEngine::new();
        let ts = r#"
            hold("numbers", () => {
                for (let i = 1; i <= 3; i++) {
                    claim("number", i);
                }
            });
        "#;
        engine.load_program("test", ts);
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""number",1"#), "1: {f}");
        assert!(f.contains(r#""number",2"#), "2: {f}");
        assert!(f.contains(r#""number",3"#), "3: {f}");
    }

    #[test]
    fn test_hold_empty_retracts_all() {
        // hold(() => {}) with no claims retracts everything under that key
        let mut engine = JamEngine::new();
        let ts = r#"
            hold("data", () => {
                claim("exists", true);
            });
        "#;
        engine.load_program("test", ts);
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""exists",true"#), "exists initially: {f}");

        engine
            .eval_js(
                r#"
            hold("data", () => {}); // empty = retract all
        "#,
            )
            .unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(!f.contains(r#""exists""#), "retracted: {f}");
    }

    #[test]
    fn test_hold_inside_callback_works() {
        // hold() is the correct way to mutate state from callbacks
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("value", "before"); });
            render(
                <Button key="btn" label="Update" onPress={() => {
                    hold("s", () => { claim("value", "after"); });
                }} />
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""value","before""#), "initial: {f}");

        engine.fire_event("root/btn", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""value","after""#), "hold should work: {f}");
        assert!(
            !f.contains(r#""value","before""#),
            "old value retracted: {f}"
        );
    }

    #[test]
    fn test_hold_from_callback_triggers_when_rerender() {
        // hold() from a callback should trigger when() rules to re-derive UI
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("items", () => {});
            render(
                <VStack key="app">
                    <Button key="add" label="Add" onPress={() => {
                        hold("items", () => { claim("item", "first"); });
                    }} />
                    {when(["item", $.name], ({ name }) =>
                        <Text key={"item-" + name}>{name}</Text>
                    )}
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Initially no items
        let f = engine.current_facts_json();
        assert!(!f.contains(r#""text","first""#), "no items initially: {f}");

        // Press add — hold creates a new fact, when() fires, Text renders
        engine.fire_event("root/app/add", "onPress");
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""text","first""#),
            "item should render after hold: {f}"
        );
    }

    #[test]
    fn test_hold_from_callback_with_data() {
        // TextField onSubmit passes data which hold() uses to create state
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("msg", () => {});
            render(
                <VStack key="app">
                    <TextField key="input" placeholder="Type..."
                        onSubmit={(text) => {
                            hold("msg", () => { claim("message", text); });
                        }}
                    />
                    {when(["message", $.text], ({ text }) =>
                        <Text key="display">{text}</Text>
                    )}
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Submit text via TextField
        engine.fire_event_with_data("root/app/input", "onSubmit", "Hello from TextField");

        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""text","Hello from TextField""#),
            "submitted text should render via when: {f}"
        );
    }

    #[test]
    fn test_hold_accumulation_via_separate_keys() {
        // Multiple hold() calls with different keys accumulate facts
        let mut engine = JamEngine::new();

        let tsx = r#"
            let counter = 0;
            render(
                <VStack key="app">
                    <Button key="add" label="Add" onPress={() => {
                        counter++;
                        hold("item-" + counter, () => { claim("item", "item-" + counter); });
                    }} />
                    {when(["item", $.name], ({ name }) =>
                        <Text key={"t-" + name}>{name}</Text>
                    )}
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Add three items
        engine.fire_event("root/app/add", "onPress");
        engine.fire_event("root/app/add", "onPress");
        engine.fire_event("root/app/add", "onPress");

        let f = engine.current_facts_json();
        assert!(f.contains(r#""text","item-1""#), "item 1: {f}");
        assert!(f.contains(r#""text","item-2""#), "item 2: {f}");
        assert!(f.contains(r#""text","item-3""#), "item 3: {f}");
    }

    #[test]
    fn test_fire_event_with_data() {
        // Callback receives data argument (e.g., text from TextField onSubmit)
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("submitted", ""); });
            render(
                <VStack key="app">
                    <TextField key="input" placeholder="Type..." onSubmit={(text) => {
                        hold("s", () => { claim("submitted", text); });
                    }} />
                </VStack>
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Fire onSubmit with data
        let result = engine.fire_event_with_data("root/app/input", "onSubmit", "Hello world");
        assert!(
            !result.starts_with("ERROR"),
            "fire_event_with_data failed: {result}"
        );

        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""submitted","Hello world""#),
            "callback should receive text data: {f}"
        );
    }

    #[test]
    fn test_fire_event_with_data_no_data_fallback() {
        // When no data is passed, callback still works (data is undefined)
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("pressed", false); });
            render(
                <Button key="btn" label="Go" onPress={() => {
                    hold("s", () => { claim("pressed", true); });
                }} />
            );
        "#;
        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Fire without data (regular fire_event)
        engine.fire_event("root/btn", "onPress");
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""pressed",true"#),
            "no-data callback should work: {f}"
        );
    }

    // ========================================================================
    // Callback property tests
    // ========================================================================

    #[test]
    fn test_any_function_prop_is_callback() {
        // Callbacks aren't limited to onPress — any function prop works
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("toggled", false); });
            render(
                <VStack key="app">
                    <Button key="btn" label="Toggle"
                        onPress={() => { hold("s", () => { claim("toggled", true); }); }}
                        onLongPress={() => { hold("s", () => { claim("toggled", "long"); }); }}
                        onDoubleTap={() => { hold("s", () => { claim("toggled", "double"); }); }}
                    />
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // All three callbacks should have deterministic callback IDs
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""onPress","root/app/btn:onPress""#),
            "onPress callback missing: {f}"
        );
        assert!(
            f.contains(r#""onLongPress","root/app/btn:onLongPress""#),
            "onLongPress callback missing: {f}"
        );
        assert!(
            f.contains(r#""onDoubleTap","root/app/btn:onDoubleTap""#),
            "onDoubleTap callback missing: {f}"
        );

        // Fire onPress
        engine.fire_event("root/app/btn", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""toggled",true"#), "onPress didn't fire: {f}");

        // Reset and fire onLongPress
        engine.fire_event("root/app/btn", "onLongPress");
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""toggled","long""#),
            "onLongPress didn't fire: {f}"
        );

        // Fire onDoubleTap
        engine.fire_event("root/app/btn", "onDoubleTap");
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""toggled","double""#),
            "onDoubleTap didn't fire: {f}"
        );
    }

    #[test]
    fn test_custom_callback_names() {
        // Callbacks can have any name, not just "on*"
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("state", "idle"); });
            render(
                <VStack key="app">
                    <Button key="btn" label="X"
                        activate={() => { hold("s", () => { claim("state", "active"); }); }}
                        dismiss={() => { hold("s", () => { claim("state", "dismissed"); }); }}
                    />
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Custom callback names work — IDs are entityId:propName
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""activate","root/app/btn:activate""#),
            "activate callback missing: {f}"
        );
        assert!(
            f.contains(r#""dismiss","root/app/btn:dismiss""#),
            "dismiss callback missing: {f}"
        );

        engine.fire_event("root/app/btn", "activate");
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""state","active""#),
            "activate didn't fire: {f}"
        );

        engine.fire_event("root/app/btn", "dismiss");
        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""state","dismissed""#),
            "dismiss didn't fire: {f}"
        );
    }

    #[test]
    fn test_multiple_entities_with_independent_callbacks() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("s", () => { claim("a", 0); claim("b", 0); });
            render(
                <HStack key="row">
                    <Button key="inc-a" label="A+" onPress={() => {
                        hold("s", () => { claim("a", 1); claim("b", 0); });
                    }} />
                    <Button key="inc-b" label="B+" onPress={() => {
                        hold("s", () => { claim("a", 0); claim("b", 1); });
                    }} />
                </HStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Press A
        engine.fire_event("root/row/inc-a", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#"["a",1]"#), "A should be 1: {f}");
        assert!(f.contains(r#"["b",0]"#), "B should still be 0: {f}");

        // Press B
        engine.fire_event("root/row/inc-b", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#"["a",0]"#), "A should be 0: {f}");
        assert!(f.contains(r#"["b",1]"#), "B should be 1: {f}");
    }

    #[test]
    fn test_callback_inside_custom_component() {
        let mut engine = JamEngine::new();

        let tsx = r#"
            function ActionButton(props) {
                return <Button label={props.label} onPress={props.onPress} />;
            }

            hold("s", () => { claim("count", 0); });
            render(
                <VStack key="app">
                    {when(["count", $.n], ({ n }) =>
                        <>
                            <Text key="display">{"n=" + n}</Text>
                            <ActionButton key="inc" label="+"
                                onPress={() => { hold("s", () => { claim("count", n + 1); }); }} />
                            <ActionButton key="dec" label="-"
                                onPress={() => { hold("s", () => { claim("count", n - 1); }); }} />
                        </>
                    )}
                </VStack>
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""n=0""#), "initial: {f}");

        // Inc twice
        engine.fire_event("root/app/inc", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""n=1""#), "after inc 1: {f}");

        engine.fire_event("root/app/inc", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""n=2""#), "after inc 2: {f}");

        // Dec twice
        engine.fire_event("root/app/dec", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""n=1""#), "after dec 1: {f}");

        engine.fire_event("root/app/dec", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""n=0""#), "after dec 2: {f}");
    }

    #[test]
    fn test_callback_with_multiple_hold_keys() {
        // A single callback can update multiple independent hold keys
        let mut engine = JamEngine::new();

        let tsx = r#"
            hold("pos", () => { claim("x", 0); });
            hold("vel", () => { claim("dx", 1); });
            render(
                <Button key="step" label="Step" onPress={() => {
                    hold("pos", () => { claim("x", 99); });
                    hold("vel", () => { claim("dx", -1); });
                }} />
            );
        "#;

        let result = engine.load_program("test.tsx", tsx);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#"["x",0]"#), "initial x: {f}");
        assert!(f.contains(r#"["dx",1]"#), "initial dx: {f}");

        engine.fire_event("root/step", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#"["x",99]"#), "x should be 99: {f}");
        assert!(f.contains(r#"["dx",-1]"#), "dx should be -1: {f}");
    }

    // ========================================================================
    // LLRT module tests
    // ========================================================================

    #[test]
    fn test_console_log_works() {
        // console.log should not crash — it's wired up via LLRT
        let mut engine = JamEngine::new();

        let ts = r#"
            console.log("hello from jam!");
            console.error("error test");
            console.warn("warn test");
            claim("console", "works");
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""console","works""#),
            "program should run: {f}"
        );
    }

    #[test]
    fn test_fetch_is_available() {
        // fetch() should be available as a global function
        let mut engine = JamEngine::new();

        let ts = r#"
            claim("fetch_type", typeof fetch);
            claim("fetch_exists", typeof fetch === "function");
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""fetch_type","function""#),
            "fetch should be a function: {f}"
        );
        assert!(
            f.contains(r#""fetch_exists",true"#),
            "fetch should exist: {f}"
        );
    }

    #[test]
    fn test_fetch_returns_promise() {
        // fetch() should return a Promise that we can .then() on
        let mut engine = JamEngine::new();

        let ts = r#"
            const p = fetch("http://localhost:1/nonexistent");
            claim("promise_type", typeof p);
            claim("has_then", typeof p.then === "function");

            // Catch the error (connection refused) to prevent unhandled rejection
            p.catch(() => {});
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(
            f.contains(r#""promise_type","object""#),
            "fetch should return an object: {f}"
        );
        assert!(
            f.contains(r#""has_then",true"#),
            "fetch result should have .then(): {f}"
        );
    }

    #[test]
    fn test_fetch_resolves_with_then() {
        // Test that fetch().then() chains resolve during load_program's idle()
        let mut engine = JamEngine::new();

        let ts = r#"
            fetch("https://httpbin.org/get")
                .then(response => {
                    claim("status", response.status);
                    claim("ok", response.ok);
                })
                .catch(err => {
                    claim("fetch_error", String(err));
                });
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        let has_status = f.contains(r#""status""#);
        let has_error = f.contains(r#""fetch_error""#);
        assert!(
            has_status || has_error,
            "fetch should produce status or error claim: {f}"
        );
    }

    #[test]
    fn test_drain_async_completes_callback_fetch() {
        // Test that drain_async can drive a fetch started in a callback
        let mut engine = JamEngine::new();

        let ts = r#"
            render(
                <Button key="btn" label="Go" onPress={() => {
                    fetch("http://localhost:2468/v1/health")
                        .then(r => r.text())
                        .then(data => {
                            hold("result", () => { claim("fetch", "done", data); });
                        })
                        .catch(e => {
                            hold("result", () => { claim("fetch", "error", String(e)); });
                        });
                }} />
            );
        "#;
        let result = engine.load_program("test.tsx", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Fire the button callback (starts async fetch)
        engine.fire_event("root/btn", "onPress");

        // drain_async should drive the fetch to completion
        for _ in 0..100 {
            let status = engine.drain_async();
            if status == "IDLE" {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        eprintln!("Drain async facts: {f}");
        assert!(
            f.contains("fetch"),
            "drain_async should have completed the fetch: {f}"
        );
    }

    // ========================================================================
    // Child ordering tests — verify JSX source order is preserved
    // ========================================================================

    /// Helper: extract children of a parent entity from facts JSON,
    /// returning (sortKey, childId) pairs sorted by sortKey.
    fn get_children(facts: &str, parent_id: &str) -> Vec<(String, String)> {
        let parsed: Vec<serde_json::Value> = serde_json::from_str(facts).unwrap();
        let mut children: Vec<(String, String)> = parsed
            .iter()
            .filter_map(|fact| {
                let arr = fact.as_array()?;
                if arr.len() >= 4 && arr[0].as_str()? == parent_id && arr[1].as_str()? == "child" {
                    Some((arr[2].as_str()?.to_string(), arr[3].as_str()?.to_string()))
                } else {
                    None
                }
            })
            .collect();
        children.sort_by(|a, b| a.0.cmp(&b.0));
        children
    }

    #[test]
    fn test_jsx_children_preserve_source_order() {
        // This reproduces the original NavigationSplitView bug:
        // "detail" sorted before "sidebar" alphabetically, swapping
        // sidebar and detail panes.
        let mut engine = JamEngine::new();

        let ts_source = r#"
            render(
                h("NavigationSplitView", { key: "nav" },
                    h("VStack", { key: "sidebar" }),
                    h("VStack", { key: "detail" })
                )
            );
        "#;
        let result = engine.load_program("test.tsx", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let children = get_children(&facts, "root/nav");

        assert_eq!(children.len(), 2, "nav should have 2 children");
        // sidebar (key="sidebar") should come first because it's declared first
        assert!(
            children[0].1.contains("sidebar"),
            "first child should be sidebar, got: {:?}",
            children
        );
        assert!(
            children[1].1.contains("detail"),
            "second child should be detail, got: {:?}",
            children
        );
    }

    #[test]
    fn test_jsx_children_order_independent_of_key_names() {
        // Keys that sort opposite to source order should still render
        // in source order.
        let mut engine = JamEngine::new();

        let ts_source = r#"
            render(
                h("VStack", { key: "app" },
                    h("Text", { key: "z-first" }),
                    h("Text", { key: "a-second" }),
                    h("Text", { key: "m-third" })
                )
            );
        "#;
        let result = engine.load_program("test.tsx", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let children = get_children(&facts, "root/app");

        assert_eq!(children.len(), 3, "app should have 3 children");
        assert!(
            children[0].1.ends_with("/z-first"),
            "first child: {:?}",
            children
        );
        assert!(
            children[1].1.ends_with("/a-second"),
            "second child: {:?}",
            children
        );
        assert!(
            children[2].1.ends_with("/m-third"),
            "third child: {:?}",
            children
        );
    }

    #[test]
    fn test_when_children_preserve_position_among_static_siblings() {
        // A when() in JSX should render its output at the same position
        // as it appears in the source, not after all static children.
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim("show", "yes");

            render(
                h("VStack", { key: "app" },
                    h("Text", { key: "header" }),
                    when(["show", $.val], ({ val }) =>
                        h("Text", { key: "dynamic" })
                    ),
                    h("Text", { key: "footer" })
                )
            );
        "#;
        let result = engine.load_program("test.tsx", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let children = get_children(&facts, "root/app");

        assert_eq!(
            children.len(),
            3,
            "app should have 3 children: {:?}",
            children
        );
        assert!(
            children[0].1.ends_with("/header"),
            "first should be header: {:?}",
            children
        );
        assert!(
            children[1].1.ends_with("/dynamic"),
            "second should be dynamic: {:?}",
            children
        );
        assert!(
            children[2].1.ends_with("/footer"),
            "third should be footer: {:?}",
            children
        );
    }

    #[test]
    fn test_multiple_when_children_preserve_order() {
        // Multiple when() markers among static children should all
        // appear at their correct positions.
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim("a", "val", "A");
            claim("b", "val", "B");

            render(
                h("VStack", { key: "app" },
                    when(["a", "val", $.v], ({ v }) =>
                        h("Text", { key: "when-a" })
                    ),
                    h("Text", { key: "static-mid" }),
                    when(["b", "val", $.v], ({ v }) =>
                        h("Text", { key: "when-b" })
                    )
                )
            );
        "#;
        let result = engine.load_program("test.tsx", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let children = get_children(&facts, "root/app");

        assert_eq!(
            children.len(),
            3,
            "app should have 3 children: {:?}",
            children
        );
        assert!(children[0].1.ends_with("/when-a"), "first: {:?}", children);
        assert!(
            children[1].1.ends_with("/static-mid"),
            "second: {:?}",
            children
        );
        assert!(children[2].1.ends_with("/when-b"), "third: {:?}", children);
    }

    #[test]
    fn test_child_order_with_manual_child_fn() {
        // child() calls should also produce ordered sort keys.
        let mut engine = JamEngine::new();

        let ts_source = r#"
            child("second", () => {
                claim($this, "isa", "Text");
            });
            child("first", () => {
                claim($this, "isa", "Text");
            });
        "#;
        let result = engine.load_program("test", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let children = get_children(&facts, "root");

        assert_eq!(
            children.len(),
            2,
            "root should have 2 children: {:?}",
            children
        );
        // "second" was declared first, so it should appear first despite
        // alphabetical ordering of the name
        assert!(
            children[0].1.ends_with("/second"),
            "first child: {:?}",
            children
        );
        assert!(
            children[1].1.ends_with("/first"),
            "second child: {:?}",
            children
        );
    }

    #[test]
    fn test_multi_pattern_when_join_in_jsx() {
        // Multi-pattern when() should work as a join —
        // no need for nested when() calls.
        let mut engine = JamEngine::new();

        let ts_source = r#"
            claim("item", "i1", "name", "Alice");
            claim("item", "i1", "status", "active");
            claim("item", "i2", "name", "Bob");
            claim("item", "i2", "status", "idle");

            render(
                h("VStack", { key: "app" },
                    when(
                        ["item", $.id, "name", $.name],
                        ["item", $.id, "status", $.status],
                        ({ id, name, status }) =>
                            h("Text", { key: "row-" + id, text: name + ":" + status })
                    )
                )
            );
        "#;
        let result = engine.load_program("test.tsx", ts_source);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let facts = engine.current_facts_json();

        // Should have two Text children with joined data
        assert!(
            facts.contains("Alice:active"),
            "should have Alice:active: {facts}"
        );
        assert!(facts.contains("Bob:idle"), "should have Bob:idle: {facts}");
    }

    // ========================================================================
    // assert() / retract() tests
    // ========================================================================

    #[test]
    fn test_assert_from_top_level() {
        let mut engine = JamEngine::new();
        let ts = r#"
            assert("color", "red");
            assert("color", "blue");
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""color","red""#), "assert red: {f}");
        assert!(f.contains(r#""color","blue""#), "assert blue: {f}");
    }

    #[test]
    fn test_retract_removes_asserted_fact() {
        let mut engine = JamEngine::new();
        let ts = r#"
            assert("color", "red");
            assert("color", "blue");
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Retract via eval_js
        engine.eval_js(r#"retract("color", "red");"#).unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(!f.contains(r#""color","red""#), "red should be gone: {f}");
        assert!(f.contains(r#""color","blue""#), "blue should remain: {f}");
    }

    #[test]
    fn test_assert_from_callback() {
        // assert() should work from callbacks (unlike claim() which throws)
        let mut engine = JamEngine::new();
        let ts = r#"
            render(
                <Button key="btn" label="Go" onPress={() => {
                    assert("clicked", true);
                }} />
            );
        "#;
        let result = engine.load_program("test.tsx", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        // Fact shouldn't exist yet
        let f = engine.current_facts_json();
        assert!(!f.contains(r#""clicked""#), "not clicked yet: {f}");

        // Fire the callback
        engine.fire_event("root/btn", "onPress");
        let f = engine.current_facts_json();
        assert!(f.contains(r#""clicked",true"#), "assert from callback: {f}");
    }

    #[test]
    fn test_assert_persists_across_holds() {
        // assert() facts should NOT be retracted when hold() is re-executed
        let mut engine = JamEngine::new();
        let ts = r#"
            assert("permanent", "fact");
            hold("mutable", () => { claim("mutable", "v1"); });
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""permanent","fact""#), "initial: {f}");
        assert!(f.contains(r#""mutable","v1""#), "initial hold: {f}");

        // Re-execute hold — should retract mutable but NOT permanent
        engine.eval_js(r#"hold("mutable", () => { claim("mutable", "v2"); });"#).unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""permanent","fact""#), "permanent survived: {f}");
        assert!(f.contains(r#""mutable","v2""#), "mutable updated: {f}");
        assert!(!f.contains(r#""mutable","v1""#), "old mutable gone: {f}");
    }

    #[test]
    fn test_assert_and_retract_from_eval_js() {
        let mut engine = JamEngine::new();
        let ts = r#"
            assert("session", "s1", "status", "starting");
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""status","starting""#), "initial: {f}");

        // Update: retract old, assert new
        engine.eval_js(r#"
            retract("session", "s1", "status", "starting");
            assert("session", "s1", "status", "active");
        "#).unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(!f.contains(r#""status","starting""#), "old gone: {f}");
        assert!(f.contains(r#""status","active""#), "new present: {f}");
    }

    #[test]
    fn test_when_reacts_to_asserted_facts() {
        // when() rules should fire on assert()ed facts just like claim()ed ones
        let mut engine = JamEngine::new();
        let ts = r#"
            when(["item", $.id, "name", $.name], ({ id, name }) => {
                claim("display", id, name);
            });
            assert("item", "i1", "name", "Alice");
        "#;
        let result = engine.load_program("test", ts);
        assert!(!result.starts_with("ERROR"), "load failed: {result}");
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(f.contains(r#""display","i1","Alice""#), "when reacted to assert: {f}");

        // Retract the fact — derived claim should also disappear
        engine.eval_js(r#"retract("item", "i1", "name", "Alice");"#).unwrap();
        let _ = engine.step_json();

        let f = engine.current_facts_json();
        assert!(!f.contains(r#""display""#), "derived fact retracted: {f}");
    }
}
