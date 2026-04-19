# Jam

A reactive web framework where all application state — including the VDOM — lives in a shared fact database. Inspired by [Folk Computer](https://folk.computer) and [Dynamicland](https://dynamicland.org), Jam combines Datalog-style pattern matching with MobX reactivity and JSX rendering.

The core idea: programs don't call each other. They make **claims** into a shared database, and other programs **react** to those claims. This produces radically composable, malleable software — any program can observe or decorate any other program's output without coordination.

## Quick start

```bash
corepack pnpm install
corepack pnpm dev
```

The repository pins pnpm in `package.json` and the preferred local toolchain in
`mise.toml`. Install `mise` once for your host/user before creating Jam
worktrees. If it is missing from `PATH`, provision it once and then start a new
shell or export the install location:

```bash
curl https://mise.run | sh
export PATH="$HOME/.local/bin:$PATH"
```

For each new worktree, use the pinned toolchain:

```bash
command -v mise
mise install
mise exec -- corepack pnpm install
mise exec -- corepack pnpm dev
```

`just` recipes are available as conveniences, but the canonical commands are
the root `corepack pnpm ...` scripts so a fresh worktree does not depend on a
globally installed `pnpm` or `just`.

Useful setup and validation commands:

```bash
corepack pnpm install       # Install all workspace dependencies
corepack pnpm dev           # Run the folk-todo example dev server
corepack pnpm test          # Run unit tests for packages/examples that define them
corepack pnpm test:e2e      # Run folk-todo Playwright tests
corepack pnpm typecheck     # TypeScript check all packages and examples
```

Playwright configs derive their default server ports from the current worktree
path so multiple Codex worktrees can run e2e tests without accidentally reusing
another app's dev server. Set `PLAYWRIGHT_PORT` or the example-specific
`*_PLAYWRIGHT_PORT` variable when you need a fixed port.

## Core API

### Facts

All state is stored as **facts** — tuples of terms (strings, numbers, booleans):

```typescript
import { claim, remember, replace, forget, _ } from "@jam/core";

// claim(): scoped, compositional, automatically revoked with its owner/rule
claim("todo-1", "class", "strikethrough");

// remember(): durable additive fact
remember("todo", 1, "title", "Buy milk");

// replace(): durable singleton-style update for a prefix
replace("todo", 1, "done", true);

// forget(): destructive delete, supports wildcards
forget("todo", 1, _, _);
```

Use these by intent:

- `claim(...)` — scoped contribution; multiple programs can support the same fact
- `remember(...)` — durable additive fact; use for catalogs, logs, registries, and multi-valued state
- `replace(...)` — durable singleton update; use for “the current value of X”
- `forget(...)` — destructive delete from durable state

### Choosing the right write primitive

| You mean... | Use |
|---|---|
| "this program contributes X while it is alive" | `claim(...)` |
| "the world durably knows many X values" | `remember(...)` |
| "there should be one current X value here" | `replace(...)` |
| "delete this durable value / clear this slot" | `forget(...)` |

Quick rule of thumb:

- If multiple producers saying the same thing is **good**, use `claim`.
- If multiple durable values coexisting is **good**, use `remember`.
- If multiple values would be a **bug**, use `replace`.

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
import { $, remember, replace, when, mount } from "@jam/core";

remember("counter", "count", 0);

function Counter() {
  const value = (when(["counter", "count", $.v])[0]?.v as number) ?? 0;
  return (
    <div>
      <h1>{value}</h1>
      <button onClick={() => replace("counter", "count", value + 1)}>+</button>
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

// Later: dispose() to stop the rule and revoke its derived claims
```

The body re-runs when the query results change. Facts claimed by the body are automatically removed when the rule re-runs or is disposed.

### Transactions

Batch multiple mutations so observers only fire once:

```typescript
import { transaction, remember, forget, _ } from "@jam/core";

transaction(() => {
  forget("plan", sessionId, _, _, _, _);
  for (const entry of newEntries) {
    remember("plan", sessionId, entry.id, entry.content, entry.status, entry.priority);
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
