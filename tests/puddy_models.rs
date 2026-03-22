//! Tests for the puddy data model (session state machine + event parser).
//! These load the TypeScript model code into QuickJS and verify behavior
//! matches the original Swift implementation.

use jam::bridge::JamEngine;

/// Helper: create an engine with the puddy model code loaded.
fn engine_with_models() -> JamEngine {
    let mut engine = JamEngine::new();

    // Load the event parser and session model as a TS program.
    // We use the actual source files from the example directory.
    let events_ts = include_str!("../examples/puddy/ts/models/events.ts");
    let session_ts = include_str!("../examples/puddy/ts/models/session.ts");

    // Combine into a single program that exposes test helpers
    let test_harness = format!(
        r#"
        {events_ts}
        {session_ts}

        // Test harness: expose functions to the global scope for testing
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

/// Helper: evaluate JS in the engine's context and return claims as JSON string
fn eval_and_get_facts(engine: &mut JamEngine, setup_js: &str) -> String {
    // Load a new program that uses the test harness
    let ts = format!(
        r#"
        const t = globalThis.__test;
        {setup_js}
        "#
    );

    let result = engine.load_program("test-script", &ts);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load test script: {result}"
    );
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
