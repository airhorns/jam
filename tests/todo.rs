//! Integration tests for the todo list example app.
//! Loads the todo.tsx program into JamEngine and exercises all operations:
//! add, complete, uncomplete, edit, delete, and reactive UI updates.

use jam::bridge::JamEngine;

/// Load the todo app and return a ready engine.
fn load_todo_app() -> JamEngine {
    let mut engine = JamEngine::new();
    let todo_tsx = include_str!("../examples/todo/ts/todo.tsx");
    let result = engine.load_program("todo.tsx", todo_tsx);
    assert!(
        !result.starts_with("ERROR"),
        "Failed to load todo app: {result}"
    );
    let _ = engine.step_json();
    engine
}

/// Helper: eval JS, step, return current facts as JSON string.
fn eval_and_get_facts(engine: &mut JamEngine, js: &str) -> String {
    engine.eval_js(js).expect("eval_js failed");
    let _ = engine.step_json();
    engine.current_facts_json()
}

/// Helper: find a callback ID containing the given substring in the facts JSON.
fn find_callback(facts: &str, substring: &str) -> Option<String> {
    let parsed: Vec<serde_json::Value> = serde_json::from_str(facts).unwrap();
    parsed.iter().find_map(|fact| {
        let arr = fact.as_array()?;
        for term in arr {
            if let Some(s) = term.as_str() {
                if s.contains(substring) && s.contains(':') {
                    return Some(s.to_string());
                }
            }
        }
        None
    })
}

// ============================================================================
// App Loading
// ============================================================================

