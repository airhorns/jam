# linearlite

A Linear-style issue tracker built with jam on `sync()`: every durable fact lives in one `jam_facts` table, and the browser only loads the project it is looking at. Issues are grouped into projects; switching projects swaps which slice of the table is synced. It's a port of Electric's [linearlite demo](https://electric-sql.com/demos/linearlite) with the React UI replaced by jam components and the relational schema replaced by facts.

Ported from [electric-sql/electric](https://github.com/electric-sql/electric/tree/main/examples/linearlite) (Apache-2.0).

## Running it

**Standalone** — no backend; a local PGlite database seeded with 5,000 issues across four projects (`?seed=N` to change the count, applied only when the database is empty):

```bash
corepack pnpm install
corepack pnpm --dir examples/linearlite dev    # http://localhost:5173
```

**With Electric** — Postgres and Electric in containers (docker or podman), plus the sync server:

```bash
corepack pnpm backend:up     # start postgres (:54321) + electric (:3033), create jam_facts, load 5,000 issues (ISSUES_TO_LOAD=N)
corepack pnpm sync-server    # Hono on :3001: GET /jam/shape (proxy to Electric) and POST /jam/changes
VITE_SYNC_URL=http://localhost:3001 corepack pnpm dev
```

The client seeds nothing in this mode: it subscribes to the global scope (projects) and to `project:<id>` for the project on screen, and Electric streams those rows down through the sync server — the browser never talks to Electric directly. `ELECTRIC_URL` tells the sync server where Electric is (default `http://localhost:3033`; `ELECTRIC_SOURCE_ID`/`ELECTRIC_SOURCE_SECRET` are forwarded for Electric Cloud); `DATABASE_URL` overrides the Postgres connection (default `postgresql://postgres:password@localhost:54321/linearlite`); `JAM_POSTGRES_PORT`/`JAM_ELECTRIC_PORT` move the container ports. `pnpm backend:down` tears it down; data lives in tmpfs so it's gone on restart.

## How it's layered

```
Postgres jam_facts (id, key, scope) ──▶ Electric ──▶ sync server GET /jam/shape ──▶ PGlite jam_shape_* tables
        ▲                                                  (scope policy)                     │
        │ POST /jam/changes (scope policy)                                                    │ live changes
        │                                                                                     ▼
   sync server ◀─────────────────── core sync() (jam_outbox) ────────────────▶ facts ["issue", id, col, value]
                                                                                       │  ▲
                                                                                when() │  │ replace() / remember() / forget()
                                                                                       ▼  │
                                                                                 jam components
```

There is no app-specific storage code. `src/sync.ts` calls `sync()` with the sync server's URLs and an `exclude` for the app's ephemeral facts; `src/programs/subscriptions.ts` is one `sync.follow()` over the route: `filtersForRoute` maps the current URL to `{ scope: "" }` for projects plus `{ scope: "project:<id>" }` for the project on screen, and core swaps shapes with overlap so the screen never empties on a switch. Everything else is facts:

- `createIssue` and `addComment` write inside `scoped(projectScope(id), …)`, so a new entity lands in its project's partition; later `replace`/`forget` calls inherit the scope from the entity.
- `src/programs/queries.ts` derives each view in memory with `whenever`: filter, sort and search over the project's issue facts, then emit a window of `["query", name, "row", index, id]` facts (100 rows for the list, moved by `["ui", "list", "scrollTop"]`; 50 per board column; the issue and its comments on a detail page). Components render from those with `when()`.
- The sync server (`server.ts`) is `shapeProxy` + `parseFactChanges`/`applyFactChanges` from `@jam/core/server` over a `postgres` client, with one policy for both directions: only the global scope and `project:*` scopes may be read or written. A request for every partition, a shape over an `admin` scope, or a change that would move a fact into one gets a 403; malformed changes get a 400. A real deployment would decide `allow` from the session instead of a prefix.

### Fact schema

| Facts | Scope |
|---|---|
| `["project", id, "name" \| "key" \| "created", value]` | global (`""`) |
| `["issue", id, "project" \| "title" \| "description" \| "priority" \| "status" \| "created" \| "modified" \| "kanbanorder" \| "username", value]` | `project:<id>` |
| `["comment", id, "issue" \| "body" \| "username" \| "created" \| "modified", value]` | `project:<id>` of the issue |
| `["recent", id, "viewedAt" \| "title" \| "project", value]` | device-local via `persist({ pg, include })` |
| `["route", "url", pathAndSearch]`, `["ui", …]`, `["query", …]`, `["stats", "issues", "total", n]` | in memory only (`isEphemeral` in `src/types.ts`) |
| `["sync", "status" \| "pending" \| "shape" \| "error", …]` | published by core `sync()`; the badge in the sidebar reads them |

Routes carry the project: `/:projectId`, `/:projectId/board`, `/:projectId/search`, `/:projectId/issue/:id`; `/` redirects to the first project. `["query", name, "ready", bool]` follows the current project's `["sync", "shape", …, "ready", …]` fact so views show "Loading…" until the subscription has its initial data.

### Source map

- `src/pglite-worker.ts` — PGlite in a worker (leader-elected across tabs); creates `jam_facts` and seeds it in standalone mode.
- `src/sync.ts` — the one `sync()` call; `src/programs/subscriptions.ts` — `filtersForRoute` and the `follow()` that keeps the loaded scopes in step with the route.
- `src/programs/` — router, in-memory queries, UI state, recent issues.
- `src/components/` — the UI. Every component returns exactly one root element.
- `src/mutations.ts` — `createProject`, `createIssue`, `updateIssue`, `deleteIssue`, `moveIssue` (fractional indexing for the board), `addComment`.
- `src/seed.ts` — deterministic seed as `(key, scope)` rows, shared by the standalone worker and `db/load-data.ts`.
- `db/migrate.ts` (runs `JAM_FACTS_SQL`), `db/load-data.ts`, `server.ts` — sync server (shape proxy + write endpoint), `backend/containers.ts` — docker/podman lifecycle.

## Gotchas worth knowing

- A component prop named `id` is jam's global element id, not a domain id: two components given the same `id` share one DOM element. Components here take `issueId`/`commentId`.
- A `key` only takes effect on the element at its usage site. Putting it on the root of what a component returns does nothing; the root inherits the component's identity.
- PGlite logs a single harmless `ErrnoError` the first time it creates an IndexedDB data directory; the e2e suites filter it out.
- Electric only supports where-clauses over the shape table's own columns, which is why `jam_facts` carries `scope` and `t0..t2` as real columns (derived from `key` by a trigger).

## Tests

```bash
corepack pnpm test               # query program, mutations and route→filter mapping against an in-memory FactDB
corepack pnpm test:e2e           # Playwright against the standalone app with ?seed=100
corepack pnpm test:e2e:electric  # Playwright against the running backend (pnpm backend:up && pnpm sync-server first)
```

The Electric suite resets Postgres to the seed and then checks that the page holds exactly the facts Postgres has for the subscribed scope: initial load, local edits reaching `jam_facts`, rows inserted straight into Postgres appearing in the UI, project switches swapping the scope, two browsers converging, and the sync server refusing shapes and writes outside the project partitions. CI runs it with the same containers script (`backend/containers.ts`) that runs locally under podman.
