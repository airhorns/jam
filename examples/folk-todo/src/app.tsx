import { h } from "@jam/core/jsx";
import { $, _, assert, retract, set, when } from "@jam/core";

// --- State mutations ---

let nextId = 1;

function addTodo(title: string) {
  if (!title.trim()) return;
  const id = nextId++;
  set("todo", id, "title", title.trim());
  set("todo", id, "done", false);
}

function toggleTodo(id: number, currentDone: boolean) {
  set("todo", id, "done", !currentDone);
}

function deleteTodo(id: number) {
  retract("todo", id, _, _); // matches ["todo", id, "title", x] and ["todo", id, "done", x]
}

// --- Components ---

function TodoItem({ id, title, done }: { key?: unknown; id: number; title: string; done: boolean }) {
  return (
    <li class={done ? "todo-item done" : "todo-item"}>
      <button class="toggle" onClick={() => toggleTodo(id, done)}>
        {done ? "\u2713" : "\u25CB"}
      </button>
      <span class="title">{title}</span>
      <button class="delete" onClick={() => deleteTodo(id)}>
        {"\u2715"}
      </button>
    </li>
  );
}

export function TodoApp() {
  const todos = when(
    ["todo", $.id, "title", $.title],
    ["todo", $.id, "done", $.done],
  );

  const items = todos.get();

  return (
    <div class="todo-app">
      <h1>todos</h1>
      <input
        class="new-todo"
        placeholder="What needs to be done?"
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter") {
            const input = e.target as HTMLInputElement;
            addTodo(input.value);
            input.value = "";
          }
        }}
      />
      <ul class="todo-list">
        {items.map(({ id, title, done }) => (
          <TodoItem
            key={id}
            id={id as number}
            title={title as string}
            done={done as boolean}
          />
        ))}
      </ul>
      <footer class="info">
        {items.filter((t) => !t.done).length} items left
      </footer>
    </div>
  );
}
