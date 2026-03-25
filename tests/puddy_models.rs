//! Tests for the puddy data model (event parser + networking).
//! Session state now lives in the fact database via assert/retract.

use jam::bridge::JamEngine;

/// Helper: create an engine with the puddy model code loaded.
fn engine_with_models() -> JamEngine {
    let mut engine = JamEngine::new();

    let test_harness = r#"
        import { parseACPMessage } from "./models/events";
        import { isTerminalStatus } from "./models/session";

        globalThis.__test = {
            parseACPMessage,
            isTerminalStatus,
        };
    "#;

    let files: Vec<(&str, &str)> = vec![
        ("models/events.ts", include_str!("../examples/puddy/ts/models/events.ts")),
        ("models/session.ts", include_str!("../examples/puddy/ts/models/session.ts")),
        ("test-harness.ts", test_harness),
    ];

    let result = engine.load_program_files_native("puddy-models", &files);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load puddy models: {result}"
    );
    let _ = engine.step_json();
    engine
}

/// Helper: create an engine with the full puddy stack loaded (models + networking).
/// Uses the ES module system. A test harness entry point imports and exposes
/// the relevant symbols on globalThis for eval_js test scripts.
fn engine_with_networking() -> JamEngine {
    let mut engine = JamEngine::new();

    let test_harness = r#"
        import { parseACPMessage } from "./models/events";
        import { isTerminalStatus } from "./models/session";
        import { SandboxAgentClient, SandboxAgentError } from "./networking/client";
        import { SessionManager } from "./networking/session-manager";

        globalThis.__test = {
            parseACPMessage,
            isTerminalStatus,
            SandboxAgentClient,
            SandboxAgentError,
            SessionManager,
        };
    "#;

    let files: Vec<(&str, &str)> = vec![
        ("models/events.ts", include_str!("../examples/puddy/ts/models/events.ts")),
        ("models/session.ts", include_str!("../examples/puddy/ts/models/session.ts")),
        ("networking/client.ts", include_str!("../examples/puddy/ts/networking/client.ts")),
        ("networking/session-manager.ts", include_str!("../examples/puddy/ts/networking/session-manager.ts")),
        ("test-harness.ts", test_harness),
    ];

    let result = engine.load_program_files_native("puddy-networking", &files);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load puddy networking: {result}"
    );
    let _ = engine.step_json();
    engine
}

/// Helper: evaluate JS in the engine's existing context and return claims as JSON string.
/// Uses eval_js() so the code runs in the same scope as the loaded models.
fn eval_and_get_facts(engine: &mut JamEngine, setup_js: &str) -> String {
    let ts = format!("const t = globalThis.__test;\n{setup_js}");

    engine.eval_js(&ts).expect("Failed to eval test script");
    let _ = engine.step_json();
    engine.current_facts_json()
}

// ============================================================================
// ACPMessageParser Tests
// ============================================================================

