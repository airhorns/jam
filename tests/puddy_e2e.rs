//! End-to-end tests for the puddy UI.
//! These load the full puddy program (all TS/TSX files), step the engine,
//! and verify the entity tree structure produced by the claims.

use jam::bridge::JamEngine;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// Load the full puddy program into an engine, matching the file order
/// from ContentView.swift.
fn engine_with_full_puddy() -> JamEngine {
    let mut engine = JamEngine::new();

    let files = [
        include_str!("../examples/puddy/ts/models/events.ts"),
        include_str!("../examples/puddy/ts/models/session.ts"),
        include_str!("../examples/puddy/ts/networking/client.ts"),
        include_str!("../examples/puddy/ts/networking/session-manager.ts"),
        include_str!("../examples/puddy/ts/components/ConversationItem.tsx"),
        include_str!("../examples/puddy/ts/components/SessionList.tsx"),
        include_str!("../examples/puddy/ts/components/SessionDetail.tsx"),
        include_str!("../examples/puddy/ts/components/ConnectionStatus.tsx"),
        include_str!("../examples/puddy/ts/puddy.tsx"),
    ];

    let combined: String = files.join("\n");

    let result = engine.load_program("puddy.tsx", &combined);
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
        output.push_str(&format!(
            "{:indent$}[cycle: {id}]\n",
            "",
            indent = indent
        ));
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
        output.push_str(&format!(
            "{:indent$}[missing: {id}]\n",
            "",
            indent = indent
        ));
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
    let sidebar_pos = app_children.iter().position(|c| c.contains("sidebar")).unwrap();
    let detail_pos = app_children.iter().position(|c| c.contains("detail")).unwrap();
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

    // Find the new-session button callback
    let facts_json = engine.current_facts_json();
    let entities = build_entity_map(&facts_json);

    // Find the new session button
    let new_session_entity = entities
        .keys()
        .find(|k| k.contains("new-session"))
        .cloned();
    assert!(
        new_session_entity.is_some(),
        "should have a new-session button"
    );

    let btn_id = new_session_entity.unwrap();
    let entity = &entities[&btn_id];
    assert_eq!(entity.entity_type, "Button", "new-session should be a Button");

    // Fire the new session button
    engine.fire_event(&btn_id, "onPress");
    let _ = engine.step_json();

    // After pressing, we should have a session fact
    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("\"session\""),
        "should have session facts after pressing new session"
    );
    assert!(
        facts_json.contains("\"starting\""),
        "new session should have starting status"
    );
}

#[test]
fn test_puddy_send_message() {
    let mut engine = engine_with_full_puddy();

    // Create a session first
    let new_session_btn = {
        let facts_json = engine.current_facts_json();
        let entities = build_entity_map(&facts_json);
        entities
            .keys()
            .find(|k| k.contains("new-session"))
            .cloned()
            .unwrap()
    };

    engine.fire_event(&new_session_btn, "onPress");
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

    // Should have a message fact
    let facts_json = engine.current_facts_json();
    assert!(
        facts_json.contains("Hello world"),
        "should have the submitted message in facts"
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
