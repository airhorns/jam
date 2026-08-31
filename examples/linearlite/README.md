# linearlite

A Linear-style issue tracker built with jam on `sync()`: every durable fact is stored as a fact, and the browser only loads the project it is looking at. Issues are grouped into projects; switching projects swaps which slice of the fact store is synced. It's a port of Electric's [linearlite demo](https://electric-sql.com/demos/linearlite) with the React UI replaced by jam components and the relational schema replaced by facts.

Ported from [electric-sql/electric](https://github.com/electric-sql/electric/tree/main/examples/linearlite) (Apache-2.0).

## Running it

**Standalone** — no backend; an IndexedDB database seeded with 5,000 issues across four projects (`?seed=N` to change the count, applied only when the database is empty):

```bash
corepack pnpm install
corepack pnpm --dir examples/linearlite dev    # http://localhost:5173
```

**With a sync server** — one Node process holding the facts in SQLite and serving them over WebSockets:

```bash
corepack pnpm --dir examples/linearlite server                        # ws://localhost:3001, seeds 5,000 issues into ./data/linearlite.db
VITE_SYNC_URL=ws://localhost:3001 corepack pnpm --dir examples/linearlite dev
```

The client seeds nothing in this mode: it subscribes to the global scope (projects) and to `project:<id>` for the project on screen, and the server streams those facts down. `?sync=ws://…` on any page URL overrides the build-time URL for that tab (the Playwright suite uses it to point pages at a server it starts itself). `PORT` moves the server, `JAM_DB_PATH` moves the SQLite file, `ISSUES_TO_LOAD=N` changes the seed size (`0` for an empty server).

## How it's layered

```
sync server: SQLite ◀── engine ──▶ per-connection filters ──changes / snapshot / replay──▶ IndexedDB mirror
                                            ▲                                                   │
                                            │ push (outbox)                                     │
                                            │                                                   ▼
                                   core sync() ────────────────────────────────▶ facts ["issue", id, col, value]
                                                                                        │  ▲
                                                                                 when() │  │ replace() / remember() / forget()
                                                                                        ▼  │
                                                                                  jam components
```

There is no app-specific storage code. `src/sync.ts` calls `sync()` with the storage, the server URL and an `exclude` for the app's ephemeral facts; `src/programs/subscriptions.ts` keeps two subscriptions open — `{ scope: "" }` for projects and `{ scope: "project:<id>" }` for the current project — and disposes the previous project's subscription only after the next one is ready, so the screen never empties on a switch. Everything else is facts:

- `createIssue` and `addComment` write inside `scoped(projectScope(id), …)`, so a new entity lands in its project's partition; later `replace`/`forget` calls inherit the scope from the entity.
- `src/programs/queries.ts` derives each view in memory with `whenever`: filter, sort and search over the project's issue facts, then emit a window of `["query", name, "row", index, id]` facts (100 rows for the list, moved by `["ui", "list", "scrollTop"]`; 50 per board column; the issue and its comments on a detail page). Components render from those with `when()`.
- The server is `createSyncServer` from `@jam/core/server` over `sqliteStorage`, with a `ws` `WebSocketServer` handing each connection to `server.handle`.

### Fact schema

| Facts | Scope |
|---|---|
| `["project", id, "name" \| "key" \| "created", value]` | global (`""`) |
| `["issue", id, "project" \| "title" \| "description" \| "priority" \| "status" \| "created" \| "modified" \| "kanbanorder" \| "username", value]` | `project:<id>` |
| `["comment", id, "issue" \| "body" \| "username" \| "created" \| "modified", value]` | `project:<id>` of the issue |
| `["recent", id, "viewedAt" \| "title" \| "project", value]` | device-local via `persist({ name, include })` |
| `["route", "url", pathAndSearch]`, `["ui", …]`, `["query", …]`, `["stats", "issues", "total", n]` | in memory only (`isEphemeral` in `src/types.ts`) |
| `["sync", "status" \| "pending" \| "shape" \| "error", …]` | published by core `sync()`; the badge in the sidebar reads them |

Routes carry the project: `/:projectId`, `/:projectId/board`, `/:projectId/search`, `/:projectId/issue/:id`; `/` redirects to the first project. `["query", name, "ready", bool]` follows the current project's `["sync", "shape", …, "ready", …]` fact so views show "Loading…" until the subscription has its initial data.

### Source map

- `src/config.ts` — where the facts come from: `?sync=` / `VITE_SYNC_URL`, or a local seed.
- `src/sync.ts` — the one `sync()` call; `src/programs/subscriptions.ts` — which scopes are loaded.
- `src/programs/` — router, in-memory queries, UI state, recent issues.
- `src/components/` — the UI. Every component returns exactly one root element.
- `src/mutations.ts` — `createProject`, `createIssue`, `updateIssue`, `deleteIssue`, `moveIssue` (fractional indexing for the board), `addComment`.
- `src/seed.ts` — deterministic seed as `{ terms, scope }` facts, written into IndexedDB in standalone mode and applied to the server on first boot.
- `server.ts` — the sync server.

## Gotchas worth knowing

- A component prop named `id` is jam's global element id, not a domain id: two components given the same `id` share one DOM element. Components here take `issueId`/`commentId`.
- A `key` only takes effect on the element at its usage site. Putting it on the root of what a component returns does nothing; the root inherits the component's identity.
- Standalone and synced modes use different IndexedDB databases (`linearlite` and `linearlite-synced`), so switching between them never mixes a local seed with server data.

## Tests

```bash
corepack pnpm test               # query program, mutations and subscription switching against an in-memory FactDB
corepack pnpm test:e2e           # Playwright: the standalone app with ?seed=100, then the app against an in-process sync server
```

`e2e/sync.spec.ts` starts a `createSyncServer` on a random port inside the test process and checks that the page holds exactly the facts the server has for the subscribed scope: initial load, local edits reaching the server and the local mirror, facts committed straight on the server appearing in the UI, project switches swapping the scope, and two browsers converging.