#[test]
fn test_todo_app_loads() {
    let engine = load_todo_app();
    let f = engine.current_facts_json();

    // Should have the header
    assert!(f.contains("Todos"), "should show Todos header: {f}");
    // Should have the text field
    assert!(f.contains(r#""isa","TextField""#), "should have input field: {f}");
    // Should have the initial nextId
    assert!(f.contains(r#""todo","nextId",1"#), "should have nextId=1: {f}");
}

#[test]
fn test_todo_app_starts_empty() {
    let engine = load_todo_app();
    let f = engine.current_facts_json();

    // No todo title claims should exist
    assert!(!f.contains(r#""title","#) || f.contains(r#""largeTitle""#),
        "should have no todo items initially");
    // Verify no "done" claims for todos
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&f).unwrap();
    let todo_done_claims = parsed.iter().filter(|fact| {
        let arr = fact.as_array().unwrap();
        arr.len() >= 4
            && arr[0].as_str() == Some("todo")
            && arr[2].as_str() == Some("done")
    }).count();
    assert_eq!(todo_done_claims, 0, "should have no todo done claims");
}

// ============================================================================
// Adding Todos
// ============================================================================

#[test]
fn test_add_single_todo() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"addTodo("Buy groceries");"#);

    assert!(f.contains(r#""todo",1,"title","Buy groceries""#), "todo title: {f}");
    assert!(f.contains(r#""todo",1,"done",false"#), "todo not done: {f}");
    assert!(f.contains(r#""todo","nextId",2"#), "nextId incremented: {f}");
}

#[test]
fn test_add_multiple_todos() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("First");
        addTodo("Second");
        addTodo("Third");
    "#);

    assert!(f.contains(r#""todo",1,"title","First""#), "first: {f}");
    assert!(f.contains(r#""todo",2,"title","Second""#), "second: {f}");
    assert!(f.contains(r#""todo",3,"title","Third""#), "third: {f}");
    assert!(f.contains(r#""todo","nextId",4"#), "nextId=4: {f}");

    // All should be not done
    assert!(f.contains(r#""todo",1,"done",false"#), "first not done: {f}");
    assert!(f.contains(r#""todo",2,"done",false"#), "second not done: {f}");
    assert!(f.contains(r#""todo",3,"done",false"#), "third not done: {f}");
}

#[test]
fn test_add_empty_title_ignored() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("");
        addTodo("   ");
    "#);

    // nextId should still be 1 — nothing was added
    assert!(f.contains(r#""todo","nextId",1"#), "nextId unchanged: {f}");
}

#[test]
fn test_add_trims_whitespace() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"addTodo("  Clean house  ");"#);

    assert!(f.contains(r#""todo",1,"title","Clean house""#), "trimmed: {f}");
}

// ============================================================================
// Marking Complete / Uncomplete
// ============================================================================

#[test]
fn test_mark_todo_done() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy milk");
        toggleTodo(1);
    "#);

    assert!(f.contains(r#""todo",1,"done",true"#), "should be done: {f}");
    assert!(f.contains(r#""todo",1,"title","Buy milk""#), "title preserved: {f}");
}

#[test]
fn test_unmark_todo_done() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy milk");
        toggleTodo(1);
        toggleTodo(1);
    "#);

    assert!(f.contains(r#""todo",1,"done",false"#), "should be undone: {f}");
}

#[test]
fn test_toggle_specific_todo_in_list() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("First");
        addTodo("Second");
        addTodo("Third");
        toggleTodo(2);
    "#);

    assert!(f.contains(r#""todo",1,"done",false"#), "first untouched: {f}");
    assert!(f.contains(r#""todo",2,"done",true"#), "second toggled: {f}");
    assert!(f.contains(r#""todo",3,"done",false"#), "third untouched: {f}");
}

// ============================================================================
// Editing Titles
// ============================================================================

#[test]
fn test_edit_todo_title() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy groceries");
        editTodo(1, "Buy organic groceries");
    "#);

    assert!(f.contains(r#""todo",1,"title","Buy organic groceries""#), "edited: {f}");
    assert!(!f.contains(r#""Buy groceries""#), "old title gone: {f}");
}

#[test]
fn test_edit_preserves_done_state() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy groceries");
        toggleTodo(1);
        editTodo(1, "Buy organic groceries");
    "#);

    assert!(f.contains(r#""todo",1,"done",true"#), "still done: {f}");
    assert!(f.contains(r#""todo",1,"title","Buy organic groceries""#), "title edited: {f}");
}

#[test]
fn test_edit_only_affects_target() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("First");
        addTodo("Second");
        editTodo(1, "Modified");
    "#);

    assert!(f.contains(r#""todo",1,"title","Modified""#), "first edited: {f}");
    assert!(f.contains(r#""todo",2,"title","Second""#), "second unchanged: {f}");
}

// ============================================================================
// Deleting Todos
// ============================================================================

#[test]
fn test_delete_todo() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy milk");
        deleteTodo(1);
    "#);

    assert!(!f.contains(r#""todo",1,"title""#), "todo removed: {f}");
    assert!(!f.contains(r#""todo",1,"done""#), "done claim removed: {f}");
}

#[test]
fn test_delete_middle_todo() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("First");
        addTodo("Second");
        addTodo("Third");
        deleteTodo(2);
    "#);

    assert!(f.contains(r#""todo",1,"title","First""#), "first survives: {f}");
    assert!(!f.contains(r#""todo",2,"title""#), "second gone: {f}");
    assert!(f.contains(r#""todo",3,"title","Third""#), "third survives: {f}");
}

#[test]
fn test_delete_all_todos() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("First");
        addTodo("Second");
        deleteTodo(1);
        deleteTodo(2);
    "#);

    let parsed: Vec<serde_json::Value> = serde_json::from_str(&f).unwrap();
    let todo_claims = parsed.iter().filter(|fact| {
        let arr = fact.as_array().unwrap();
        arr.len() >= 4
            && arr[0].as_str() == Some("todo")
            && arr[1].is_number()
    }).count();
    assert_eq!(todo_claims, 0, "all todos removed: {f}");
}

// ============================================================================
// Combined Operations
// ============================================================================

#[test]
fn test_add_complete_delete_sequence() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Task A");
        addTodo("Task B");
        addTodo("Task C");
        toggleTodo(1);
        toggleTodo(3);
        deleteTodo(2);
        editTodo(3, "Task C (updated)");
    "#);

    // Task A: done
    assert!(f.contains(r#""todo",1,"done",true"#), "A done: {f}");
    assert!(f.contains(r#""todo",1,"title","Task A""#), "A title: {f}");

    // Task B: deleted
    assert!(!f.contains(r#""todo",2,"title""#), "B gone: {f}");

    // Task C: done + edited
    assert!(f.contains(r#""todo",3,"done",true"#), "C done: {f}");
    assert!(f.contains(r#""todo",3,"title","Task C (updated)""#), "C edited: {f}");
}

#[test]
fn test_delete_and_add_new_gets_fresh_id() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Old");
        deleteTodo(1);
        addTodo("New");
    "#);

    // The new todo should get id=2, not reuse id=1
    assert!(!f.contains(r#""todo",1,"title""#), "old deleted: {f}");
    assert!(f.contains(r#""todo",2,"title","New""#), "new has id 2: {f}");
}

// ============================================================================
// Reactive UI Tests
// ============================================================================

#[test]
fn test_ui_renders_todo_items() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy groceries");
        addTodo("Walk the dog");
    "#);

    // The when() rule should match and render UI elements for each todo
    // Check that todo text appears in rendered claims
    assert!(f.contains("Buy groceries"), "first todo rendered: {f}");
    assert!(f.contains("Walk the dog"), "second todo rendered: {f}");
}

#[test]
fn test_ui_shows_check_mark_for_done() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy groceries");
        toggleTodo(1);
    "#);

    // The done todo should render with a checkmark label
    assert!(f.contains(r#""label","✓""#), "done shows checkmark: {f}");
}

#[test]
fn test_ui_shows_circle_for_undone() {
    let mut engine = load_todo_app();
    let f = eval_and_get_facts(&mut engine, r#"
        addTodo("Buy groceries");
    "#);

    // The undone todo should render with a circle label
    assert!(f.contains(r#""label","○""#), "undone shows circle: {f}");
}

#[test]
fn test_ui_updates_after_toggle() {
    let mut engine = load_todo_app();

    // Add a todo — should show circle
    let f = eval_and_get_facts(&mut engine, r#"addTodo("Test item");"#);
    assert!(f.contains(r#""label","○""#), "initially circle: {f}");

    // Toggle it — should show checkmark
    let f = eval_and_get_facts(&mut engine, r#"toggleTodo(1);"#);
    assert!(f.contains(r#""label","✓""#), "after toggle shows check: {f}");

    // Toggle again — back to circle
    let f = eval_and_get_facts(&mut engine, r#"toggleTodo(1);"#);
    assert!(f.contains(r#""label","○""#), "after re-toggle shows circle: {f}");
}

#[test]
fn test_ui_removes_item_after_delete() {
    let mut engine = load_todo_app();
    eval_and_get_facts(&mut engine, r#"
        addTodo("Keep me");
        addTodo("Delete me");
    "#);
    let f = eval_and_get_facts(&mut engine, r#"deleteTodo(2);"#);

    assert!(f.contains("Keep me"), "kept todo still visible: {f}");
    assert!(!f.contains("Delete me"), "deleted todo gone from UI: {f}");
}

// ============================================================================
// Callback-driven operations (via fire_event)
// ============================================================================

#[test]
fn test_toggle_via_button_callback() {
    let mut engine = load_todo_app();
    eval_and_get_facts(&mut engine, r#"addTodo("Test callback");"#);

    let f = engine.current_facts_json();

    // Find the toggle button's callback ID
    let toggle_cb = find_callback(&f, "toggle");
    assert!(toggle_cb.is_some(), "should find toggle callback: {f}");

    // Fire the toggle callback
    let result = engine.fire_event_by_callback_id(&toggle_cb.unwrap());
    assert!(!result.starts_with("ERROR"), "fire_event failed: {result}");

    let f = engine.current_facts_json();
    assert!(f.contains(r#""todo",1,"done",true"#), "toggled via callback: {f}");
}

#[test]
fn test_delete_via_button_callback() {
    let mut engine = load_todo_app();
    eval_and_get_facts(&mut engine, r#"addTodo("Delete via button");"#);

    let f = engine.current_facts_json();

    // Find the delete button's callback ID
    let delete_cb = find_callback(&f, "delete");
    assert!(delete_cb.is_some(), "should find delete callback: {f}");

    let result = engine.fire_event_by_callback_id(&delete_cb.unwrap());
    assert!(!result.starts_with("ERROR"), "fire_event failed: {result}");

    let f = engine.current_facts_json();
    assert!(!f.contains("Delete via button"), "deleted via callback: {f}");
}

#[test]
fn test_text_field_submit_adds_todo() {
    let mut engine = load_todo_app();
    let f = engine.current_facts_json();

    // Find the text field's onSubmit callback
    let submit_cb = find_callback(&f, "onSubmit");
    assert!(submit_cb.is_some(), "should find onSubmit callback: {f}");

    // Extract entityId and eventName from callback ID (format: "entityId:eventName")
    let cb_id = submit_cb.unwrap();
    let (entity_id, event_name) = cb_id.rsplit_once(':').unwrap();

    // Fire the callback with data, just like the Swift host does
    let result = engine.fire_event_with_data(entity_id, event_name, "Buy groceries");
    assert!(!result.starts_with("ERROR"), "fire_event_with_data failed: {result}");

    let f = engine.current_facts_json();
    assert!(f.contains(r#""todo",1,"title","Buy groceries""#), "todo added via text field: {f}");
}

#[test]
fn test_text_field_submit_multiple_times() {
    let mut engine = load_todo_app();
    let f = engine.current_facts_json();
    let cb_id = find_callback(&f, "onSubmit").expect("onSubmit callback");
    let (entity_id, event_name) = cb_id.rsplit_once(':').unwrap();

    engine.fire_event_with_data(entity_id, event_name, "First todo");
    engine.fire_event_with_data(entity_id, event_name, "Second todo");
    let result = engine.fire_event_with_data(entity_id, event_name, "Third todo");
    assert!(!result.starts_with("ERROR"), "fire failed: {result}");

    let f = engine.current_facts_json();
    assert!(f.contains(r#""todo",1,"title","First todo""#), "first: {f}");
    assert!(f.contains(r#""todo",2,"title","Second todo""#), "second: {f}");
    assert!(f.contains(r#""todo",3,"title","Third todo""#), "third: {f}");
}

#[test]
fn test_text_field_submit_empty_ignored() {
    let mut engine = load_todo_app();
    let f = engine.current_facts_json();
    let cb_id = find_callback(&f, "onSubmit").expect("onSubmit callback");
    let (entity_id, event_name) = cb_id.rsplit_once(':').unwrap();

    engine.fire_event_with_data(entity_id, event_name, "");
    engine.fire_event_with_data(entity_id, event_name, "   ");

    let f = engine.current_facts_json();
    assert!(f.contains(r#""todo","nextId",1"#), "nothing added: {f}");
}

#[test]
fn test_full_ui_flow_add_toggle_delete_via_callbacks() {
    let mut engine = load_todo_app();

    // Add via text field submit
    let f = engine.current_facts_json();
    let submit_cb = find_callback(&f, "onSubmit").expect("onSubmit");
    let (eid, ename) = submit_cb.rsplit_once(':').unwrap();
    engine.fire_event_with_data(eid, ename, "Walk the dog");

    let f = engine.current_facts_json();
    assert!(f.contains(r#""todo",1,"title","Walk the dog""#), "added: {f}");
    assert!(f.contains(r#""todo",1,"done",false"#), "not done: {f}");

    // Toggle via button callback
    let toggle_cb = find_callback(&f, "toggle").expect("toggle callback");
    let result = engine.fire_event_by_callback_id(&toggle_cb);
    assert!(!result.starts_with("ERROR"), "toggle failed: {result}");

    let f = engine.current_facts_json();
    assert!(f.contains(r#""todo",1,"done",true"#), "toggled done: {f}");

    // Delete via button callback
    let delete_cb = find_callback(&f, "delete").expect("delete callback");
    let result = engine.fire_event_by_callback_id(&delete_cb);
    assert!(!result.starts_with("ERROR"), "delete failed: {result}");

    let f = engine.current_facts_json();
    assert!(!f.contains("Walk the dog"), "deleted: {f}");
}
