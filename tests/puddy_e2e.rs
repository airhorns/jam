//! End-to-end tests for the puddy UI.
//! These load the full puddy program (all TS/TSX files), step the engine,
//! and verify the entity tree structure produced by the claims.

use jam::bridge::JamEngine;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// Load the full puddy program into an engine as ES modules.
fn engine_with_full_puddy() -> JamEngine {
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
        "Failed to load puddy program: {result}"
    );
    let _ = engine.step_json();
    engine
}

/// Parse the facts JSON into a structured entity map for easier assertions.
#[derive(Debug, Clone)]
struct Entity {
    entity_type: String,
    properties: BTreeMap<String, String>,
    children: Vec<(String, String)>, // (sort_key, child_id)
}

fn build_entity_map(facts_json: &str) -> BTreeMap<String, Entity> {
    let facts: Vec<Value> = serde_json::from_str(facts_json).unwrap();
    let mut entities: BTreeMap<String, Entity> = BTreeMap::new();

    for fact in &facts {
        let terms = fact.as_array().unwrap();
        if terms.len() < 3 {
            continue;
        }
        let entity_id = terms[0].as_str().unwrap_or_default().to_string();
        let predicate = terms[1].as_str().unwrap_or_default().to_string();

        let entity = entities.entry(entity_id.clone()).or_insert_with(|| Entity {
            entity_type: String::new(),
            properties: BTreeMap::new(),
            children: Vec::new(),
        });

        match predicate.as_str() {
            "isa" => {
                entity.entity_type = terms[2].as_str().unwrap_or_default().to_string();
            }
            "child" if terms.len() >= 4 => {
                let sort_key = terms[2].as_str().unwrap_or_default().to_string();
                let child_id = terms[3].as_str().unwrap_or_default().to_string();
                entity.children.push((sort_key, child_id));
            }
            _ => {
                let value = match &terms[2] {
                    Value::String(s) => s.clone(),
                    Value::Number(n) => n.to_string(),
                    Value::Bool(b) => b.to_string(),
                    other => format!("{other}"),
                };
                entity.properties.insert(predicate, value);
            }
        }
    }

    // Sort children by sort_key
    for entity in entities.values_mut() {
        entity.children.sort_by(|a, b| a.0.cmp(&b.0));
    }

    entities
}

/// Print the entity tree for debugging (hierarchical view).
fn print_entity_tree(
    entities: &BTreeMap<String, Entity>,
    id: &str,
    indent: usize,
    visited: &mut BTreeSet<String>,
) -> String {
    let mut output = String::new();
    if visited.contains(id) {
        output.push_str(&format!("{:indent$}[cycle: {id}]\n", "", indent = indent));
        return output;
    }
    visited.insert(id.to_string());

    if let Some(entity) = entities.get(id) {
        let type_str = if entity.entity_type.is_empty() {
            "?"
        } else {
            &entity.entity_type
        };
        output.push_str(&format!(
            "{:indent$}<{type_str} id=\"{id}\"",
            "",
            indent = indent
        ));

        // Print relevant props (skip callback IDs)
        for (k, v) in &entity.properties {
            if v.contains(':') && (k == "onPress" || k == "onSubmit" || k == "onChange") {
                output.push_str(&format!(" {k}=[callback]"));
            } else {
                output.push_str(&format!(" {k}=\"{v}\""));
            }
        }

        if entity.children.is_empty() {
            output.push_str(" />\n");
        } else {
            output.push_str(">\n");
            for (_, child_id) in &entity.children {
                output.push_str(&print_entity_tree(entities, child_id, indent + 2, visited));
            }
            output.push_str(&format!("{:indent$}</{type_str}>\n", "", indent = indent));
        }
    } else {
        output.push_str(&format!("{:indent$}[missing: {id}]\n", "", indent = indent));
    }

    output
}

fn dump_entity_tree(engine: &JamEngine) -> String {
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);
    let mut visited = BTreeSet::new();
    print_entity_tree(&entities, "root", 0, &mut visited)
}

// ============================================================================
// Tests
// ============================================================================

#[test]
fn test_puddy_loads_without_error() {
    let _engine = engine_with_full_puddy();
    // If we get here, the program loaded and stepped without error
}

