import { $, _, when, hold, render } from "./jam";
import { VStack, HStack, Text, Button, ScrollView, TextField, Divider } from "./components";

// ============================================================================
// Todo List Manager
//
// State schema (all stored via hold):
//   hold("todos", [
//     ["todo", id, "title", "..."],
//     ["todo", id, "done", false],
//     ...for each todo
//   ])
//   hold("next-id", [["todo", "nextId", N]])
//
// Each todo has a unique numeric ID. The "todos" hold key contains all todo
// claims as a flat list. Adding/removing/editing todos rebuilds the full list.
// ============================================================================

// --- State helpers ---

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

// Parse all todo claims from the current todos hold state into an array.
// This is called from callbacks to read the current state before modifying it.
let __todos: Todo[] = [];

function setTodos(todos: Todo[]) {
  __todos = todos;
  const stmts: any[][] = [];
  for (const t of todos) {
    stmts.push(["todo", t.id, "title", t.title]);
    stmts.push(["todo", t.id, "done", t.done]);
  }
  hold("todos", stmts);
}

function addTodo(title: string) {
  if (!title.trim()) return;
  const id = __nextId;
  __nextId++;
  hold("next-id", [["todo", "nextId", __nextId]]);
  __todos.push({ id, title: title.trim(), done: false });
  setTodos([...__todos]);
}

function toggleTodo(id: number) {
  setTodos(__todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
}

function editTodo(id: number, title: string) {
  setTodos(__todos.map(t => t.id === id ? { ...t, title } : t));
}

function deleteTodo(id: number) {
  setTodos(__todos.filter(t => t.id !== id));
}

// --- Initial state ---

let __nextId = 1;
hold("next-id", [["todo", "nextId", 1]]);
setTodos([]);

// --- UI ---

function TodoItem({ id, title, done }: { id: number; title: string; done: boolean; key?: string }) {
  return (
    <HStack key={`todo-${id}`} spacing={8}>
      <Button
        key="toggle"
        label={done ? "✓" : "○"}
        foregroundColor={done ? "green" : "secondary"}
        onPress={() => toggleTodo(id)}
      />
      <Text key="title" font="body" foregroundColor={done ? "secondary" : "primary"}>
        {title}
      </Text>
      <Button
        key="delete"
        label="✕"
        foregroundColor="red"
        onPress={() => deleteTodo(id)}
      />
    </HStack>
  );
}

render(
  <VStack key="app" spacing={12} padding={16} alignment="leading">
    <Text key="header" font="largeTitle">{"Todos"}</Text>
    <TextField
      key="input"
      placeholder="What needs to be done?"
      onSubmit={(text: string) => addTodo(text)}
    />
    <Divider key="div" />
    <ScrollView key="list">
      <VStack key="items" spacing={4} alignment="leading">
        {when(["todo", $.id, "title", $.title], ["todo", $.id, "done", $.done], ({ id, title, done }) => (
          <TodoItem key={`item-${id}`} id={id} title={title} done={done} />
        ))}
      </VStack>
    </ScrollView>
  </VStack>,
);