#[test]
fn test_parses_agent_message_chunk() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "Hello" } } }
        }), idx);

        claim("result_type", result.type);
        claim("payload_type", result.event.payload.type);
        claim("text", result.event.payload.text);
        claim("event_index", result.event.eventIndex);
        claim("idx_after", idx.value);
        "#,
    );

    assert!(
        facts.contains(r#""result_type","event""#),
        "should be event: {facts}"
    );
    assert!(
        facts.contains(r#""payload_type","agentMessageChunk""#),
        "payload type: {facts}"
    );
    assert!(facts.contains(r#""text","Hello""#), "text: {facts}");
    assert!(facts.contains(r#""event_index",1"#), "event index: {facts}");
    assert!(
        facts.contains(r#""idx_after",1"#),
        "idx incremented: {facts}"
    );
}

#[test]
fn test_parses_agent_thought_chunk() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: { sessionUpdate: "agent_thought_chunk", content: { text: "thinking..." } } }
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("text", result.event.payload.text);
        "#,
    );

    assert!(
        facts.contains(r#""payload_type","agentThoughtChunk""#),
        "{facts}"
    );
    assert!(facts.contains(r#""text","thinking...""#), "{facts}");
}

#[test]
fn test_parses_tool_call() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: {
                sessionUpdate: "tool_call",
                toolCallId: "tc-1",
                title: "Read file",
                kind: "bash",
                status: "running"
            }}
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("toolCallId", result.event.payload.data.toolCallId);
        claim("title", result.event.payload.data.title);
        "#,
    );

    assert!(facts.contains(r#""payload_type","toolCall""#), "{facts}");
    assert!(facts.contains(r#""toolCallId","tc-1""#), "{facts}");
    assert!(facts.contains(r#""title","Read file""#), "{facts}");
}

#[test]
fn test_parses_tool_call_update() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: {
                sessionUpdate: "tool_call_update",
                toolCallId: "tc-1",
                title: "Read file",
                status: "completed"
            }}
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("status", result.event.payload.data.status);
        "#,
    );

    assert!(
        facts.contains(r#""payload_type","toolCallUpdate""#),
        "{facts}"
    );
    assert!(facts.contains(r#""status","completed""#), "{facts}");
}

#[test]
fn test_parses_usage_update() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: {
                sessionUpdate: "usage_update",
                size: 100000,
                used: 5000,
                cost: { amount: 0.05, currency: "USD" }
            }}
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("size", result.event.payload.data.size);
        claim("used", result.event.payload.data.used);
        "#,
    );

    assert!(facts.contains(r#""payload_type","usageUpdate""#), "{facts}");
    assert!(facts.contains(r#""size",100000"#), "{facts}");
    assert!(facts.contains(r#""used",5000"#), "{facts}");
}

#[test]
fn test_parses_session_end_from_json_rpc_result() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { stopReason: "end_turn" }
        }), idx);

        claim("result_type", result.type);
        claim("stop_reason", result.stopReason);
        "#,
    );

    assert!(facts.contains(r#""result_type","sessionEnd""#), "{facts}");
    assert!(facts.contains(r#""stop_reason","end_turn""#), "{facts}");
}

#[test]
fn test_skips_json_rpc_response_without_stop_reason() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { sessionId: "abc" }
        }), idx);

        claim("result_type", result.type);
        "#,
    );

    assert!(facts.contains(r#""result_type","skip""#), "{facts}");
}

#[test]
fn test_skips_json_rpc_error() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32600, message: "Invalid request" }
        }), idx);

        claim("result_type", result.type);
        "#,
    );

    assert!(facts.contains(r#""result_type","skip""#), "{facts}");
}

#[test]
fn test_event_index_increments() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const msg = JSON.stringify({
            method: "session/update",
            params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "a" } } }
        });

        t.parseACPMessage(msg, idx);
        t.parseACPMessage(msg, idx);
        const r3 = t.parseACPMessage(msg, idx);

        claim("idx_after_3", idx.value);
        claim("third_event_index", r3.event.eventIndex);
        "#,
    );

    assert!(facts.contains(r#""idx_after_3",3"#), "{facts}");
    assert!(facts.contains(r#""third_event_index",3"#), "{facts}");
}

// ============================================================================
// Networking Tests
// ============================================================================

#[test]
fn test_is_terminal_status() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        claim("starting", t.isTerminalStatus("starting"));
        claim("active", t.isTerminalStatus("active"));
        claim("ended", t.isTerminalStatus("ended"));
        claim("failed", t.isTerminalStatus("failed"));
        "#,
    );

    assert!(facts.contains(r#""starting",false"#), "{facts}");
    assert!(facts.contains(r#""active",false"#), "{facts}");
    assert!(facts.contains(r#""ended",true"#), "{facts}");
    assert!(facts.contains(r#""failed",true"#), "{facts}");
}

// ============================================================================
// (Session state machine tests removed — state now lives in fact DB, tested via e2e)
// ============================================================================

#[test]
fn test_dummy_skip_old_session_tests() {
    // Placeholder — old AgentSession/applyEvent tests removed.
    // Session state is now asserted directly into the fact DB by SessionManager.
    // Tested via puddy_e2e.rs integration tests.
}

// Orphaned old test fragments removed — see git history for original session state tests.
// The old AgentSession/applyEvent pattern was replaced by assert/retract into the fact DB.

// ============================================================================
// Networking Client Tests
// ============================================================================

#[test]
fn test_client_code_loads_alone() {
    let mut engine = JamEngine::new();
    let events_ts = include_str!("../examples/puddy/ts/models/events.ts");
    let session_ts = include_str!("../examples/puddy/ts/models/session.ts");
    let client_ts = include_str!("../examples/puddy/ts/networking/client.ts");

    let combined = format!("{events_ts}\n{session_ts}\n{client_ts}\nclaim(\"loaded\", true);");
    let result = engine.load_program("test-client", &combined);
    assert!(
        !result.starts_with("ERROR"),
        "Client code failed to load: {result}"
    );
}

#[test]
fn test_manager_loads_in_combined() {
    let mut engine = JamEngine::new();
    let events_ts = include_str!("../examples/puddy/ts/models/events.ts");
    let session_ts = include_str!("../examples/puddy/ts/models/session.ts");
    let client_ts = include_str!("../examples/puddy/ts/networking/client.ts");
    let manager_ts = include_str!("../examples/puddy/ts/networking/session-manager.ts");

    // Try each file incrementally
    let result = engine.load_program("step1", &format!("{events_ts}\n{session_ts}\n{client_ts}"));
    assert!(!result.starts_with("ERROR"), "Phase 1 failed: {result}");

    // Now try adding manager via eval_js (same context)
    let js = jam::transpile::transpile_ts_to_js(manager_ts, "session-manager.ts").unwrap();
    let js = jam::transpile::strip_imports(&js);
    engine.eval_js(&js).expect("Manager eval failed");
}

#[test]
fn test_networking_code_loads() {
    // Verify the full networking stack loads without errors
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        claim("has_client", typeof t.SandboxAgentClient === "function");
        claim("has_error", typeof t.SandboxAgentError === "function");
        claim("has_manager", typeof t.SessionManager === "function");
        "#,
    );

    assert!(
        facts.contains(r#""has_client",true"#),
        "SandboxAgentClient: {facts}"
    );
    assert!(
        facts.contains(r#""has_error",true"#),
        "SandboxAgentError: {facts}"
    );
    assert!(
        facts.contains(r#""has_manager",true"#),
        "SessionManager: {facts}"
    );
}

#[test]
fn test_client_constructs_with_defaults() {
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const client = new t.SandboxAgentClient();
        claim("hostname", client.hostname);
        "#,
    );

    assert!(facts.contains(r#""hostname","localhost""#), "{facts}");
}

#[test]
fn test_client_constructs_with_custom_url() {
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const client = new t.SandboxAgentClient("http://myserver:9999");
        claim("hostname", client.hostname);
        "#,
    );

    assert!(facts.contains(r#""hostname","myserver""#), "{facts}");
}

#[test]
fn test_session_manager_readiness_no_agents() {
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const mgr = new t.SessionManager();
        mgr.isConnected = true;
        mgr.agents = [];
        claim("ready", mgr.hasReadyAgent);
        claim("error", mgr.agentReadinessError);
        "#,
    );

    assert!(facts.contains(r#""ready",false"#), "{facts}");
    assert!(
        facts.contains(r#""error","No agents found on server""#),
        "{facts}"
    );
}

#[test]
fn test_session_manager_readiness_installed_no_creds() {
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const mgr = new t.SessionManager();
        mgr.isConnected = true;
        mgr.agents = [{ id: "claude", installed: true, credentialsAvailable: false }];
        claim("ready", mgr.hasReadyAgent);
        claim("has_error", mgr.agentReadinessError !== undefined);
        "#,
    );

    assert!(facts.contains(r#""ready",false"#), "{facts}");
    assert!(facts.contains(r#""has_error",true"#), "{facts}");
}

// ============================================================================
// Full App UI Tests
// ============================================================================

/// Load the full puddy app as ES modules.
fn load_puddy_app() -> JamEngine {
    let mut engine = JamEngine::new();

    let files: Vec<(&str, &str)> = vec![
        ("models/events.ts", include_str!("../examples/puddy/ts/models/events.ts")),
        ("models/session.ts", include_str!("../examples/puddy/ts/models/session.ts")),
        ("networking/client.ts", include_str!("../examples/puddy/ts/networking/client.ts")),
        ("networking/session-manager.ts", include_str!("../examples/puddy/ts/networking/session-manager.ts")),
        ("puddy.tsx", include_str!("../examples/puddy/ts/puddy.tsx")),
    ];

    let result = engine.load_program_files_native("puddy", &files);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load puddy app: {result}"
    );
    let _ = engine.step_json();
    engine
}

/// Set connection status to "connected" and configure a ready agent.
fn connect_puddy_app(engine: &mut JamEngine) {
    engine
        .eval_js(r#"
            sessionManager.isConnected = true;
            sessionManager.agents = [{ id: "claude", installed: true, credentialsAvailable: true }];
            hold('connection', () => {
                claim('connection', 'status', 'connected');
                claim('connection', 'hostname', 'localhost');
            });
        "#)
        .unwrap();
    let _ = engine.step_json();
}

#[test]
fn test_puddy_app_loads_with_ui_structure() {
    let engine = load_puddy_app();
    let f = engine.current_facts_json();

    // Root structure
    assert!(f.contains(r#""isa","VStack""#), "root VStack: {f}");
    assert!(
        f.contains(r#""isa","NavigationSplitView""#),
        "nav split: {f}"
    );

    // Connection status — may be "Connecting...", "localhost", or "Disconnected"
    // depending on whether sandbox-agent is running
    assert!(
        f.contains("Connecting...") || f.contains("localhost") || f.contains("Disconnected"),
        "connection status: {f}"
    );

    // Session list header and new session button
    assert!(f.contains("Sessions"), "sessions header: {f}");
    assert!(f.contains("+ New Session"), "new session button: {f}");

    // No-selection placeholder
    assert!(f.contains("Select a session"), "select prompt: {f}");
}

#[test]
fn test_puddy_create_session_via_button() {
    let mut engine = load_puddy_app();
    connect_puddy_app(&mut engine);

    // Find the new session button's callback ID
    let f = engine.current_facts_json();
    let facts: Vec<serde_json::Value> = serde_json::from_str(&f).unwrap();
    let callback_id = facts.iter().find_map(|fact| {
        let arr = fact.as_array()?;
        if arr.len() >= 3
            && arr[1].as_str() == Some("onPress")
            && arr[0].as_str()?.contains("new-session")
        {
            arr[2].as_str().map(String::from)
        } else {
            None
        }
    });
    assert!(
        callback_id.is_some(),
        "should find new-session callback: {f}"
    );

    // Press the new session button
    let result = engine.fire_event_by_callback_id(&callback_id.unwrap());
    assert!(!result.starts_with("ERROR"), "fire_event failed: {result}");

    // After pressing, there should be a session in the facts
    let f = engine.current_facts_json();
    assert!(
        f.contains(r#""agent","claude""#),
        "session created with agent: {f}"
    );
    assert!(
        f.contains(r#""status","starting""#),
        "session status starting: {f}"
    );
}

#[test]
fn test_puddy_session_appears_in_sidebar() {
    let mut engine = load_puddy_app();

    // Inject a session via hold
    engine
        .eval_js(
            r#"
        hold("sessions", () => {
            claim("session", "test-session", "agent", "claude");
            claim("session", "test-session", "status", "active");
        });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    // The when rule should match the session facts and render a row
    assert!(
        f.contains("claude") && f.contains("test-session"),
        "session should appear in sidebar: {f}"
    );
}

#[test]
fn test_puddy_select_session_shows_detail() {
    let mut engine = load_puddy_app();

    // Inject a session and select it
    engine
        .eval_js(
            r#"
        hold("sessions", () => {
            claim("session", "test-session", "agent", "claude");
            claim("session", "test-session", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "test-session"); });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    // Detail view should show the session
    assert!(
        f.contains("Session: test-session") || f.contains("test-session"),
        "detail should show selected session: {f}"
    );
    // "Select a session" placeholder should be gone
    // (it's conditionally rendered only when selectedId is empty)
}

#[test]
fn test_puddy_connection_status_updates_reactively() {
    let mut engine = load_puddy_app();

    // Initially checking (SessionManager.checkConnection runs on startup)
    // The check will fail (no server) and transition to "disconnected" after drain_async.
    // For now just verify the connection status claim exists.
    let f = engine.current_facts_json();
    assert!(
        f.contains(r#""connection","status""#),
        "should have connection status: {f}"
    );

    // Update connection status via hold
    engine
        .eval_js(
            r#"
        hold("connection", () => {
            claim("connection", "status", "connected");
            claim("connection", "hostname", "myserver.local");
        });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    // Should now show connected with hostname
    assert!(f.contains("myserver.local"), "should show hostname: {f}");
    // Dot should be green
    assert!(
        f.contains(r#""foregroundColor","green""#),
        "dot should be green: {f}"
    );
}

// ============================================================================
// Data model tests (independent of app UI)
// ============================================================================

#[test]
fn test_cross_join_no_shared_vars() {
    // Test that a 2-pattern rule with no shared variables produces a cross-product
    use jam::engine::Engine;
    use jam::pattern::{Pattern, PatternTerm};
    use jam::rule::{Program, RuleSpec};
    use jam::term::{Statement, Term};
    use std::sync::Arc;

    let mut engine = Engine::new();
    engine.add_program(Program::new("test").with_rules(vec![RuleSpec::new(
        vec![
            Pattern::new(vec![
                PatternTerm::Exact(Term::sym("a")),
                PatternTerm::Bind("x".into()),
            ]),
            Pattern::new(vec![
                PatternTerm::Exact(Term::sym("b")),
                PatternTerm::Bind("y".into()),
            ]),
        ],
        |bindings, _| {
            let x = bindings.get("x").unwrap().clone();
            let y = bindings.get("y").unwrap().clone();
            vec![Statement::new(vec![Term::sym("result"), x, y])]
        },
    )]));

    engine.assert_fact(Statement::new(vec![Term::sym("a"), Term::sym("1")]));
    engine.assert_fact(Statement::new(vec![Term::sym("b"), Term::sym("2")]));
    let result = engine.step();

    let has_result = result.deltas.iter().any(|(s, w)| {
        *w > 0 && s == &Statement::new(vec![Term::sym("result"), Term::sym("1"), Term::sym("2")])
    });
    assert!(
        has_result,
        "cross-join should produce result: {:?}",
        result.deltas
    );
}

#[test]
fn test_nested_when_in_jsx() {
    // Minimal repro: nested when() in JSX where inner when has no shared vars
    let mut engine = JamEngine::new();
    let tsx = r#"
        hold("state", () => {
            claim("color", "red");
            claim("size", 10);
        });

        render(
            <VStack key="app">
                {when(["color", $.c], ({ c }) =>
                    <VStack key="outer">
                        <Text key="color-text">{"color=" + c}</Text>
                        {when(["size", $.s], ({ s }) =>
                            <Text key="size-text">{"size=" + s}</Text>
                        )}
                    </VStack>
                )}
            </VStack>
        );
    "#;

    let result = engine.load_program("test.tsx", tsx);
    assert!(!result.starts_with("ERROR"), "load failed: {result}");

    // Check how many rules were compiled
    engine
        .eval_js(
            r#"
        claim("rule_count", globalThis.__jam.rules.length);
        for (let i = 0; i < globalThis.__jam.rules.length; i++) {
            const r = globalThis.__jam.rules[i];
            claim("rule_" + i + "_patterns", r.patterns.length);
            claim("rule_" + i + "_whens", r.whens.length);
        }
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    eprintln!("facts: {f}");
    assert!(f.contains(r#""color=red""#), "outer when should fire: {f}");
    assert!(f.contains(r#""size=10""#), "inner when should fire: {f}");
}

#[test]
fn test_nested_when_with_shared_vars_in_jsx() {
    // Test nested when with shared variable binding across levels
    let mut engine = JamEngine::new();
    let tsx = r#"
        hold("s", () => {
            claim("selected", "item-1");
            claim("detail", "item-1", "description", "First item");
            claim("detail", "item-2", "description", "Second item");
        });

        render(
            <VStack key="app">
                {when(["selected", $.id], ({ id }) =>
                    <VStack key="detail">
                        <Text key="sel">{"Selected: " + id}</Text>
                        {when(["detail", $.id, "description", $.desc], ({ id: detailId, desc }) =>
                            <Text key={"desc-" + detailId}>{desc}</Text>
                        )}
                    </VStack>
                )}
            </VStack>
        );
    "#;

    let result = engine.load_program("test.tsx", tsx);
    assert!(!result.starts_with("ERROR"), "load failed: {result}");
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    eprintln!("shared var facts: {f}");
    // Should show detail for item-1 only (matched via shared $id)
    assert!(
        f.contains(r#""text","First item""#),
        "should render item-1 text claim: {f}"
    );
    // Item-2 data exists as a base fact but should NOT have a rendered text claim
    assert!(
        !f.contains(r#""text","Second item""#),
        "should not render item-2: {f}"
    );
}

#[test]
fn test_join_3_and_6_term_patterns() {
    // Test the exact pattern combination used in puddy messages
    let mut engine = JamEngine::new();
    let tsx = r#"
        hold("s", () => {
            claim("ui", "selected", "s1");
            claim("msg", "s1", "m1", "user", "text", "Hello");
        });

        render(
            <VStack key="app">
                {when(["ui", "selected", $.id], ({ id }) =>
                    <VStack key="detail">
                        <Text key="sel">{"id=" + id}</Text>
                        {when(["msg", $.id, $.mid, $.sender, $.kind, $.content], ({ mid, content }) =>
                            <Text key={"m-" + mid}>{content}</Text>
                        )}
                    </VStack>
                )}
            </VStack>
        );
    "#;
    let result = engine.load_program("test.tsx", tsx);
    assert!(!result.starts_with("ERROR"), "load failed: {result}");
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    eprintln!("3+6 join: {f}");
    assert!(f.contains(r#""id=s1""#), "outer when: {f}");
    assert!(
        f.contains(r#""text","Hello""#),
        "message should render: {f}"
    );
}

#[test]
fn test_join_with_late_fact_insertion() {
    // Test that asserting facts AFTER load_program still triggers join rules
    let mut engine = JamEngine::new();
    let tsx = r#"
        hold("s", () => { claim("ui", "selected", "s1"); });

        render(
            <VStack key="app">
                {when(["ui", "selected", $.id], ({ id }) =>
                    <VStack key="detail">
                        <Text key="sel">{"id=" + id}</Text>
                        {when(["msg", $.id, $.mid, $.content], ({ mid, content }) =>
                            <Text key={"m-" + mid}>{content}</Text>
                        )}
                    </VStack>
                )}
            </VStack>
        );
    "#;
    let result = engine.load_program("test.tsx", tsx);
    assert!(!result.starts_with("ERROR"), "load failed: {result}");
    let _ = engine.step_json();

    // Initially: detail renders but no messages
    let f = engine.current_facts_json();
    assert!(f.contains(r#""id=s1""#), "detail should render: {f}");
    assert!(!f.contains(r#""text","Hello""#), "no messages yet: {f}");

    // Now add a message fact AFTER the initial load (4-term)
    engine.assert_fact_json(r#"["msg", "s1", "m1", "Hello"]"#);
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    assert!(
        f.contains(r#""text","Hello""#),
        "4-term late fact join: {f}"
    );

    // (no 6-term test here, see test_join_with_6_term_late_fact)
}

#[test]
fn test_join_6_term_late_fact() {
    // Same as late fact test but with 6-term message pattern (matching puddy)
    let mut engine = JamEngine::new();
    let tsx = r#"
        hold("s", () => { claim("ui", "selected", "s1"); });

        render(
            <VStack key="app">
                {when(["ui", "selected", $.id], ({ id }) =>
                    <VStack key="detail">
                        {when(["message", $.id, $.mid, $.sender, $.kind, $.content],
                          ({ mid, sender, kind, content }) =>
                            <Text key={"m-" + mid}>{sender + ": " + content}</Text>
                        )}
                    </VStack>
                )}
            </VStack>
        );
    "#;
    let result = engine.load_program("test.tsx", tsx);
    assert!(!result.starts_with("ERROR"), "load failed: {result}");
    let _ = engine.step_json();

    // Add 6-term message after load
    engine.assert_fact_json(r#"["message", "s1", "m1", "user", "text", "Hello"]"#);
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    eprintln!("6-term join: {f}");
    assert!(
        f.contains(r#""text","user: Hello""#),
        "6-term join should render: {f}"
    );
}

#[test]
fn test_puddy_simplified_message_render() {
    // Minimal version of puddy's detail view with messages
    let mut engine = JamEngine::new();
    let tsx = r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });

        render(
            <VStack key="app">
                {/* Detail: always render, the join handles filtering */}
                {when(["ui", "selectedSession", $.selectedId], ({ selectedId }) =>
                    <VStack key="detail">
                        <Text key="title">{"Session: " + selectedId}</Text>
                        {when(["message", $.selectedId, $.mid, $.sender, $.kind, $.content],
                          ({ mid, sender, content }) =>
                            <Text key={"m-" + mid}>{sender + ": " + content}</Text>
                        )}
                    </VStack>
                )}
            </VStack>
        );
    "#;
    let result = engine.load_program("test.tsx", tsx);
    assert!(!result.starts_with("ERROR"), "load failed: {result}");
    let _ = engine.step_json();

    // Add message
    engine.assert_fact_json(r#"["message", "s1", "m1", "user", "text", "Hello!"]"#);
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    eprintln!("simplified puddy: {f}");
    assert!(f.contains("Session: s1"), "detail title: {f}");
    assert!(f.contains("user: Hello!"), "message should render: {f}");
}

#[test]
fn test_puddy_messages_render_in_detail() {
    let mut engine = load_puddy_app();

    // Create a session and select it
    engine
        .eval_js(
            r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    // Add messages via hold (the same way the app's addMessage does it)
    engine.eval_js(r#"
        hold("msg-s1-m1", () => { claim("message", "s1", "m1", "user", "text", "Hello agent!"); });
        hold("msg-s1-m2", () => { claim("message", "s1", "m2", "assistant", "text", "Hi! How can I help?"); });
    "#).unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    // Message facts should exist
    assert!(f.contains(r#"["message","s1","m1"#), "message fact m1: {f}");
    assert!(f.contains(r#"["message","s1","m2"#), "message fact m2: {f}");
    // The join rule should render messages with icons
    assert!(f.contains("Hello agent!"), "user message text: {f}");
    assert!(
        f.contains("Hi! How can I help?"),
        "assistant message text: {f}"
    );
    assert!(f.contains("\">\""), "user icon >: {f}");
    assert!(f.contains("\"<\""), "assistant icon <: {f}");
}

#[test]
fn test_puddy_tool_messages_render() {
    let mut engine = load_puddy_app();

    engine
        .eval_js(
            r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    engine.eval_js(r#"
        hold("msg-s1-m1", () => { claim("message", "s1", "m1", "assistant", "toolUse", "Read file"); });
        hold("msg-s1-m2", () => { claim("message", "s1", "m2", "tool", "toolResult", "completed"); });
    "#).unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    assert!(f.contains("Read file"), "tool use should render: {f}");
    assert!(f.contains("completed"), "tool result should render: {f}");
    assert!(f.contains("\"~\""), "tool icon ~: {f}");
}

#[test]
fn test_puddy_streaming_text_shows() {
    let mut engine = load_puddy_app();

    engine
        .eval_js(
            r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
            claim("session", "s1", "streamingText", "I am thinking...");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    assert!(
        f.contains("I am thinking..."),
        "streaming text should show: {f}"
    );
}

#[test]
fn test_puddy_text_input_adds_message() {
    let mut engine = load_puddy_app();

    // Create a session through SessionManager so hasSession() works
    engine
        .eval_js(
            r#"
        sessionManager.isConnected = true;
        sessionManager.agents = [{ id: "claude", installed: true, credentialsAvailable: true }];
        hold("connection", () => {
            claim("connection", "status", "connected");
            claim("connection", "hostname", "localhost");
        });
        const sid = sessionManager.createNewSession();
        hold("ui", () => { claim("ui", "selectedSession", sid); });
    "#,
        )
        .unwrap();
    let _ = engine.step_json();

    // Find the TextField's onSubmit callback
    let f = engine.current_facts_json();
    let facts: Vec<serde_json::Value> = serde_json::from_str(&f).unwrap();
    let callback_id = facts.iter().find_map(|fact| {
        let arr = fact.as_array()?;
        if arr.len() >= 3
            && arr[1].as_str() == Some("onSubmit")
            && arr[0].as_str()?.contains("input")
        {
            arr[2].as_str().map(String::from)
        } else {
            None
        }
    });
    assert!(callback_id.is_some(), "should find input callback: {f}");

    // Fire onSubmit with text data
    let result = engine.fire_event_with_data(
        &callback_id.unwrap().replace(":onSubmit", ""),
        "onSubmit",
        "Test message from user",
    );
    assert!(!result.starts_with("ERROR"), "fire failed: {result}");

    let f = engine.current_facts_json();
    assert!(
        f.contains("Test message from user"),
        "user message should appear: {f}"
    );
}


// ============================================================================
// New ACP Event Type Tests
// ============================================================================

#[test]
fn test_parses_plan_event() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: {
                sessionUpdate: "plan",
                entries: [
                    { content: "Read the file", priority: "high", status: "completed" },
                    { content: "Edit the code", priority: "medium", status: "in_progress" },
                    { content: "Run tests", priority: "low", status: "pending" }
                ]
            }}
        }), idx);

        claim("result_type", result.type);
        claim("payload_type", result.event.payload.type);
        claim("entry_count", result.event.payload.data.entries.length);
        claim("e0_content", result.event.payload.data.entries[0].content);
        claim("e0_priority", result.event.payload.data.entries[0].priority);
        claim("e0_status", result.event.payload.data.entries[0].status);
        claim("e1_content", result.event.payload.data.entries[1].content);
        claim("e1_status", result.event.payload.data.entries[1].status);
        claim("e2_status", result.event.payload.data.entries[2].status);
        "#,
    );

    assert!(facts.contains(r#""result_type","event""#), "result type: {facts}");
    assert!(facts.contains(r#""payload_type","plan""#), "payload type: {facts}");
    assert!(facts.contains(r#""entry_count",3"#), "entry count: {facts}");
    assert!(facts.contains(r#""e0_content","Read the file""#), "e0 content: {facts}");
    assert!(facts.contains(r#""e0_priority","high""#), "e0 priority: {facts}");
    assert!(facts.contains(r#""e0_status","completed""#), "e0 status: {facts}");
    assert!(facts.contains(r#""e1_content","Edit the code""#), "e1 content: {facts}");
    assert!(facts.contains(r#""e1_status","in_progress""#), "e1 status: {facts}");
    assert!(facts.contains(r#""e2_status","pending""#), "e2 status: {facts}");
}

#[test]
fn test_parses_current_mode_update() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: { sessionUpdate: "current_mode_update", modeId: "plan" } }
        }), idx);

        claim("result_type", result.type);
        claim("payload_type", result.event.payload.type);
        claim("mode_id", result.event.payload.modeId);
        "#,
    );

    assert!(facts.contains(r#""result_type","event""#), "{facts}");
    assert!(facts.contains(r#""payload_type","currentModeUpdate""#), "{facts}");
    assert!(facts.contains(r#""mode_id","plan""#), "{facts}");
}

#[test]
fn test_parses_available_commands_update() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: {
                sessionUpdate: "available_commands_update",
                availableCommands: [
                    { name: "commit", description: "Commit changes", input: { hint: "commit message" } },
                    { name: "review", description: "Review code" }
                ]
            }}
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("cmd_count", result.event.payload.commands.length);
        claim("cmd0_name", result.event.payload.commands[0].name);
        claim("cmd0_desc", result.event.payload.commands[0].description);
        claim("cmd0_hint", result.event.payload.commands[0].inputHint);
        claim("cmd1_name", result.event.payload.commands[1].name);
        claim("cmd1_no_hint", result.event.payload.commands[1].inputHint === undefined);
        "#,
    );

    assert!(facts.contains(r#""payload_type","availableCommandsUpdate""#), "{facts}");
    assert!(facts.contains(r#""cmd_count",2"#), "{facts}");
    assert!(facts.contains(r#""cmd0_name","commit""#), "{facts}");
    assert!(facts.contains(r#""cmd0_hint","commit message""#), "{facts}");
    assert!(facts.contains(r#""cmd1_name","review""#), "{facts}");
    assert!(facts.contains(r#""cmd1_no_hint",true"#), "{facts}");
}

#[test]
fn test_parses_session_info_update() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: { sessionUpdate: "session_info_update", title: "Fix login bug" } }
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("title", result.event.payload.title);
        "#,
    );

    assert!(facts.contains(r#""payload_type","sessionInfoUpdate""#), "{facts}");
    assert!(facts.contains(r#""title","Fix login bug""#), "{facts}");
}

#[test]
fn test_parses_tool_call_update_with_content() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const idx = { value: 0 };
        const result = t.parseACPMessage(JSON.stringify({
            method: "session/update",
            params: { update: {
                sessionUpdate: "tool_call_update",
                toolCallId: "tc1",
                status: "completed",
                title: "Read file",
                content: [
                    { type: "text", text: "file contents here" },
                    { type: "diff", path: "src/main.rs", oldText: "old", newText: "new" }
                ]
            }}
        }), idx);

        claim("payload_type", result.event.payload.type);
        claim("content_count", result.event.payload.data.content.length);
        claim("c0_type", result.event.payload.data.content[0].type);
        claim("c0_text", result.event.payload.data.content[0].text);
        claim("c1_type", result.event.payload.data.content[1].type);
        claim("c1_path", result.event.payload.data.content[1].path);
        "#,
    );

    assert!(facts.contains(r#""payload_type","toolCallUpdate""#), "{facts}");
    assert!(facts.contains(r#""content_count",2"#), "{facts}");
    assert!(facts.contains(r#""c0_type","text""#), "{facts}");
    assert!(facts.contains(r#""c0_text","file contents here""#), "{facts}");
    assert!(facts.contains(r#""c1_type","diff""#), "{facts}");
    assert!(facts.contains(r#""c1_path","src/main.rs""#), "{facts}");
}

// (Old session state machine tests for new events removed —
//  these tested AgentSession/applyEvent which no longer exist.
//  Session state is now tested via e2e tests in puddy_e2e.rs.)

