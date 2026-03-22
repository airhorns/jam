//! Tests for the puddy data model (session state machine + event parser).
//! These load the TypeScript model code into QuickJS and verify behavior
//! matches the original Swift implementation.

use jam::bridge::JamEngine;

/// Helper: create an engine with the puddy model code loaded.
fn engine_with_models() -> JamEngine {
    let mut engine = JamEngine::new();

    let events_ts = include_str!("../examples/puddy/ts/models/events.ts");
    let session_ts = include_str!("../examples/puddy/ts/models/session.ts");

    let test_harness = format!(
        r#"
        {events_ts}
        {session_ts}

        globalThis.__test = {{
            parseACPMessage,
            createSession,
            applyEvent,
            isTerminal,
        }};
        "#
    );

    let result = engine.load_program("puddy-models", &test_harness);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load puddy models: {result}"
    );
    let _ = engine.step_json();
    engine
}

/// Helper: create an engine with the full puddy stack loaded (models + networking).
/// All files are concatenated into a single program so class/function declarations
/// are visible to each other within the same eval scope.
fn engine_with_networking() -> JamEngine {
    let mut engine = JamEngine::new();

    let events_ts = include_str!("../examples/puddy/ts/models/events.ts");
    let session_ts = include_str!("../examples/puddy/ts/models/session.ts");
    let client_ts = include_str!("../examples/puddy/ts/networking/client.ts");
    let manager_ts = include_str!("../examples/puddy/ts/networking/session-manager.ts");

    // Concatenate all files and add test harness.
    // Must be a single load_program call so all declarations share the same scope.
    let combined = format!(
        "{events_ts}\n{session_ts}\n{client_ts}\n{manager_ts}\n\
        globalThis.__test = {{\
            parseACPMessage,\
            createSession,\
            applyEvent,\
            isTerminal,\
            SandboxAgentClient,\
            SandboxAgentError,\
            SessionManager,\
        }};"
    );

    let result = engine.load_program("puddy-full", &combined);
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
    let ts = format!(
        "const t = globalThis.__test;\n{setup_js}"
    );

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

    assert!(facts.contains(r#""result_type","event""#), "should be event: {facts}");
    assert!(facts.contains(r#""payload_type","agentMessageChunk""#), "payload type: {facts}");
    assert!(facts.contains(r#""text","Hello""#), "text: {facts}");
    assert!(facts.contains(r#""event_index",1"#), "event index: {facts}");
    assert!(facts.contains(r#""idx_after",1"#), "idx incremented: {facts}");
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

    assert!(facts.contains(r#""payload_type","agentThoughtChunk""#), "{facts}");
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

    assert!(facts.contains(r#""payload_type","toolCallUpdate""#), "{facts}");
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
// AgentSession State Machine Tests
// ============================================================================

#[test]
fn test_session_starts_in_starting_status() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const session = t.createSession("s1", "claude");
        claim("status", session.status.type);
        claim("messages", session.messages.length);
        claim("streaming", session.streamingText === null);
        "#,
    );

    assert!(facts.contains(r#""status","starting""#), "{facts}");
    assert!(facts.contains(r#""messages",0"#), "{facts}");
    assert!(facts.contains(r#""streaming",true"#), "{facts}");
}

#[test]
fn test_message_chunk_transitions_to_active() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "agentMessageChunk", text: "Hello" }
        });

        claim("status", session.status.type);
        claim("streaming", session.streamingText);
        "#,
    );

    assert!(facts.contains(r#""status","active""#), "{facts}");
    assert!(facts.contains(r#""streaming","Hello""#), "{facts}");
}

#[test]
fn test_message_chunks_accumulate() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "agentMessageChunk", text: "Hello " }
        });
        session = t.applyEvent(session, {
            id: "e2", eventIndex: 2,
            payload: { type: "agentMessageChunk", text: "World" }
        });

        claim("streaming", session.streamingText);
        "#,
    );

    assert!(facts.contains(r#""streaming","Hello World""#), "{facts}");
}

#[test]
fn test_session_end_finalizes_streaming_text() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "agentMessageChunk", text: "Final answer" }
        });
        session = t.applyEvent(session, {
            id: "e2", eventIndex: 2,
            payload: { type: "sessionEnd", stopReason: "end_turn" }
        });

        claim("status", session.status.type);
        claim("reason", session.status.reason);
        claim("messages", session.messages.length);
        claim("msg_text", session.messages[0].kind.text);
        claim("streaming_null", session.streamingText === null);
        "#,
    );

    assert!(facts.contains(r#""status","ended""#), "{facts}");
    assert!(facts.contains(r#""reason","end_turn""#), "{facts}");
    assert!(facts.contains(r#""messages",1"#), "{facts}");
    assert!(facts.contains(r#""msg_text","Final answer""#), "{facts}");
    assert!(facts.contains(r#""streaming_null",true"#), "{facts}");
}

#[test]
fn test_tool_call_finalizes_streaming_text_first() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "agentMessageChunk", text: "Let me check..." }
        });
        session = t.applyEvent(session, {
            id: "e2", eventIndex: 2,
            payload: { type: "toolCall", data: {
                toolCallId: "tc-1", title: "Read file", kind: "bash", status: "running"
            }}
        });

        claim("messages", session.messages.length);
        claim("first_kind", session.messages[0].kind.type);
        claim("first_text", session.messages[0].kind.text);
        claim("second_kind", session.messages[1].kind.type);
        claim("second_name", session.messages[1].kind.name);
        claim("streaming_null", session.streamingText === null);
        "#,
    );

    assert!(facts.contains(r#""messages",2"#), "should have 2 messages: {facts}");
    assert!(facts.contains(r#""first_kind","text""#), "first is text: {facts}");
    assert!(facts.contains(r#""first_text","Let me check...""#), "text content: {facts}");
    assert!(facts.contains(r#""second_kind","toolUse""#), "second is toolUse: {facts}");
    assert!(facts.contains(r#""second_name","Read file""#), "tool name: {facts}");
    assert!(facts.contains(r#""streaming_null",true"#), "streaming cleared: {facts}");
}

#[test]
fn test_tool_call_update_completed() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "toolCallUpdate", data: {
                toolCallId: "tc-1", title: "Read file", status: "completed"
            }}
        });

        claim("messages", session.messages.length);
        claim("kind", session.messages[0].kind.type);
        claim("status", session.messages[0].kind.status);
        claim("sender", session.messages[0].sender);
        "#,
    );

    assert!(facts.contains(r#""messages",1"#), "{facts}");
    assert!(facts.contains(r#""kind","toolResult""#), "{facts}");
    assert!(facts.contains(r#""status","completed""#), "{facts}");
    assert!(facts.contains(r#""sender","tool""#), "{facts}");
}

#[test]
fn test_usage_update_tracks_tokens() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "usageUpdate", data: {
                size: 100000, used: 5000, costAmount: 0.05, costCurrency: "USD"
            }}
        });

        claim("has_usage", session.tokenUsage !== null);
        claim("size", session.tokenUsage.contextSize);
        claim("used", session.tokenUsage.contextUsed);
        "#,
    );

    assert!(facts.contains(r#""has_usage",true"#), "{facts}");
    assert!(facts.contains(r#""size",100000"#), "{facts}");
    assert!(facts.contains(r#""used",5000"#), "{facts}");
}

#[test]
fn test_unknown_event_does_not_crash() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("s1");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "unknown", sessionUpdate: "weird_event" }
        });

        claim("status", session.status.type);
        claim("messages", session.messages.length);
        "#,
    );

    assert!(facts.contains(r#""status","starting""#), "{facts}");
    assert!(facts.contains(r#""messages",0"#), "{facts}");
}

#[test]
fn test_is_terminal() {
    let mut engine = engine_with_models();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        claim("starting", t.isTerminal({ type: "starting" }));
        claim("active", t.isTerminal({ type: "active" }));
        claim("ended", t.isTerminal({ type: "ended", reason: "end_turn" }));
        claim("failed", t.isTerminal({ type: "failed", error: "oops" }));
        "#,
    );

    assert!(facts.contains(r#""starting",false"#), "{facts}");
    assert!(facts.contains(r#""active",false"#), "{facts}");
    assert!(facts.contains(r#""ended",true"#), "{facts}");
    assert!(facts.contains(r#""failed",true"#), "{facts}");
}

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

    assert!(facts.contains(r#""has_client",true"#), "SandboxAgentClient: {facts}");
    assert!(facts.contains(r#""has_error",true"#), "SandboxAgentError: {facts}");
    assert!(facts.contains(r#""has_manager",true"#), "SessionManager: {facts}");
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
    assert!(facts.contains(r#""error","No agents found on server""#), "{facts}");
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

/// Load the full puddy app and verify it produces UI claims.
fn load_puddy_app() -> JamEngine {
    let mut engine = JamEngine::new();

    // The puddy.tsx now only depends on jam primitives and components,
    // not the networking stack, since state is managed via hold/when.
    let puddy_tsx = include_str!("../examples/puddy/ts/puddy.tsx");

    let result = engine.load_program("puddy.tsx", puddy_tsx);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load puddy app: {result}"
    );
    let _ = engine.step_json();
    engine
}

#[test]
fn test_puddy_app_loads_with_ui_structure() {
    let engine = load_puddy_app();
    let f = engine.current_facts_json();

    // Root structure
    assert!(f.contains(r#""isa","VStack""#), "root VStack: {f}");
    assert!(f.contains(r#""isa","NavigationSplitView""#), "nav split: {f}");

    // Connection status shows disconnected
    assert!(f.contains("Disconnected"), "disconnected text: {f}");

    // Session list header and new session button
    assert!(f.contains("Sessions"), "sessions header: {f}");
    assert!(f.contains("+ New Session"), "new session button: {f}");

    // No-selection placeholder
    assert!(f.contains("Select a session"), "select prompt: {f}");
}

#[test]
fn test_puddy_create_session_via_button() {
    let mut engine = load_puddy_app();

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
    assert!(callback_id.is_some(), "should find new-session callback: {f}");

    // Press the new session button
    let result = engine.fire_event_by_callback_id(&callback_id.unwrap());
    assert!(!result.starts_with("ERROR"), "fire_event failed: {result}");

    // After pressing, there should be a session in the facts
    let f = engine.current_facts_json();
    assert!(f.contains(r#""agent","claude""#), "session created with agent: {f}");
    assert!(f.contains(r#""status","starting""#), "session status starting: {f}");
}

#[test]
fn test_puddy_session_appears_in_sidebar() {
    let mut engine = load_puddy_app();

    // Inject a session via hold
    engine.eval_js(r#"
        hold("sessions", () => {
            claim("session", "test-session", "agent", "claude");
            claim("session", "test-session", "status", "active");
        });
    "#).unwrap();
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
    engine.eval_js(r#"
        hold("sessions", () => {
            claim("session", "test-session", "agent", "claude");
            claim("session", "test-session", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "test-session"); });
    "#).unwrap();
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

    // Initially disconnected
    let f = engine.current_facts_json();
    assert!(f.contains("Disconnected"), "initial: disconnected: {f}");

    // Update connection status via hold
    engine.eval_js(r#"
        hold("connection", () => {
            claim("connection", "status", "connected");
            claim("connection", "hostname", "myserver.local");
        });
    "#).unwrap();
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
    use jam::rule::{Program, RuleSpec};
    use jam::pattern::{Pattern, PatternTerm};
    use jam::term::{Term, Statement};
    use std::sync::Arc;

    let mut engine = Engine::new();
    engine.add_program(
        Program::new("test")
            .with_rules(vec![
                RuleSpec::new(
                    vec![
                        Pattern::new(vec![PatternTerm::Exact(Term::sym("a")), PatternTerm::Bind("x".into())]),
                        Pattern::new(vec![PatternTerm::Exact(Term::sym("b")), PatternTerm::Bind("y".into())]),
                    ],
                    |bindings, _| {
                        let x = bindings.get("x").unwrap().clone();
                        let y = bindings.get("y").unwrap().clone();
                        vec![Statement::new(vec![Term::sym("result"), x, y])]
                    },
                ),
            ]),
    );

    engine.assert_fact(Statement::new(vec![Term::sym("a"), Term::sym("1")]));
    engine.assert_fact(Statement::new(vec![Term::sym("b"), Term::sym("2")]));
    let result = engine.step();

    let has_result = result.deltas.iter().any(|(s, w)| {
        *w > 0 && s == &Statement::new(vec![Term::sym("result"), Term::sym("1"), Term::sym("2")])
    });
    assert!(has_result, "cross-join should produce result: {:?}", result.deltas);
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
    engine.eval_js(r#"
        claim("rule_count", globalThis.__jam.rules.length);
        for (let i = 0; i < globalThis.__jam.rules.length; i++) {
            const r = globalThis.__jam.rules[i];
            claim("rule_" + i + "_patterns", r.patterns.length);
            claim("rule_" + i + "_whens", r.whens.length);
        }
    "#).unwrap();
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
    assert!(f.contains(r#""text","First item""#), "should render item-1 text claim: {f}");
    // Item-2 data exists as a base fact but should NOT have a rendered text claim
    assert!(!f.contains(r#""text","Second item""#), "should not render item-2: {f}");
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
    assert!(f.contains(r#""text","Hello""#), "message should render: {f}");
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
    assert!(f.contains(r#""text","Hello""#), "4-term late fact join: {f}");

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
    engine.eval_js(r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#).unwrap();
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
    assert!(f.contains("Hi! How can I help?"), "assistant message text: {f}");
    assert!(f.contains("\u{1F464}"), "user icon 👤: {f}"); // 👤
    assert!(f.contains("\u{2728}"), "assistant icon ✨: {f}"); // ✨
}

#[test]
fn test_puddy_tool_messages_render() {
    let mut engine = load_puddy_app();

    engine.eval_js(r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#).unwrap();
    let _ = engine.step_json();

    engine.eval_js(r#"
        hold("msg-s1-m1", () => { claim("message", "s1", "m1", "assistant", "toolUse", "Read file"); });
        hold("msg-s1-m2", () => { claim("message", "s1", "m2", "tool", "toolResult", "completed"); });
    "#).unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    assert!(f.contains("Read file"), "tool use should render: {f}");
    assert!(f.contains("completed"), "tool result should render: {f}");
    assert!(f.contains("🔧"), "tool icon: {f}");
}

#[test]
fn test_puddy_streaming_text_shows() {
    let mut engine = load_puddy_app();

    engine.eval_js(r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
            claim("session", "s1", "streamingText", "I am thinking...");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#).unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    assert!(f.contains("I am thinking..."), "streaming text should show: {f}");
}

#[test]
fn test_puddy_text_input_adds_message() {
    let mut engine = load_puddy_app();

    // Create and select a session
    engine.eval_js(r#"
        hold("sessions", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#).unwrap();
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
        "Test message from user"
    );
    assert!(!result.starts_with("ERROR"), "fire failed: {result}");

    let f = engine.current_facts_json();
    assert!(
        f.contains("Test message from user"),
        "user message should appear: {f}"
    );
}

// ============================================================================
// End-to-end integration tests
// ============================================================================

#[test]
fn test_e2e_full_session_lifecycle() {
    // Test the complete flow: load app → connect → create session →
    // receive messages → send message → tool call → session end
    let mut engine = load_puddy_app();

    // 1. Initial state: disconnected, no sessions, "Select a session"
    let f = engine.current_facts_json();
    assert!(f.contains("Disconnected"), "1a: disconnected");
    assert!(f.contains("Sessions"), "1b: session header");
    assert!(f.contains("Select a session"), "1c: no selection");

    // 2. Simulate connection
    engine.eval_js(r#"
        hold("connection", () => {
            claim("connection", "status", "connected");
            claim("connection", "hostname", "agent.local");
        });
    "#).unwrap();
    let _ = engine.step_json();
    let f = engine.current_facts_json();
    assert!(f.contains("agent.local"), "2a: hostname shows");
    assert!(f.contains(r#""foregroundColor","green""#), "2b: green dot");

    // 3. Create a session (simulating what the button callback does)
    engine.eval_js(r#"
        hold("session-s1", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "starting");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#).unwrap();
    let _ = engine.step_json();
    let f = engine.current_facts_json();
    assert!(f.contains("Session: s1"), "3a: detail title");
    // Session row should exist in sidebar with starting status
    assert!(f.contains(r#""status","starting""#), "3b: starting status in facts");

    // 4. Session becomes active with streaming text
    engine.eval_js(r#"
        hold("session-s1", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
            claim("session", "s1", "streamingText", "Let me help you with that...");
        });
    "#).unwrap();
    let _ = engine.step_json();
    let f = engine.current_facts_json();
    assert!(f.contains("Let me help you with that..."), "4a: streaming text");

    // 5. Messages arrive
    engine.eval_js(r#"
        hold("session-s1-msgs", () => {
            claim("message", "s1", "m1", "user", "text", "Hello Claude!");
            claim("message", "s1", "m2", "assistant", "text", "Hi! How can I help?");
        });
    "#).unwrap();
    let _ = engine.step_json();
    let f = engine.current_facts_json();
    assert!(f.contains("Hello Claude!"), "5a: user message");
    assert!(f.contains("Hi! How can I help?"), "5b: assistant message");
    assert!(f.contains("\u{1F464}"), "5c: user icon 👤");
    assert!(f.contains("\u{2728}"), "5d: assistant icon ✨");

    // 6. Tool call
    engine.eval_js(r#"
        hold("session-s1-msgs", () => {
            claim("message", "s1", "m1", "user", "text", "Hello Claude!");
            claim("message", "s1", "m2", "assistant", "text", "Hi! How can I help?");
            claim("message", "s1", "m3", "assistant", "toolUse", "Read file");
            claim("message", "s1", "m4", "tool", "toolResult", "completed");
        });
    "#).unwrap();
    let _ = engine.step_json();
    let f = engine.current_facts_json();
    assert!(f.contains("Read file"), "6a: tool use");
    assert!(f.contains("\u{2713}"), "6b: checkmark ✓");

    // 7. Session ends
    engine.eval_js(r#"
        hold("session-s1", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "ended");
            claim("session", "s1", "statusDetail", "end_turn");
        });
    "#).unwrap();
    let _ = engine.step_json();
    let f = engine.current_facts_json();
    // Session status should update in sidebar
    assert!(
        f.contains(r#""foregroundColor","secondary""#) || f.contains("ended"),
        "7a: ended status"
    );
}

#[test]
fn test_e2e_multiple_sessions() {
    let mut engine = load_puddy_app();

    // Create two sessions
    engine.eval_js(r#"
        hold("session-s1", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("session-s2", () => {
            claim("session", "s2", "agent", "claude");
            claim("session", "s2", "status", "starting");
        });
    "#).unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    // Both sessions should appear in sidebar
    assert!(f.contains("s1"), "session 1 in sidebar");
    assert!(f.contains("s2"), "session 2 in sidebar");

    // Select session 2
    engine.eval_js(r#"
        hold("ui", () => { claim("ui", "selectedSession", "s2"); });
    "#).unwrap();
    let _ = engine.step_json();

    let f = engine.current_facts_json();
    assert!(f.contains("Session: s2"), "session 2 selected");
}

#[test]
fn test_e2e_text_input_sends_message() {
    let mut engine = load_puddy_app();

    // Set up session
    engine.eval_js(r#"
        hold("session-s1", () => {
            claim("session", "s1", "agent", "claude");
            claim("session", "s1", "status", "active");
        });
        hold("ui", () => { claim("ui", "selectedSession", "s1"); });
    "#).unwrap();
    let _ = engine.step_json();

    // Find TextField onSubmit callback
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
    assert!(callback_id.is_some(), "should find TextField callback: {f}");

    // Submit text
    let cb_id = callback_id.unwrap();
    let entity_id = cb_id.replace(":onSubmit", "");
    engine.fire_event_with_data(&entity_id, "onSubmit", "What is Rust?");

    let f = engine.current_facts_json();
    assert!(
        f.contains("What is Rust?"),
        "submitted message should appear: {f}"
    );
}

#[test]
fn test_e2e_new_session_button() {
    let mut engine = load_puddy_app();

    // Find the new session button callback
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
    assert!(callback_id.is_some(), "should find new-session callback");

    // Press the button
    let result = engine.fire_event_by_callback_id(&callback_id.unwrap());
    assert!(!result.starts_with("ERROR"), "button press failed: {result}");

    // A session should now exist
    let f = engine.current_facts_json();
    assert!(
        f.contains(r#""agent","claude""#),
        "session created with agent: {f}"
    );
    assert!(
        f.contains(r#""status","starting""#),
        "session in starting state: {f}"
    );
}

#[test]
fn test_session_state_machine_full_lifecycle() {
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        let session = t.createSession("test-1", "claude");
        session = t.applyEvent(session, {
            id: "e1", eventIndex: 1,
            payload: { type: "agentMessageChunk", text: "Hello, " }
        });
        session = t.applyEvent(session, {
            id: "e2", eventIndex: 2,
            payload: { type: "agentMessageChunk", text: "how can I help?" }
        });
        claim("status", session.status.type);
        claim("streaming", session.streamingText);

        session = t.applyEvent(session, {
            id: "e3", eventIndex: 3,
            payload: { type: "toolCall", data: {
                toolCallId: "tc-1", title: "Read file", status: "running"
            }}
        });
        claim("after_tool_messages", session.messages.length);

        session = t.applyEvent(session, {
            id: "e4", eventIndex: 4,
            payload: { type: "sessionEnd", stopReason: "end_turn" }
        });
        claim("final_status", session.status.type);
        claim("final_reason", session.status.reason);
        "#,
    );

    assert!(facts.contains(r#""status","active""#), "{facts}");
    assert!(facts.contains(r#""streaming","Hello, how can I help?""#), "{facts}");
    assert!(facts.contains(r#""after_tool_messages",2"#), "{facts}");
    assert!(facts.contains(r#""final_status","ended""#), "{facts}");
    assert!(facts.contains(r#""final_reason","end_turn""#), "{facts}");
}

#[test]
fn test_session_manager_readiness_ready() {
    let mut engine = engine_with_networking();
    let facts = eval_and_get_facts(
        &mut engine,
        r#"
        const mgr = new t.SessionManager();
        mgr.isConnected = true;
        mgr.agents = [{ id: "claude", installed: true, credentialsAvailable: true }];
        claim("ready", mgr.hasReadyAgent);
        claim("preferred", mgr.preferredAgent.id);
        claim("no_error", mgr.agentReadinessError === undefined);
        "#,
    );

    assert!(facts.contains(r#""ready",true"#), "{facts}");
    assert!(facts.contains(r#""preferred","claude""#), "{facts}");
    assert!(facts.contains(r#""no_error",true"#), "{facts}");
}
