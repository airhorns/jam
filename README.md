# Jam

A reactive web framework where all application state — including the VDOM — lives in a shared fact database. Inspired by [Folk Computer](https://folk.computer) and [Dynamicland](https://dynamicland.org), Jam combines Datalog-style pattern matching with MobX reactivity and JSX rendering.

The core idea: programs don't call each other. They make **claims** into a shared database, and other programs **react** to those claims. This produces radically composable, malleable software — any program can observe or decorate any other program's output without coordination.

## Quick start

Install dependencies and start the default example:

```bash
pnpm install
pnpm dev
```

If `pnpm` is not already on `PATH`, use the tool versions pinned in
`mise.toml` and activate them in your shell:

```bash
mise install
eval "$(mise activate bash)"
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm dev             # Run the folk-todo example dev server
pnpm test            # Run unit tests for packages/examples that define them
pnpm test:e2e        # Run folk-todo, puddy-vite, linearlite and catalog Playwright suites
pnpm typecheck       # TypeScript check all packages and examples
pnpm run dev:ui      # Run the @jam/ui catalog example
```

Playwright configs derive their default server ports from the current worktree
path so multiple Codex worktrees can run e2e tests without accidentally reusing
another app's dev server. Set `PLAYWRIGHT_PORT` or the example-specific
`*_PLAYWRIGHT_PORT` variable when you need a fixed port.

## Examples

- `examples/counter` — minimal counter for core rendering and state checks
- `examples/folk-todo` — todo app with external-program customization and e2e coverage
- `examples/trello-clone` — kanban workflow example with ordered board state
- `examples/obsidian-clone` — linked-note workspace with graph-derived views
- `examples/puddy-vite` — chat/session app with VCR-style network tests
- `examples/linearlite` — Linear clone on PGlite + Electric sync, with unit and e2e coverage
- `examples/catalog` — browser catalog for `@jam/ui` components, with screenshot and e2e tooling

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
import { h } from "@jam/core/jsx";

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

## Persistence and sync

Jam stores durable state in [PGlite](https://pglite.dev) — Postgres compiled to WASM, running in a shared Web Worker and backed by IndexedDB. Tabs on the same database elect a leader that owns the files; the others proxy queries to it.

```typescript
import { openDatabase } from "@jam/core";

const pg = await openDatabase({ name: "my-app" });   // idb://my-app
```

`openDatabase` accepts `dataDir` (`idb://`, `opfs-ahp://`, `memory://`) and `relaxedDurability` (default `true`: queries resolve before the write reaches storage; `await pg.syncToDisk()` when you need it flushed). PGlite currently logs one harmless `ErrnoError` the first time it creates an IndexedDB data directory.

### Persisting facts

`persist()` mirrors facts into a `jam_facts` table and restores them on the next load. Facts are stored by identity, so `replace()` is a delete plus an insert.

```typescript
import { persist } from "@jam/core";

const handle = await persist({ pg, include: (fact) => fact[0] === "ui" });
// handle.flush() writes pending changes now; await handle() flushes and stops.
```

Without `include`, everything except VDOM facts (`defaultExclude`) is persisted. Pass your own `pg` whenever the app also uses `syncTable`, so both share one database. Restored facts are durable (`remember`-style), not scoped to any owner.

### Mirroring tables as facts

`syncTable` projects a (windowed) live query over a PGlite table into `[entity, id, column, value]` facts and writes fact mutations back as SQL. Because it only watches the table, anything that writes to PGlite — your code, a migration, or [Electric](https://electric-sql.com) syncing a shape from Postgres — shows up in facts with no further integration.

```typescript
import { syncTable, replace, forget, _ } from "@jam/core";

const list = syncTable(pg, {
  table: "issue",
  query: "SELECT * FROM issue WHERE deleted = false ORDER BY created DESC",
  offset: 0, limit: 100,
  name: "list",                 // emits ["query", "list", "row", index, id], "total", "offset", "limit", "ready"
  readonly: ["synced"],         // generated columns are never written back
  writeDebounce: 300,
});
await list.ready;

replace("issue", id, "title", "New title");   // → UPDATE issue SET title = $2 WHERE id = $1
forget("issue", id, _, _);                    // → DELETE FROM issue WHERE id = $1
await list.refresh({ offset: 200 });          // move the window
await list.dispose();
```

- A NULL column is an absent fact; forgetting one column writes NULL, forgetting a row's last fact deletes the row (decided at that moment, so a binding that re-mirrors the row before the debounced flush doesn't resurrect it).
- Remembering facts for an id the table doesn't have inserts a row from all of its current facts.
- Several bindings can watch the same entity (a list and a detail view); a fact is dropped only when no binding still holds it. Rebinding with the same `name` hands the `["query", name, …]` facts to the new binding.
- While a write is pending, live results don't overwrite that cell, so keystrokes aren't clobbered by a stale echo.
- Mirrored facts are durable, not scoped: a rule that `claim`s on top of them is revoked as usual, the row facts stay until the table changes.

See `examples/linearlite` for a full app on this stack, including Electric sync.

### Components and children

Nested JSX reaches a function component as `props.children`, and every component accepts `key` and `id`. A prop literally named `id` is jam's global element id (see "Targeting elements"), so use another name — `issueId`, `todoId` — for domain identifiers. Nested components are executed inside the tracked render, so a `when()` in a child re-renders the tree just like one in the root. Elements under `<svg>` are created in the SVG namespace.
