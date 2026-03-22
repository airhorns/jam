use crate::engine::Engine;
use crate::js_runtime::JsRuntime;
use crate::term::{Statement, Term};

/// Combined engine wrapper exposed to Swift via swift-bridge.
/// Owns both the DBSP Engine and the QuickJS JsRuntime.
pub struct JamEngine {
    engine: Engine,
    js_runtime: JsRuntime,
}

impl JamEngine {
    pub fn new() -> Self {
        JamEngine {
            engine: Engine::new(),
            js_runtime: JsRuntime::new(),
        }
    }

    /// Load a TypeScript program. Returns the program ID as a string,
    /// or an error string prefixed with "ERROR: ".
    pub fn load_program(&mut self, name: &str, ts_source: &str) -> String {
        match self.js_runtime.load_program(name, ts_source) {
            Ok(program) => {
                let id = self.engine.add_program(program);
                id.to_string()
            }
            Err(e) => format!("ERROR: {e}"),
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

    pub fn current_facts_json(&self) -> String {
        let facts: Vec<serde_json::Value> = self
            .engine
            .current_facts()
            .map(|stmt| statement_to_json(stmt))
            .collect();
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

#[swift_bridge::bridge]
mod ffi {
    extern "Rust" {
        type JamEngine;

        #[swift_bridge(init)]
        fn new() -> JamEngine;

        fn load_program(&mut self, name: &str, ts_source: &str) -> String;

        fn remove_program(&mut self, program_id: u64);

        fn assert_fact_json(&mut self, json: &str) -> String;

        fn retract_fact_json(&mut self, json: &str) -> String;

        fn step_json(&mut self) -> String;

        fn current_facts_json(&self) -> String;
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["hello", "world"])));
    }

    #[test]
    fn test_assert_retract_via_json() {
        let mut engine = JamEngine::new();

        let result = engine.assert_fact_json(r#"["omar", "is", "cool"]"#);
        assert!(!result.starts_with("ERROR"));
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(facts_arr
            .iter()
            .any(|f| f == &serde_json::json!(["omar", "is", "cool"])));

        let result = engine.retract_fact_json(r#"["omar", "is", "cool"]"#);
        assert!(!result.starts_with("ERROR"));
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(!facts_arr
            .iter()
            .any(|f| f == &serde_json::json!(["omar", "is", "cool"])));
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
        assert!(facts_arr
            .iter()
            .any(|f| f == &serde_json::json!(["root", "isa", "VStack"])));
        // Auto parent-child claim
        assert!(facts_arr
            .iter()
            .any(|f| f == &serde_json::json!(["root", "child", "title", "root/title"])));
        // Child claims
        assert!(facts_arr
            .iter()
            .any(|f| f == &serde_json::json!(["root/title", "isa", "Text"])));
        assert!(facts_arr
            .iter()
            .any(|f| f == &serde_json::json!(["root/title", "text", "Hello"])));
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root", "child", "buttons", "root/buttons"])));
        // buttons → dec, inc
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons", "child", "dec", "root/buttons/dec"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons", "child", "inc", "root/buttons/inc"])));
        // Nested entity properties
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons", "isa", "HStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/dec", "isa", "Button"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/dec", "label", "-"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/inc", "label", "+"])));
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root", "child", "display", "root/display"])),
            "missing child claim. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/display", "isa", "Text"])),
            "missing isa claim. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/display", "text", "Count: 0"])),
            "missing text claim. facts: {facts_arr:?}");

        // Update counter: retract old, assert new
        engine.retract_fact_json(r#"["counter", "count", 0]"#);
        engine.assert_fact_json(r#"["counter", "count", 5]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Old text should be gone, new text should appear
        assert!(!facts_arr.iter().any(|f| f == &serde_json::json!(["root/display", "text", "Count: 0"])),
            "old text still present. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/display", "text", "Count: 5"])),
            "new text missing. facts: {facts_arr:?}");
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

        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/save", "isa", "Button"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/save", "label", "Save"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/save", "action", "save"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/cancel", "label", "Cancel"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/cancel", "action", "cancel"])));
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root", "isa", "VStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/title", "text", "Jam Counter"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/title", "font", "title"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/count-display", "text", "Count: 0"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/count-display", "font", "largeTitle"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons", "isa", "HStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/dec", "label", "-"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/inc", "label", "+"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/inc", "action", "increment"])));

        // Simulate increment: retract old count, assert new
        engine.retract_fact_json(r#"["counter", "count", 0]"#);
        engine.assert_fact_json(r#"["counter", "count", 1]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        // Counter display should update reactively
        assert!(!facts_arr.iter().any(|f| f == &serde_json::json!(["root/count-display", "text", "Count: 0"])),
            "old count still present");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/count-display", "text", "Count: 1"])),
            "new count missing");

        // Static elements should still be there
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/title", "text", "Jam Counter"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/buttons/dec", "label", "-"])));
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0", "isa", "VStack"])),
            "missing VStack. facts: {facts_arr:?}");
        // Child Text with key
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0/title", "isa", "Text"])),
            "missing Text. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0/title", "font", "title"])),
            "missing font. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0/title", "text", "Hello World"])),
            "missing text content. facts: {facts_arr:?}");
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

        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/root-stack", "isa", "VStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/root-stack/buttons", "isa", "HStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/root-stack/buttons/a", "isa", "Button"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/root-stack/buttons/a", "label", "A"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/root-stack/buttons/b", "label", "B"])));
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/row/save", "isa", "Button"])),
            "missing save button. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/row/save", "label", "Save"])),
            "missing save label. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/row/cancel", "label", "Cancel"])),
            "missing cancel label. facts: {facts_arr:?}");
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/main/title", "text", "Static Title"])),
            "missing static title. facts: {facts_arr:?}");
        // Reactive display from when
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/main/display", "text", "Count: 42"])),
            "missing reactive display. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/main/display", "font", "largeTitle"])),
            "missing font on reactive display. facts: {facts_arr:?}");
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/main/val", "text", "Value: 10"])));

        // Update value — old should retract, new should appear
        engine.retract_fact_json(r#"["data", "value", 10]"#);
        engine.assert_fact_json(r#"["data", "value", 99]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();
        assert!(!facts_arr.iter().any(|f| f == &serde_json::json!(["root/main/val", "text", "Value: 10"])),
            "old value still present");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/main/val", "text", "Value: 99"])),
            "new value missing");
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app", "isa", "VStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/title", "font", "title"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/title", "text", "Jam Counter"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 0"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/buttons", "isa", "HStack"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/buttons/dec", "label", "-"])));
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/buttons/inc", "label", "+"])));

        // Increment
        engine.retract_fact_json(r#"["counter", "count", 0]"#);
        engine.assert_fact_json(r#"["counter", "count", 1]"#);
        let _ = engine.step_json();

        let facts = engine.current_facts_json();
        let facts_arr: Vec<serde_json::Value> = serde_json::from_str(&facts).unwrap();

        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 1"])));
        assert!(!facts_arr.iter().any(|f| f == &serde_json::json!(["root/app/display", "text", "Count: 0"])));
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
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0/0", "text", "First"])),
            "missing First. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0/1", "text", "Second"])),
            "missing Second. facts: {facts_arr:?}");
        assert!(facts_arr.iter().any(|f| f == &serde_json::json!(["root/0/2", "text", "Third"])),
            "missing Third. facts: {facts_arr:?}");
    }
}
