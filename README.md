# Jam

A reactive web framework where all application state — including the VDOM — lives in a shared fact database. Inspired by [Folk Computer](https://folk.computer) and [Dynamicland](https://dynamicland.org), Jam combines Datalog-style pattern matching with fine-grained reactivity and JSX rendering.

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
pnpm test:coverage   # Package unit tests with coverage (CI gates at 90%; `open coverage/index.html` for the report)
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
- `examples/linearlite` — Multi-project Linear clone on `sync()` with per-project subscriptions against a WebSocket sync server, with unit and e2e coverage
- `examples/catalog` — the docs site at https://harry.me/jam/, published on every push to `main`: this README as its homepage, every `@jam/ui` component with interactive demos and its reference doc, and the style system guide; includes screenshot and e2e tooling

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

Inside a component or any tracked context (`autorun`, `whenever`), `when` is reactive — the component re-renders when matching facts change. Facts that don't match the pattern (like VDOM facts) won't trigger a re-render.

Patterns can be followed by clauses that shape the result. The engine maintains all of them incrementally, so a filtered, sorted page or a count is one query whose rows only change when they need to:

```typescript
import { $, _, count, limit, not, offset, orderBy, when, where } from "@jam/core";

// Open todos nobody has snoozed, matching a search, newest first, second page of 50
when(
  ["todo", $.id, "done", false],
  ["todo", $.id, "title", $.title],
  ["todo", $.id, "created", $.created],
  not("todo", $.id, "snoozedUntil", _),
  where($.title, "icontains", search),
  orderBy($.created, "desc"),
  offset(50),
  limit(50),
);

// How many todos each list has
when(["todo", $.id, "list", $.list], count($.n, $.list));
// → [{ list: "home", n: 3 }, { list: "work", n: 7 }]
```

- `not(...pattern)` hides rows for which the pattern has a match; variables shared with the patterns join through the row.
- `where(x, op, y)` compares a bound variable with a value or another variable: `=`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `startsWith`, `icontains`, `istartsWith`. `where(x, "in", values)` matches any of a list, and `where.any(...)` is a disjunction of comparisons; several `where` clauses conjoin.
- `orderBy(x, "asc" | "desc")` sorts (several compose, most significant first; ties keep assertion order), `offset(n)` and `limit(n)` window the sorted rows.
- `count(out, ...group)`, `sum(input, out, ...group)`, `min(...)` and `max(...)` fold rows into one row per distinct combination of the group variables; the output row is the group keys plus `out`.

Comparisons and sorting use one total order over terms — booleans, then numbers, then strings — so mixed types compare rather than fail.

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

A component that keeps state outside the tree — a timer, per-instance facts keyed by `useComponentId()` — releases it with `useCleanup(fn)`, which runs once when the component leaves the tree or the root unmounts.

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

### Reading and driving the UI

The rendered tree is already facts, so an agent, a test or a program can read it as an accessibility outline and operate it without selectors:

```typescript
import { describeUI, outlineUI, drive, press } from "@jam/core";

console.log(outlineUI({ interactive: true }));
//   button "Filter" #dom_0_1_k_filter-menu-trigger expanded=false haspopup="menu" (FilterMenu open=false)
//   list "Issues" #dom:0:1:k:list:1:0
//     listitem #dom:0:1:k:list:1:0:k:18451c1f <IssueRow/ListItemFrame>
//       button "status: Backlog" #…_0_1-menu-trigger expanded=false haspopup="menu" (StatusMenu open=false)
//       link "Suspendo ea suffragium…" #dom:0:1:k:list:1:0:k:18451c1f:0:2 href="/web/issue/18451c1f"
//   hidden #dom:0:2 (NewIssueModal/Dialog/DialogPortal open=false)

press("dom_0_1_k_filter-menu-trigger");          // pointerdown, focus, pointerup, click on the element
drive("#dom:0:2", "open", true);                  // the Dialog's onOpenChange(true) runs; # is optional
drive("dom_0_2-dialog-content:1:0", "value", "x"); // a textbox receives input/change events
```

`describeUI()` returns the same tree as data (`UINode`: role, name, description, state, component, drive keys, children). Each line is what a screen reader would be told — role, accessible name, ARIA state — plus the entity id to act on, the semantic component that starts there and, in parentheses, the state keys `drive()` can set with their current values. `describeUI({ root })` scopes the read to an element or to a component, whose elements (portalled ones included) are described. Nothing is written to make this work: it is read from the VDOM facts the renderer already emits and the component structure of the mount. `drive()` and `press()` assert a transient, non-durable `["drive", id, key, value]` fact while they run so a fact log shows what caused a change.

Components opt into `drive()` with `useDriver(key, { set, get })` — `@jam/ui`'s stateful components already do — and styled wrappers marked `Component.presentational = true` are left out of the outline's component chains. `@jam/ui/playwright` wraps this for e2e tests (`find`, `pressNode`, `driveNode`), and `@jam/meta-agent` exposes it as `describeUI`/`drive`/`press` tools.

## Persistence and sync

Facts live in memory in a Rust engine compiled to WASM (`@jam/engine`) that does the indexing, pattern matching and change tracking. Durable facts are kept in a `FactStorage` — IndexedDB in the browser, SQLite (`node:sqlite`) or memory in Node — which only stores facts; syncing and reactivity happen in the engine.

There are two ways to keep facts around:

| You want... | Use |
|---|---|
| durable facts stored automatically, optionally synced with a server and other clients | `sync()` |
| facts that stay on this device only (UI preferences, recently viewed) | `persist()` |

### Storing and syncing facts

`sync()` stores every durable fact — `remember`/`replace` write it, `forget` removes it, `claim`ed facts never leave memory because they are derived and would be re-derived anyway. Nothing is mapped by hand: a new program that invents new facts gets them stored the moment it runs. Every fact carries a `scope` naming the partition it belongs to.

```typescript
import { sync, scoped, remember, replace } from "@jam/core";

const handle = await sync({ name: "my-app" });           // local only: IndexedDB, no network
const projects = handle.subscribe({ scope: "" });        // global facts
const current = handle.subscribe({ scope: "project:p1" });
await current.ready;

scoped("project:p1", () => remember("issue", "i1", "project", "p1"));   // a new entity, placed in a partition
replace("issue", "i1", "title", "Ship it");                            // inherits the entity's scope
await current.dispose();                                               // its facts leave memory
```

Scopes are how a client decides what to load. Facts written without `scoped()` inherit the scope of the fact they replace, else of their `[entity, id]`, else the global scope `""`. A subscription's `FactFilter` is `{ scope?, pattern? }`, where a pattern narrows on literal terms (`["issue", _, "project"]`); subscribing to the same filter twice shares one stream, and facts stay in memory while any subscription holds them.

Most apps want subscriptions to track some other fact — the route, the selected workspace — rather than being managed by hand. `follow()` takes patterns and a function from their matches to the filters that should be live, and keeps the two in step: new filters are subscribed and ready before the ones they replace are released, so a switch never empties the screen first, and a burst of changes settles on the last one.

```typescript
const stop = handle.follow([["route", "project", $.id]], ([route]) => [
  { scope: "" },
  ...(route ? [{ scope: `project:${route.id}` }] : []),
]);
await stop();   // releases everything it holds
```

Give it a `url` and the facts live on a sync server:

```typescript
const handle = await sync({
  url: "ws://localhost:3001",
  exclude: (fact) => fact[0] === "ui",   // local-only facts; default excludes VDOM facts
});
```

Each subscription asks the server for its filter; the server answers with a snapshot (or a replay of what happened since the seq the client last saw) and then streams every committed change matching it, so the browser only ever downloads the partitions it asked for and resumes from its IndexedDB mirror on reload. Local writes queue in the mirror's log and are pushed as `{ op: "upsert" | "delete" | "replace", terms, scope }`; while a key is queued, the server's changes for it are ignored so an echo can never flicker a local write. Reconnects back off exponentially and pick up from the last acknowledged seq. The server is `@jam/core/server`, which runs in Node over any `FactStorage`:

```typescript
import { createSyncServer, sqliteStorage } from "@jam/core/server";
import { WebSocketServer } from "ws";

const server = await createSyncServer({
  storage: sqliteStorage("./data/facts.db"),
  allow: ({ scope }, user) => scope === "" || scope === `user:${user.id}`,   // optional write authorization, per change
  allowRead: (filter, user) => filter.scope === "" || filter.scope === `user:${user.id}`,   // optional read authorization, per subscription
});
new WebSocketServer({ port: 3001 }).on("connection", (socket, request) => server.handle(socket, authenticate(request)));
await server.apply([{ op: "upsert", terms: ["project", "p1", "name", "Web"], scope: "" }]);   // seeds, admin tools
const stop = server.observe(({ seq, changes, context }) => audit(seq, changes, context));   // every committed transaction
```

`replace` on the server removes every other fact sharing all but the last term, so two clients replacing the same attribute converge on the last write. A push with a change `allow` refuses is rejected whole and surfaces on the client as `["sync", "error", message]`. A subscription `allowRead` refuses is denied: it becomes ready holding no facts and reports why as `["sync", "shape", id, "error", message]`. `observe` runs after each commit with the changes that took effect (what subscribers were sent) and the pushing connection's context — `undefined` for `apply` — so a server can audit or mirror what clients write.

The handle publishes its state as facts: `["sync", "status", "standalone" | "connecting" | "syncing" | "live" | "offline"]`, `["sync", "pending", n]` unpushed changes, `["sync", "shape", id, "ready", bool]` per subscription (`compileFilter(filter).id`) plus `["sync", "shape", id, "error", message]` when the server denied it, and `["sync", "error", message]` when the server rejects a batch. `handle.flush()` waits for every queued write to be acknowledged; `handle.dispose()` stops.

Browser tabs that share a `name` share one connection. The tabs elect a leader through a Web Lock; it holds the WebSocket, subscribes to the union of every tab's filters, mirrors what the server sends into IndexedDB and pushes the shared outbox, broadcasting what it applied over a `BroadcastChannel` so the other tabs stay current. Any tab's write lands in the shared outbox and shows up in every tab at once, connected or not. When the leader tab closes, the lock passes to another tab, which reconnects and resumes from the seqs recorded in storage; `handle.leading` says whether this tab holds the connection. Pass `tabs: soloTabs()` to opt a tab out of the coordination, or your own `TabCoordinator` to replace it.

### Persisting facts locally

`persist()` mirrors facts into its own storage and restores them on the next load — for facts that should survive a reload but never leave the device. Only durable facts are stored; `replace()` is a delete plus an insert.

```typescript
import { persist } from "@jam/core";

const handle = await persist({ name: "my-app-local", include: (fact) => fact[0] === "recent" });
// handle.flush() writes pending changes now; await handle() flushes and stops.
```

Without `include`, everything except VDOM facts (`defaultExclude`) is persisted. Give `persist` and `sync` different `name`s (or `storage`s) and keep their `include`/`exclude` disjoint so a fact isn't stored twice.

See `examples/linearlite` for a full app on `sync()`, including per-project subscriptions against a sync server.

### Components and children

Nested JSX reaches a function component as `props.children`, and every component accepts `key` and `id`. A prop literally named `id` is jam's global element id (see "Targeting elements"), so use another name — `issueId`, `todoId` — for domain identifiers. Nested components are executed inside the tracked render, so a `when()` in a child re-renders the tree just like one in the root. Elements under `<svg>` are created in the SVG namespace.
