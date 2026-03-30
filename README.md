# Jam

A reactive web framework where all application state — including the VDOM — lives in a shared fact database. Inspired by [Folk Computer](https://folk.computer) and [Dynamicland](https://dynamicland.org), Jam combines Datalog-style pattern matching with MobX reactivity and JSX rendering.

The core idea: programs don't call each other. They make **claims** into a shared database, and other programs **react** to those claims. This produces radically composable, malleable software — any program can observe or decorate any other program's output without coordination.

## Quick start

```bash
pnpm install
cd examples/folk-todo && pnpm dev
```

## Core API

### Facts

All state is stored as **facts** — tuples of terms (strings, numbers, booleans):

```typescript
import { assert, retract, set } from "@jam/core";

// Assert a fact
assert("todo", 1, "title", "Buy milk");
assert("todo", 1, "done", false);

// Retract a fact
retract("todo", 1, "done", false);

// Retract with wildcards — remove all facts about todo 1
retract("todo", 1, _, _);

// Set (upsert) — replaces any existing fact with the same prefix
set("todo", 1, "done", true);  // retracts ["todo", 1, "done", _], then asserts
```

### Querying with `when`

`when` queries the fact database using patterns. `$` creates named bindings, `_` is a wildcard.

```typescript
import { $, _, when } from "@jam/core";

// Single pattern — find all todo titles
const titles = when(["todo", $.id, "title", $.title]);
// → [{ id: 1, title: "Buy milk" }, { id: 2, title: "Walk dog" }]

// Multi-pattern join — bindings with the same name are joined
const todos = when(
  ["todo", $.id, "title", $.title],
  ["todo", $.id, "done", $.done],
);
// → [{ id: 1, title: "Buy milk", done: false }, ...]
```

Inside a component or MobX tracking context, `when` is reactive — the component re-renders when matching facts change. Facts that don't match the pattern (like VDOM facts) won't trigger a re-render.

### Components and rendering

Components are plain functions that return JSX. Use `when` to read state:

```tsx
import { h } from "@jam/core/jsx";
import { $, set, when, mount } from "@jam/core";

set("counter", "count", 0);

function Counter() {
  const value = (when(["counter", "count", $.v])[0]?.v as number) ?? 0;
  return (
    <div>
      <h1>{value}</h1>
      <button onClick={() => set("counter", "count", value + 1)}>+</button>
    </div>
  );
}

mount(<Counter />, document.getElementById("app")!);
```

The renderer works in two phases:
1. **Emit** — executes the component tree, writing VDOM claims into the fact database
2. **Patch** — reads all VDOM claims and reconciles them into the real DOM

### Reactive rules with `whenever`

`whenever` creates a rule that fires when patterns match, producing derived facts:

```typescript
import { $, whenever, claim } from "@jam/core";

// When a todo is done, claim a strikethrough class on its element
const dispose = whenever(
  [["todo", $.id, "done", true]],
  (doneTodos) => {
    for (const { id } of doneTodos) {
      claim(`todo-${id}`, "class", "strikethrough");
    }
  },
);

// Later: dispose() to stop the rule and retract its derived facts
```

The body re-runs when the query results change. Facts claimed by the body are automatically retracted when the rule re-runs or is disposed.

### Transactions

Batch multiple mutations so observers only fire once:

```typescript
import { transaction, assert, retract, _ } from "@jam/core";

transaction(() => {
  retract("plan", sessionId, _, _, _, _);
  for (const entry of newEntries) {
    assert("plan", sessionId, entry.id, entry.content, entry.status, entry.priority);
  }
});
// Observers see the final state, not intermediate empty state
```

## Malleable software

The fact database is a shared space. Any program can observe any fact and claim new ones. This enables Folk-style composition:

**Component renders a todo item:**
```tsx
function TodoItem({ todoId, title, done }) {
  return <li id={`todo-${todoId}`} class={done ? "todo-item done" : "todo-item"}>
    <span class="title">{title}</span>
  </li>;
}
```

**A separate program adds strikethrough styling — without touching the component:**
```typescript
// programs/strikethrough.ts
whenever([["todo", $.id, "done", true]], (doneTodos) => {
  for (const { id } of doneTodos) {
    claim(`todo-${id}`, "class", "strikethrough");
  }
});
```

The renderer merges classes from all sources. The component's `"todo-item done"` and the program's `"strikethrough"` both appear on the DOM element.

### Targeting elements

Elements are addressable by programs in three ways:

**By `id` prop** — global, opt-in. The component sets `id={...}` and programs use that id directly:
```tsx
// Component
<button id={`session-${sid}`}>...</button>

// Program
claim(`session-${sid}`, "class", "session-active");
```

**By CSS selector** — finds elements by tag, class, id, or attributes:
```typescript
import { select } from "@jam/core";

for (const el of select(".connection-bar")) {
  claim(el.id, "prop", "title", "Cost: $0.42");
}
```

**By injecting children** — add new elements inside an existing parent:
```typescript
import { h, injectVdom } from "@jam/core";

// Add a badge as child of session-s-1 at index 1000 (avoiding conflicts)
injectVdom("session-s-1", 1000, h("span", { class: "badge" }, "3"));
```

## Project structure

```
jam/
  src/                  # @jam/core library
    db.ts               # Fact database with MobX reactivity
    primitives.ts       # assert, retract, set, when, whenever, transaction
    jsx.ts              # JSX factory, VDOM emission
    renderer.ts         # Two-phase mount (emit + patch)
    select.ts           # CSS selector queries on VDOM facts
  examples/
    counter/            # Minimal counter
    folk-todo/          # Todo app with external strikethrough program
    puddy-vite/         # Chat app with session management + 4 extension programs
  FOLK.md               # Folk Computer programming model reference
```

## Running tests

```bash
pnpm test           # Unit tests (vitest)
pnpm bench          # Performance benchmarks
pnpm -r typecheck   # TypeScript checking across all packages

cd examples/folk-todo && pnpm test:e2e   # Playwright e2e tests
```