#[test]
fn test_puddy_entity_tree_structure() {
    let engine = engine_with_full_puddy();
    let tree = dump_entity_tree(&engine);
    eprintln!("=== Puddy Entity Tree ===\n{tree}");

    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);

    // Root should exist and have children
    assert!(entities.contains_key("root"), "root entity should exist");
    assert!(
        !entities["root"].children.is_empty(),
        "root should have children"
    );

    // root/app should be a NavigationSplitView
    assert_eq!(
        entities.get("root/app").map(|e| e.entity_type.as_str()),
        Some("NavigationSplitView"),
        "root/app should be a NavigationSplitView"
    );

    // NavigationSplitView should have sidebar and detail children
    let app_children: Vec<&str> = entities["root/app"]
        .children
        .iter()
        .map(|(_, id)| id.as_str())
        .collect();
    assert!(
        app_children.contains(&"root/app/sidebar"),
        "app should contain sidebar: got {app_children:?}"
    );
    assert!(
        app_children.contains(&"root/app/detail"),
        "app should contain detail: got {app_children:?}"
    );

    // Sidebar should come before detail (correct ordering)
    let sidebar_pos = app_children
        .iter()
        .position(|c| c.contains("sidebar"))
        .unwrap();
    let detail_pos = app_children
        .iter()
        .position(|c| c.contains("detail"))
        .unwrap();
    assert!(
        sidebar_pos < detail_pos,
        "sidebar should come before detail: sidebar={sidebar_pos}, detail={detail_pos}"
    );

    // Sidebar should be a VStack with the Sessions header
    assert_eq!(
        entities
            .get("root/app/sidebar")
            .map(|e| e.entity_type.as_str()),
        Some("VStack"),
        "sidebar should be a VStack"
    );
}

#[test]
fn test_puddy_connection_status_renders() {
    let engine = engine_with_full_puddy();
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);

    // Should have a connection bar somewhere in the tree
    let connection_entities: Vec<&str> = entities
        .keys()
        .filter(|k| k.contains("connection-bar"))
        .map(|s| s.as_str())
        .collect();
    assert!(
        !connection_entities.is_empty(),
        "should have connection bar entities"
    );
}

#[test]
fn test_puddy_new_session_button() {
    let mut engine = engine_with_full_puddy();

    // Set connection status to "connected" so the button is enabled
    engine
        .eval_js("hold('connection', () => { claim('connection', 'status', 'connected'); claim('connection', 'hostname', 'localhost'); });")
        .unwrap();
    let _ = engine.step_json();

    // Find the new session button
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);
    let new_session_entity = entities.keys().find(|k| k.contains("new-session")).cloned();
    assert!(
        new_session_entity.is_some(),
        "should have a new-session button"
    );
    let btn_id = new_session_entity.unwrap();
    let entity = &entities[&btn_id];
    assert_eq!(
        entity.entity_type, "Button",
        "new-session should be a Button"
    );
    assert!(
        entity.properties.contains_key("onPress"),
        "connected button should have onPress callback"
    );

    // Create a session via eval_js (button would use SessionManager which needs a real server)
    engine
        .eval_js(
            r#"
            hold("session-s1", () => {
                claim("session", "s1", "agent", "claude");
                claim("session", "s1", "status", "starting");
            });
            hold("ui", () => { claim("ui", "selectedSession", "s1"); });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("\"session\""),
        "should have session facts"
    );
    assert!(
        facts_json.contains("\"starting\""),
        "session should have starting status"
    );
}

#[test]
fn test_puddy_new_session_button_click() {
    // Click the "New Session" button when no agent has credentials.
    // SessionManager.createNewSession() throws NoReadyAgent.
    // The button callback has a try/catch so it should not crash.
    let mut engine = engine_with_full_puddy();

    // Set connected so button is enabled
    engine
        .eval_js("hold('connection', () => { claim('connection', 'status', 'connected'); claim('connection', 'hostname', 'localhost'); });")
        .unwrap();
    let _ = engine.step_json();

    // Find and click the button
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);
    let btn_id = entities.keys().find(|k| k.contains("new-session")).cloned().unwrap();

    let result = engine.fire_event(&btn_id, "onPress");
    // Should not crash — the try/catch handles the NoReadyAgent error
    assert!(
        !result.starts_with("ERROR"),
        "Clicking new session button should not crash: {result}"
    );
}

