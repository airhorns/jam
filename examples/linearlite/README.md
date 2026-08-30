# linearlite

A Linear-style issue tracker built with jam on top of PGlite and [Electric](https://electric-sql.com). It's a port of Electric's [linearlite demo](https://electric-sql.com/demos/linearlite): the same Postgres schema, client-side triggers, shape sync, and write server, with the React UI replaced by jam components reading and writing facts.

Ported from [electric-sql/electric](https://github.com/electric-sql/electric/tree/main/examples/linearlite) (Apache-2.0). The SQL migrations, sync protocol, and write server are theirs with small changes noted below.

## Running it

**Standalone** — no backend, a local PGlite database seeded with 5,000 issues (`?seed=N` to change the count, applied only when the database is empty):

```bash
corepack pnpm install
corepack pnpm --dir examples/linearlite dev    # http://localhost:5173
```

**With Electric** — Postgres and Electric in Docker, plus the write server:

```bash
corepack pnpm backend:up     # docker compose up, migrate, load 5,000 issues (ISSUES_TO_LOAD=N to change)
corepack pnpm write-server   # Hono on :3001, accepts POST /apply-changes
VITE_ELECTRIC_URL=http://localhost:3000 corepack pnpm dev
```

The client seeds nothing in this mode; it syncs the `issue` and `comment` shapes, enables the triggers, and creates indexes once the initial sync finishes. `VITE_WRITE_SERVER_URL` overrides the write server location; `DATABASE_URL` overrides the Postgres connection for the scripts (default `postgresql://postgres:password@localhost:54321/linearlite`). `pnpm backend:down` tears it down; data lives in tmpfs so it's gone on restart.

## How it's layered

```
Postgres ──Electric shapes──▶ PGlite tables (issue, comment)
                                   │  ▲
                        live query │  │ UPDATE / INSERT / DELETE
                                   ▼  │
                   syncTable ──▶ facts ["issue", id, col, value]
                                   │  ▲
                            when() │  │ replace() / remember() / forget()
                                   ▼  │
                             jam components
```

Reads: `syncTable` runs a windowed live query per view and mirrors the rows into facts, plus `["query", name, "row", index, id]` ordering facts. Components render from those with `when()`.

Writes: components mutate facts; `syncTable` turns them into SQL on the same table. In Electric mode the client triggers then record `modified_columns`, flip `synced` to false, and the write path posts the changed rows to `/apply-changes`, which applies them to Postgres. Electric streams the result back, the trigger sees `electric.syncing` and reconciles it with any newer local edits, the live query fires, and the facts settle. In standalone mode the triggers stay disabled, so every row reads as synced.

Because the bridge only watches the table, Electric needs no jam-specific integration — its writes are ordinary SQL.

### Fact schema

| Facts | Source |
|---|---|
| `["issue", id, column, value]`, `["comment", id, column, value]` | `syncTable` over the two tables; NULL columns are absent |
| `["query", "list" \| "board:<status>" \| "detail" \| "comments", "row" \| "total" \| "offset" \| "limit" \| "ready", …]` | ordering and paging for each view |
| `["stats", "issues", "total", n]` | read-only `count(*)` binding |
| `["route", "url", pathAndSearch]` | `programs/router.ts`; everything else about the route is derived |
| `["ui", "menu" \| "modal" \| "list" \| "search" \| "confirm" \| "new-issue", …]` | transient UI state |
| `["recent", id, "viewedAt" \| "title", …]` | recently viewed issues, persisted via `persist({ pg, include })` |
| `["sync", "status" \| "message", …]` | `standalone`, `initial-sync`, or `done` |

`programs/queries.ts` is a `whenever` on `["route", "url", …]` that (re)creates the bindings each view needs — a 100-row window for the list (moved by the scroll position in `["ui", "list", "scrollTop"]`), 50 rows per board column, and the issue plus its comments on a detail page. New bindings become ready before the old ones are disposed so shared rows never flicker out of the fact database.

### Source map

- `src/pglite-worker.ts` — PGlite in a worker (leader-elected across tabs): migrations, and seeding in standalone mode.
- `src/sync.ts` — shape sync, post-sync indexes, and the write path to the server.
- `src/programs/` — router, queries, UI state, recent issues.
- `src/components/` — the UI. Every component returns exactly one root element.
- `src/mutations.ts` — `createIssue`, `updateIssue`, `deleteIssue`, `moveIssue` (fractional indexing for the board), `addComment`.
- `db/migrations-client/` — PGlite schema and triggers; `db/migrations-server/` — Postgres schema; `db/migrate.ts`, `db/load-data.ts`; `server.ts` — write server.

## Departures from the original

- **Trigger recursion.** The original `handle_update` trigger issued a nested `UPDATE` on the same row for each server-provided column, which re-fires the trigger on PGlite. It now edits `NEW` in place and stores the previous value in `backup`.
- **Deletes.** `deleteIssue` forgets the issue's facts; `syncTable` issues a `DELETE`, which the trigger converts to a soft delete (`deleted = true`) in Electric mode and is a real delete in standalone mode.
- **Generated columns.** `synced` and the other local-state columns are `readonly` in the binding so they're never written back.

## Gotchas worth knowing

- A component prop named `id` is jam's global element id, not a domain id: two components given the same `id` share one DOM element. Components here take `issueId`/`commentId`.
- A `key` only takes effect on the element at its usage site. Putting it on the root of what a component returns does nothing; the root inherits the component's identity.
- PGlite logs a single harmless `ErrnoError` the first time it creates an IndexedDB data directory; the e2e suite filters it out.

## Tests

```bash
corepack pnpm test           # filter-state and an Electric-mode simulation (triggers on, fake shape writes, write-path payloads)
corepack pnpm test:e2e       # Playwright against the standalone app with ?seed=100
```

The Electric path isn't exercised in CI (no Docker); `src/__tests__/sync.test.ts` covers it by running the client migrations in an in-memory PGlite, enabling the triggers, and replaying the transactions Electric would perform.
