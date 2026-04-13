import { h } from "@jam/core/jsx";
import { $, _, remember, replace, forget, when } from "@jam/core";

// --- State mutations ---

let nextId = 1;

function addTodo(title: string) {
  if (!title.trim()) return;
  const id = nextId++;
  remember("todo", id, "title", title.trim());
  remember("todo", id, "done", false);
}

function toggleTodo(id: number, currentDone: boolean) {
  replace("todo", id, "done", !currentDone);
}

function deleteTodo(id: number) {
  forget("todo", id, _, _);
}

// --- Components ---

function TodoItem({ todoId, title, done }: { key?: unknown; todoId: number; title: string; done: boolean }) {
  return (
    <li id={`todo-${todoId}`} class={done ? "todo-item done" : "todo-item"}>
      <button class="toggle" onClick={() => toggleTodo(todoId, done)}>
        {done ? "\u2713" : "\u25CB"}
      </button>
      <span class="title">{title}</span>
      <button class="delete" onClick={() => deleteTodo(todoId)}>
        {"\u2715"}
      </button>
    </li>
  );
}

export function TodoApp() {
  const items = when(
    ["todo", $.id, "title", $.title],
    ["todo", $.id, "done", $.done],
  );

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
            todoId={id as number}
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