#[test]
fn test_puddy_new_session_button_click_with_session_manager() {
    // Test with SessionManager actually initialized — simulates the real app.
    // SessionManager.createNewSession() will throw NoReadyAgent since no agents
    // have credentials. The button callback must handle this gracefully.
    let mut engine = engine_with_full_puddy();

    // Mock: set connection status and make SessionManager think it's connected
    // but with no ready agents (simulates real scenario where server is up but no agent credentials)
    engine
        .eval_js(r#"
            hold('connection', () => {
                claim('connection', 'status', 'connected');
                claim('connection', 'hostname', 'localhost');
            });
            // Simulate that sessionManager exists and is connected but has no ready agents
            if (typeof sessionManager !== 'undefined' && sessionManager) {
                sessionManager.isConnected = true;
                sessionManager.agents = [{ id: "claude", installed: true, credentialsAvailable: false }];
            }
        "#)
        .unwrap();
    let _ = engine.step_json();

    // Find and click the button
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);
    let btn_id = entities.keys().find(|k| k.contains("new-session")).cloned().unwrap();

    let result = engine.fire_event(&btn_id, "onPress");
    eprintln!("New session button with SM (no creds): {result}");
    // This SHOULD NOT crash — the callback should handle the NoReadyAgent error
    assert!(
        !result.starts_with("ERROR"),
        "Button click with no ready agent should not crash: {result}"
    );
}

#[test]
fn test_puddy_new_session_button_click_with_ready_agent() {
    // Test with SessionManager initialized and a ready agent.
    // createNewSession will succeed, but connectSession will fail (no server).
    // The session should still appear in the UI with "starting" then "failed" status.
    let mut engine = engine_with_full_puddy();

    engine
        .eval_js(r#"
            hold('connection', () => {
                claim('connection', 'status', 'connected');
                claim('connection', 'hostname', 'localhost');
            });
            if (typeof sessionManager !== 'undefined' && sessionManager) {
                sessionManager.isConnected = true;
                sessionManager.agents = [{ id: "claude", installed: true, credentialsAvailable: true }];
            }
        "#)
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);
    let btn_id = entities.keys().find(|k| k.contains("new-session")).cloned().unwrap();

    let result = engine.fire_event(&btn_id, "onPress");
    eprintln!("New session button with ready agent: {result}");
    assert!(
        !result.starts_with("ERROR"),
        "Button click with ready agent should not crash: {result}"
    );

    // Session should have been created with starting status
    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains(r#""starting"#),
        "session should be in starting status: {facts_json}"
    );
}

#[test]
fn test_puddy_send_message() {
    let mut engine = engine_with_full_puddy();

    // Set up a ready agent and create a session through SessionManager
    engine
        .eval_js(
            r#"
            sessionManager.isConnected = true;
            sessionManager.agents = [{ id: "claude", installed: true, credentialsAvailable: true }];
            hold("connection", () => {
                claim("connection", "status", "connected");
                claim("connection", "hostname", "localhost");
            });
            // Create session through SessionManager so hasSession() returns true
            const sid = sessionManager.createNewSession();
            hold("ui", () => { claim("ui", "selectedSession", sid); });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    // Find the text input
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);
    let input_entity = entities
        .keys()
        .find(|k| k.contains("input") && entities[k.as_str()].entity_type == "TextField")
        .cloned();
    assert!(input_entity.is_some(), "should have a TextField input");

    let input_id = input_entity.unwrap();

    // Submit a message
    engine.fire_event_with_data(&input_id, "onSubmit", "Hello world");
    let _ = engine.step_json();

    // Should have a user message fact via SessionManager.sendMessage
    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("Hello world"),
        "should have the submitted message in facts"
    );
}

#[test]
fn test_puddy_thought_messages_render() {
    let mut engine = engine_with_full_puddy();

    engine
        .eval_js(
            r#"
            hold("sessions", () => {
                claim("session", "s1", "agent", "claude");
                claim("session", "s1", "status", "active");
            });
            hold("ui", () => { claim("ui", "selectedSession", "s1"); });
            hold("msg-s1-t1", () => { claim("message", "s1", "t1", "assistant", "thought", "Let me think about this..."); });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("Let me think about this..."),
        "thought message should render: {facts_json}"
    );
    // Should use the dimmed "..." prefix
    assert!(
        facts_json.contains("\"...\""),
        "thought should have ... prefix: {facts_json}"
    );
}

