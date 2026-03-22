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
