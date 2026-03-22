import { $, _, when, hold, claim, render } from "./jam";
import { VStack, HStack, Text, Button, ScrollView, TextField, Divider } from "./components";

// ============================================================================
// Todo List Manager
//
// State schema (Folk-style EAV claims inside hold):
//   hold("todo-{id}-title", () => claim("todo", id, "has", "title", "..."))
//   hold("todo-{id}-done",  () => claim("todo", id, "is", "done", false))
//
// Each attribute is its own hold key. Adding a todo asserts two facts.
// Toggling flips one. Deleting retracts both by holding empty callbacks.
// The reactive when() join drives the UI directly — no shadow state.
// ============================================================================

// --- State helpers ---

let __nextId = 1;

function addTodo(title: string) {
  if (!title.trim()) return;
  const id = __nextId++;
  hold(`todo-${id}-title`, () => { claim("todo", id, "has", "title", title.trim()); });
  hold(`todo-${id}-done`, () => { claim("todo", id, "is", "done", false); });
}

function toggleTodo(id: number, currentDone: boolean) {
  hold(`todo-${id}-done`, () => { claim("todo", id, "is", "done", !currentDone); });
}

function editTodo(id: number, title: string) {
  hold(`todo-${id}-title`, () => { claim("todo", id, "has", "title", title); });
}

function deleteTodo(id: number) {
  hold(`todo-${id}-title`, () => {}); // empty = retract
  hold(`todo-${id}-done`, () => {});
}

// --- UI ---

function TodoItem({ id, title, done }: { id: number; title: string; done: boolean; key?: string }) {
  return (
    <HStack key={`todo-${id}`} spacing={8}>
      <Button
        key="toggle"
        label={done ? "✓" : "○"}
        foregroundColor={done ? "green" : "secondary"}
        onPress={() => toggleTodo(id, done)}
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
        {when(["todo", $.id, "has", "title", $.title], ["todo", $.id, "is", "done", $.done], ({ id, title, done }) => (
          <TodoItem key={`item-${id}`} id={id} title={title} done={done} />
        ))}
      </VStack>
    </ScrollView>
  </VStack>,
);