#[test]
fn test_puddy_mode_change_renders() {
    let mut engine = engine_with_full_puddy();

    engine
        .eval_js(
            r#"
            hold("sessions", () => {
                claim("session", "s1", "agent", "claude");
                claim("session", "s1", "status", "active");
                claim("session", "s1", "currentMode", "architect");
            });
            hold("ui", () => { claim("ui", "selectedSession", "s1"); });
            hold("msg-s1-mc1", () => { claim("message", "s1", "mc1", "system", "modeChange", "architect"); });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    // Mode badge should render
    assert!(
        facts_json.contains("[architect]"),
        "mode badge should render: {facts_json}"
    );
    // Mode change message should render
    assert!(
        facts_json.contains("Mode: architect"),
        "mode change message should render: {facts_json}"
    );
}

#[test]
fn test_puddy_plan_renders() {
    let mut engine = engine_with_full_puddy();

    engine
        .eval_js(
            r#"
            hold("sessions", () => {
                claim("session", "s1", "agent", "claude");
                claim("session", "s1", "status", "active");
            });
            hold("ui", () => { claim("ui", "selectedSession", "s1"); });
            hold("plan-s1", () => {
                claim("plan", "s1", "entry-0", "Read the file", "completed", "high");
                claim("plan", "s1", "entry-1", "Fix the bug", "in_progress", "medium");
                claim("plan", "s1", "entry-2", "Run tests", "pending", "low");
                claim("plan", "s1", "count", "3");
            });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    // Plan entries should render with content and status indicators
    assert!(
        facts_json.contains("Read the file"),
        "plan entry 0: {facts_json}"
    );
    assert!(
        facts_json.contains("Fix the bug"),
        "plan entry 1: {facts_json}"
    );
    assert!(
        facts_json.contains("Run tests"),
        "plan entry 2: {facts_json}"
    );
    // Status indicators
    assert!(
        facts_json.contains("[done]"),
        "completed status: {facts_json}"
    );
    assert!(
        facts_json.contains("[...]"),
        "in_progress status: {facts_json}"
    );
    assert!(
        facts_json.contains("[ ]"),
        "pending status: {facts_json}"
    );
}

#[test]
fn test_puddy_streaming_thought_shows() {
    let mut engine = engine_with_full_puddy();

    engine
        .eval_js(
            r#"
            hold("sessions", () => {
                claim("session", "s1", "agent", "claude");
                claim("session", "s1", "status", "active");
                claim("session", "s1", "streamingThought", "Analyzing the code...");
            });
            hold("ui", () => { claim("ui", "selectedSession", "s1"); });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("Analyzing the code..."),
        "streaming thought should show: {facts_json}"
    );
}

#[test]
fn test_puddy_active_tools_indicator() {
    let mut engine = engine_with_full_puddy();

    engine
        .eval_js(
            r#"
            hold("sessions", () => {
                claim("session", "s1", "agent", "claude");
                claim("session", "s1", "status", "active");
                claim("session", "s1", "hasActiveTools", "true");
            });
            hold("ui", () => { claim("ui", "selectedSession", "s1"); });
        "#,
        )
        .unwrap();
    let _ = engine.step_json();

    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("Tools running..."),
        "active tools indicator should show: {facts_json}"
    );
}

#[test]
fn test_puddy_dump_full_tree() {
    // This test dumps the full entity tree for debugging.
    // Run with: cargo test test_puddy_dump_full_tree -- --nocapture
    let engine = engine_with_full_puddy();
    let tree = dump_entity_tree(&engine);
    eprintln!("\n=== Puddy Entity Tree (initial state) ===\n{tree}");

    // Also dump raw facts for debugging
    let facts_json = engine.current_facts_json();
    let facts: Vec<Value> = serde_json::from_str(&facts_json).unwrap();
    eprintln!("=== Raw facts ({} total) ===", facts.len());
    for fact in &facts {
        eprintln!("  {fact}");
    }
}
