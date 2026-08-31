# jam-engine: a Rust fact store for jam

Status: implemented on branch `rust-engine`. This document is the design; the
crate under `crates/jam-engine` and the packages under `packages/engine` and
`packages/core` are the implementation.

## 1. Why

`@jam/core` stores every fact in a MobX observable `Map`, evaluates each
`when()`/`whenever()` pattern set by re-scanning the map whenever a fact that
*could* match it changes, and relies on MobX for dependency tracking, batching
and structural comparison. Durable facts are mirrored into PGlite (Postgres in
WASM, ~3 MB, a shared worker, IndexedDB) and synced through Electric shapes;
Electric's `live.changes` re-materialises and re-diffs a whole shape inside
Postgres-WASM on every commit, so remote-change latency grows linearly with the
number of facts in a shape (~35 ms at 10k facts).

The three costs we want to remove:

1. **Query maintenance is O(matching facts) per change**, not O(change).
   `db.index()` bumps a version counter and re-runs the full scan+join on the
   next read. A single `replace()` of one issue field re-derives every
   `whenever` over `["issue", $.id, $.col, $.val]`.
2. **Reactivity is generic**. MobX tracks observable reads, compares results
   structurally (a deep compare of the whole result array on every re-run) and
   schedules reactions; it knows nothing about facts.
3. **Storage and sync are in the way**. PGlite and Electric are large, async,
   worker-hosted systems doing work (live queries, shape logs, triggers) that
   the fact store should own. Storage should just store.

The replacement is a small incremental Datalog engine in Rust, compiled to WASM
for the browser and Node, with storage reduced to "a table of facts" behind an
adapter and sync reduced to a WebSocket protocol between two instances of the
same engine.

## 2. Research summary

Three systems informed the design. The full reports are summarised here; the
decisions taken from each are marked ➜.

### 2.1 DBSP / Feldera

DBSP (Budiu, Chajed, McSherry, Ryzhyk, Tannen; the engine under Feldera)
models a computation as a circuit over streams of **Z-sets** — multisets with
integer weights, where +1 is an insert and −1 a delete — and derives the
incremental version of any query `Q` mechanically as `Qᐩ = D ∘ Q ∘ I`
(differentiate ∘ query ∘ integrate). Linear operators (filter, map, project)
incrementalise to themselves and need no state. Joins are bilinear:
`Δ(A ⋈ B) = ΔA ⋈ B + A ⋈ ΔB + ΔA ⋈ ΔB`, which requires keeping the integrated
inputs indexed but makes each step cost O(|Δ| · lookups). `distinct` is the
sign-flip trick: emit ±1 only when a row's accumulated weight crosses zero.
The Rust `dbsp` crate runs a static operator DAG one synchronous tick at a
time (`step()`), stores integrated relations as sorted columnar batches in an
LSM-like spine, and is single-threaded per circuit — the model transplants to
WASM without threads or timestamps. Turso built a from-scratch DBSP-style IVM
for the same reason rather than porting the crate.

➜ Query results are Z-sets: each row carries a weight, rows appear when the
weight goes positive and disappear at zero. ➜ Every fact change is propagated
as a delta through the joins that could see it, using the bilinear rule
generalised to n clauses (§4.4). ➜ One synchronous "tick" = one transaction;
the engine has no timestamps. ➜ No spine/batches: our relations are small
enough to live in hash indexes.

### 2.2 Eve (Kodowa, 2014–2018)

Eve's runtime went through three engines. 0.2 re-ran a whole *block* (rule)
when a coarse "tripwire" said a committed fact could affect it — too slow.
0.3 became genuinely delta-driven: each change flows through compiled join
nodes that extend the join only from the changed tuple, with multiplicities
computed per round (semi-naive evaluation) and a **`DistinctIndex`** that
turns counted derivations into set semantics with automatic retraction by
emitting a delta exactly when a fact's cumulative count crosses zero. Facts
were EAV + a provenance *node* id, so the same triple could be independently
supported by several rules. 0.4 (`eve-native`) rewrote that in Rust because
the TS engine, even incremental, was not fast enough: interned integer ids,
flat count arrays per round, unboxed single-value index leaves promoted to
hash maps on demand. Fixpoints were bounded by hard caps (30 rounds / 10k
changes) and reported as errors. Post-mortems (Granger: "25 relational
engines, 16 storage engines"; Brandon: "things unlearned") warn against
novel join algorithms without a baseline and against a slow first
representation.

➜ Interned `u32` term ids from day one; facts, index keys and result rows are
`u32` slices; nothing on the hot path hashes strings. ➜ Small-then-large
index buckets. ➜ Support (ownership) is a property of the fact, counted, and
retraction happens when the count reaches zero — no per-derivation
bookkeeping in rules. ➜ A conventional join (index nested loops over a plan
built from bound positions) rather than a clever one. ➜ Fixpoint iteration is
capped and the cap is an error.

### 2.3 Folk Computer

Folk (Rizwan, Cuervo; Tcl+C) stores statements as word lists in a
copy-on-write trie; a `When` clause is itself a statement, and one code path
(`reactToNewStatement`) matches new statements against existing Whens *and*
new Whens against existing statements. The dependency graph is bipartite:
**Statements** with a `parentCount` and **Matches** (a When applied to a
tuple of statements) whose bodies' claims become child statements. Removing a
statement removes its Matches, which decrement their children's parent counts
and remove those that hit zero — cascade retraction with destructors attached
to the Match. Re-asserting an identical statement is a lookup plus a refcount
bump (`dbInsertOrReuseStatement`), and per-frame churn goes through `Hold!`, a
keyed upsert that no-ops when the value is unchanged. `&`-joins are desugared
to nested Whens; `Collect` republishes all matches of a clause as one
versioned list fact after a settle time. The 2024 C rewrite added
generation-counted weak refs, per-worker work-stealing queues and epoch
reclamation to hit camera frame rates.

➜ jam's ownership model *is* Folk's match graph: a `whenever` run is a Match,
its claims are child statements supported by that run, and revoking the run
retracts them unless another owner still holds them. ➜ `replace()` is `Hold!`.
➜ `whenever(patterns, body)` receiving every match at once is `Collect`; the
engine gives it the full result set and a precise "changed" signal instead of
a settle timer. ➜ Bidirectional matching falls out of maintaining results
incrementally: registering a query evaluates it against existing facts, and
each new fact is routed to the clauses it can match.

## 3. Goals and non-goals

Goals

- Facts, indexes, query maintenance, ownership, scopes and change
  notification in one Rust crate with no I/O and no threads, compiled to WASM
  (`wasm32-unknown-unknown`) and native.
- O(Δ) work per fact change: proportional to the rows the change adds to or
  removes from registered queries, independent of unrelated facts.
- A JS package (`@jam/engine`) that works unchanged in Vite/browsers, Node and
  Vitest, exposing a low-level API that `@jam/core` builds on.
- `@jam/core` keeps its public surface (`claim/remember/replace/forget`,
  `when/whenever`, `transaction`, `scoped`, `program`, JSX, `mount`, `select`,
  `persist`, `sync`) with MobX and PGlite removed.
- Storage adapters that only store: IndexedDB in browsers, `node:sqlite` in
  Node, memory for tests.
- A WebSocket sync protocol between a client engine and a server engine
  replacing Electric shapes and the outbox POST endpoint, with per-filter
  subscriptions, an authorisation policy, and an exact acknowledgement fence.

Non-goals (for this iteration)

- Aggregates, negation, arithmetic or recursion inside queries. Bodies do
  that in JS as today.
- Multi-tab coordination through locks. Each tab runs its own engine and
  connection; storage writes are idempotent.
- Migrating existing PGlite data. Pre-1.0: schemas change outright.

## 4. Engine design (`crates/jam-engine`)

### 4.1 Terms and interning

`Term = Str | Num(f64) | Bool`. The `Interner` assigns dense `TermId: u32`
ids; `0 = false`, `1 = true`, `2 = ""` (the global scope). Two values above
`0xF000_0000` are reserved for patterns: `VAR_BASE + i` is variable `i`,
`WILD` matches without binding, `NONE` means "unbound"/"inherit". The JS side
mirrors the table (`id → term`, `term → id`) so a term is converted exactly
once in each direction; ids are the only thing that crosses the boundary.

Ids are reference counted by the facts (each term occurrence plus the scope)
and registered queries (each literal clause position) that use them, so a
store that churns through values does not grow its term table without bound.
An id nobody holds is not freed immediately: `drain` collects in two phases,
so an id that reached zero is freed by the second drain after its last use and
stays resolvable through the drain that reports its last fact. Freed ids are
reported as the first event of that drain (`FREE n id…`) and go on a free list
for reuse. The JS mirror forgets a freed id before it processes the rest of the
drain, because a listener handling a later event may intern a term and be handed
that id back. The rule for callers: a term id is stable while a fact or a
registered query uses the term; otherwise it is only good until the next flush,
so interned ids are consumed right away rather than cached. `apply` rejects an
op naming an id that is not live (`unknown term id`) instead of panicking.

### 4.2 Facts and indexes (`store.rs`)

A fact is `terms: SmallVec<[TermId; 4]>`, `scope: TermId`, `owners:
SmallVec<OwnerId>`, `seq: u64` in a slot table addressed by `FactId`. The
primary table groups facts by every term but their last — the shape a join
probes by (`[issue $id title $t]` with `$id` bound) — as a `hashbrown::HashTable`
of 12-byte entries `(31-bit prefix hash, first fact id, its last term)`. An
exact lookup hashes the prefix, confirms a tag match against the first fact's
terms and compares the last term inline; a prefix with several facts (multi-valued
attributes, short facts like `[dom node]`) keeps the others in a side table
`first fact id → Vec | IndexMap<last term → fact id>`, flagged by the entry's
low bit. Because the prefix table doubles as the `(len, every position but the
last)` index, most joins need no other index.

Other indexes are keyed by `(tuple length, bitmask of positions)` and map the
tuple of those positions to a bucket of fact ids. Buckets are keyless: an
entry is `(hash, SmallVec<FactId>)` and the key is verified against the first
fact's terms, which the walk is about to read anyway. Each fact record stores
its position in every bucket it belongs to, so removal is an O(1)
`swap_remove`; iteration is insertion order, except that removal moves the
last id into the hole. Scans (`facts()`, one-off `query()`, a plan's seed and
the first clause's ordering lookup) are indexed by only the first two literal
positions of the pattern and filter the rest per fact, so the set of indexes
stays small — every index costs each insert a hash table write, and at 1M
facts an index whose key includes a high-cardinality position is a 1M-entry
table. Walk steps with bound variables use the full mask. Indexes are created
the first time a plan needs them (§4.4) by one pass over the facts of that
length and maintained on every insert/remove afterwards; in practice a jam app
settles on a handful.

### 4.3 Queries (`query.rs`)

A query is `Vec<Clause>`, a clause is `Vec<u32>` of literal ids, variables
and wildcards. Variables are numbered by first appearance across the clauses
(the JS side owns the names). Results live in a `ResultSet`: `row → RowId`,
`slots[RowId] = (row, weight, weight before this transaction, touched)` and a
`touched: Vec<RowId>` list of the rows this transaction changed. Row ids are
stable while a row has non-zero weight and are recycled after it is drained, so
the JS side can keep `Map<RowId, Bindings>` without hashing rows.

Result order is the order in which the facts matching the *first* clause were
asserted: every fact carries a monotonically increasing `seq`, and a row's
order key is the `seq` of the fact the first clause binds to (the smallest
one when that clause has wildcards). A list keyed by entity therefore keeps
its order when other attributes are replaced, a single-clause query over a
multi-valued attribute lists values oldest to newest, and replacing the first
clause's own attribute moves the entity to the end — the same order the
Map-based store produced before the engine.

Registering a query builds:

- `full_plan`: the clause with the most literals is the seed, scanned through
  the `(len, literal mask)` index; the remaining clauses are ordered greedily
  by how many of their positions are already bound (literals plus variables
  bound by earlier clauses), each becoming a step `(clause, mask, key
  sources)`. A step whose mask covers every position is an exact probe of the
  primary table.
- `delta_plans[i]`, one per clause, built the same way with clause `i` as the
  seed; steps for clauses `< i` are marked `exclude_seed`.

All `(len, mask)` pairs the plans probe are ensured as indexes.

### 4.4 Incremental maintenance

For a fact `f` added to or removed from the store, `Queries::propagate` routes
it to the clauses it may match. Clauses are keyed by their *shape* — tuple
length plus the first two literal positions — and the literals at those
positions: `[issue $id status open]` lives under shape `(4, {0, 2})` with key
`(issue, status)` and keeps `open` as a residual literal to check. A changed
fact is hashed once per registered shape of its length (typically one or two),
so a fact no query cares about costs a lookup or two and nothing else. For
each clause `f` unifies with, the delta plan runs with the partial bindings
from `f`, emitting every complete row with weight ±1.

Correctness of the multi-clause delta uses the n-ary form of DBSP's bilinear
rule. New results after adding `f` are exactly the joins where some clause
`i` is matched by `f`, clauses before `i` are matched by facts *other than*
`f`, and clauses after `i` by any fact including `f`:

    Δ(C₀ ⋈ … ⋈ Cₙ) = Σᵢ  C₀' ⋈ … ⋈ Cᵢ₋₁' ⋈ {f} ⋈ Cᵢ₊₁ ⋈ … ⋈ Cₙ

with `C' = C \ {f}`. The `exclude_seed` flag on steps for clauses `< i`
implements the primes; for additions the store already contains `f`, for
removals the delta is computed before `f` is removed. A fact matching two
clauses of the same query is therefore counted once per combination, and
removals produce exactly the negation of the additions that created a row.

Changes inside a transaction are applied one at a time, each fully propagated
before the next, so the store is always the correct "integrated input" for
the delta being computed.

### 4.5 Ownership (`owner.rs`)

Owners form a tree rooted at `ROOT = 0` (the durable owner). A fact exists
while it has at least one owner; adding an owner to an existing fact is not a
change; `revoke(owner)` revokes the subtree, detaches its facts and removes
those left with no owner. Owner records keep an `IndexSet<FactId>` so
`forget` of a single fact under a large owner is O(1); the root owner does
not track its facts because it is never revoked. Ownership is jam's existing
semantics (`claim` under the current owner, `remember` under root,
`whenever` runs as child owners) — and Folk's match graph.

### 4.6 Scopes

Each fact carries a scope term (default `""`). Resolution order when a fact
is created: the scope passed with the op (the JS scope stack), else the scope
of a fact it replaces, else the registered scope of the entity `(t₀, t₁)`,
else global. `entity_scopes: (t₀, t₁) → (scope, count)` is maintained on
insert/remove exactly as `FactDB` does today. `set_scope` re-tags without
notifying.

### 4.7 Transactions and the wire (`engine.rs`, `wire.rs`)

The JS side packs a transaction into one `Uint32Array` of ops:

    ASSERT  owner scope len t…      (scope NONE = inherit)
    INSERT  scope len t…            (root owner)
    REPLACE scope len t…            (drop other facts with the same prefix, insert)
    DROP    len t…                  (t may be WILD)
    REVOKE  owner
    SET_SCOPE scope len t…
    CLEAR

`Engine::apply(ops)` executes them in order, propagating every fact change,
then `drain()` returns one `Uint32Array` of events:

    FREE  n id…                     (term ids freed since the previous drain; always first)
    QUERY qid nvars nrows (rowid flag [values… order_hi order_lo])…
    FACT  flags scope len t…        (flags: added/removed, durable, replace)

Values and the 64-bit order key are included only for rows that appeared in
this transaction (`flag` 1); `flag` 0 means the row left. Fact events
are emitted at the requested level (none / durable only / all) so the render
path pays nothing for observers that only care about durable facts.

Owner creation (`create_owner(parent) → id`), query registration
(`register(clauses) → qid`, `release(qid)`), interning and result reads
(`rows(qid)`, `query(clauses)` for one-off evaluation, `facts_matching(filter)`)
are direct calls.

`stats()` reports the engine's size as one array laid out by the `STAT_*`
positions: live facts and fact slots, live terms and term slots, owners,
indexes and their buckets (primary prefixes included), registered queries,
their result rows and routes, and the event words awaiting a drain.
`@jam/engine` decodes it into `EngineStats` and adds the module's linear
memory size; `db.stats()` adds the core layer's owners, maintained indexes,
watches, listeners and refs, and `publishStats()` republishes those numbers as
`["engine", name, value]` facts on an interval so programs and UI can watch
them.

### 4.8 Filters (`filter.rs`)

A sync filter is `{ scope?: TermId, pattern?: Clause }` (pattern literals only;
variables act as wildcards). `matches(fact)` is a scope compare plus a literal
compare per position; `facts_matching` evaluates it through the index for the
pattern's literal mask when present.

## 5. `@jam/engine` (`packages/engine`)

- `crates/jam-engine-wasm` exposes the engine with `wasm-bindgen`. The build
  (`just build-engine` / `pnpm --dir packages/engine build`) runs
  `cargo build --release --target wasm32-unknown-unknown` and `wasm-bindgen
  --target web` into `packages/engine/pkg/`, which is committed so consumers
  need no Rust toolchain.
- `src/index.ts` loads the module with top-level `await`: `new
  URL("./pkg/jam_engine_bg.wasm", import.meta.url)` is fetched in browsers and
  read with `fs` when the URL is `file:` (Node, Vitest). Importers of
  `@jam/core` therefore see an initialised engine synchronously.
- `Engine` (TS) owns the term mirror, packs ops, decodes events, and exposes
  `QueryHandle { rows(): Bindings[]; changed: boolean; delta }` objects that
  apply drained deltas to `Map<RowId, {bindings, weight}>` and rebuild the
  array lazily.
- `storage/`: `FactStorage` interface — `load()`, `write({upserts, deletes,
  log, meta})`, `getMeta`, `readLog/logHead/trimLog`, `close()` — with
  `memoryStorage()`, `indexedDBStorage(name)` and `sqliteStorage(path)`
  (`node:sqlite`). Storage assigns log seqs (IndexedDB `autoIncrement`, SQLite
  `AUTOINCREMENT`) and `write` returns them, so a server transaction can log
  several entries and several browser tabs can append to one outbox without
  coordinating; a seq is never reused, even after the log is trimmed. The
  layout is stamped with `FORMAT_VERSION` (the IndexedDB database version,
  SQLite's `user_version`); a store written under another version is emptied
  on open and sync re-snapshots — there are no migrations before 1.0.

## 6. `@jam/core` on the engine

- `db.ts` becomes a facade over `Engine` preserving `insert/assert/drop/
  replace/query/index/observe/withOwnerScope/createChildOwner/revokeOwner/
  withScope/scopeOf/setScope/clear/facts/refs`. Owner names stay strings at
  this layer (mapped to engine ids). `db.facts` is a read-only Map view built
  on demand for debugging and tests.
- `reactive.ts` replaces MobX: a tracker stack (`when()` records the query it
  read), `effect(fn)` objects subscribed to queries, and a scheduler that
  flushes pending ops, drains dirty queries, runs affected effects, and
  repeats to a fixpoint (cap 1000 rounds, error beyond). `transaction(fn)`
  only defers effect execution; reads inside it see prior writes because
  reads flush pending ops first.
- `whenever` = one query + one effect: revoke the previous run owner, create a
  new one, run the body with the current rows. It re-runs only when the
  engine reports the result set changed (weights, not array identity).
- `renderer.ts` keeps its two phases. Expansion runs inside an effect that
  tracks the `when()` calls of every component. The patch phase maintains a
  VDOM index (tags, classes, props, text, handlers, children) incrementally
  from the deltas of eight registered wildcard queries and reconciles the
  DOM; `select()` reads the same index.
- `persist()` mirrors durable facts into a `FactStorage` (default IndexedDB
  in browsers, memory in Node unless a storage is passed); `sync()` is §7.
- `tables.ts`, `pglite*.ts`, `filter.ts`'s SQL compiler and the Electric
  parts of `sync.ts`/`server.ts` are deleted.

## 7. Sync

Two engines, one protocol. The server holds the authoritative durable facts
in an engine plus an append-only **log** of committed changes
`(seq, op, terms, scope)` in its storage; the client holds the facts its
active subscriptions cover.

Messages (JSON over WebSocket):

    → { type: "subscribe", id, filter, since? }
    ← { type: "snapshot", id, seq, facts: [[terms, scope]…] }      full state (since missing/too old)
    ← { type: "changes",  seq, changes: [{ op, terms, scope }…] }  one committed transaction, filtered per client
    → { type: "push", id, changes: [{ op: "upsert"|"delete"|"replace", terms, scope }…] }
    ← { type: "ack", id, seq } | { type: "reject", id, error }
    → { type: "unsubscribe", id }

Server: `applyChanges` runs the `allow(scope)` policy (403-equivalent reject),
applies to the engine as root-owned facts, persists facts + log entries in one
storage write and takes the seq of the transaction's last entry as its `seq`
(a client at `since` replays exactly the entries of later transactions), then for each connection
sends the subset of the transaction matching any of its filters. A
subscription with `since` newer than the log's oldest retained seq gets the
log replayed; otherwise a snapshot.

Client (`sync()`): loads locally stored facts per filter on subscribe (instant
offline state), then reconciles with the snapshot/changes; keeps `holds: key →
Set<subscription>` so a fact leaves memory when its last subscription is
disposed (`keepShapes` retention keeps released filters' rows in storage);
`follow(patterns, wanted)` re-derives the subscription set from facts. Writes:
durable changes go to a persisted outbox and are pushed in order; a pushed
batch is retired once every active subscription whose filter matches it has
applied the transaction with that `seq` — the exact fence Electric could not
give us. Status facts are unchanged: `["sync","status",…]`,
`["sync","pending",n]`, `["sync","shape",id,"ready",bool]`, `["sync","error",m]`.

Tabs: every browser tab sharing a storage `name` runs its own `sync()` over
its own engine, but they hold one connection between them. A Web Lock names
the **leader**, which owns the socket, subscribes to the union of every tab's
filters (`want`/`drop`/`bye` messages over a `BroadcastChannel`), persists
server changes into the shared mirror and broadcasts them (`state`), pushes
the shared outbox in storage order and broadcasts acks (`acked upTo`). Any tab
writes its own changes to the outbox and, once storage has assigned their
seqs, announces them (`local`) so every tab shows the write at once and holds
its keys until the ack. Followers learn the connection state from `conn`; a
new leader posts `lead`, after which every tab re-sends its `want`s, and
resumes from the per-subscription seqs recorded in storage. Pushes are
idempotent per entry, so the handover can at worst repeat a batch.

Other tabs' writes take effect at their place in the log, not as the writer
saw them: a tab applying a `local` entry (or the log it finds at startup, or
the log the leader reads before a push) lets a later outbox entry for the same
fact win, lets a replace evict the other values of its attribute — including
one a later replace evicts even though its writer stored it — and re-persists
the outcome so it lands after anything written from a partial view. Incoming
server changes are fenced by pending writes to the same fact and by pending
replaces of the same attribute. Only the leader writes what it applies; a
follower that decides differently (from a fence or a log entry the leader
heard in another order) notes the key and writes its mirror's value for it if
it later takes the lead. The leader records `acked` in storage meta before
trimming the log so a tab starting later skips acknowledged entries, and a
closing tab lets its last writes land and announces them before leaving.
`sync-convergence.test.ts` runs a deterministic randomized simulation of this
(three browsers, two tabs in one, drops, reloads, subscription churn) against a
real `createSyncServer` and checks that memory, storage and server agree.

`@jam/core/server` exports `createSyncServer({ storage, allow })` returning a
handler for `ws` connections; linearlite's `server.ts` becomes this plus a
Node `WebSocketServer`. A native Rust server would reuse `filter.rs` and the
engine; it is not part of this iteration.

## 8. Migration of the repo

| Area | Change |
| --- | --- |
| `crates/` | new Cargo workspace: `jam-engine`, `jam-engine-wasm` |
| `packages/engine` | new `@jam/engine` (loader, mirror, storage adapters, committed `pkg/`) |
| `packages/core` | `db.ts` facade, `reactive.ts`, renderer/select/jsx on the tracker, `persist.ts`/`sync.ts`/`server.ts` rewritten, `tables.ts` + `pglite*.ts` removed, deps `mobx`/`@electric-sql/*` removed |
| `packages/ui` | `db.index(...).get()` keeps working |
| examples | counter/trello/obsidian/catalog: none. folk-todo: `persist()` without PGlite. puddy-vite: `db.facts` scan → query. linearlite: PGlite worker, Electric containers and Hono server replaced by `sync({ url })` + a WebSocket sync server over `node:sqlite`; e2e `__pg` helpers become engine/sync helpers |
| docs | README "Persistence and sync", AGENTS.md core file list, this spec |

## 9. Verification

- `cargo test` in `crates/`: interner, store/index behaviour, join deltas
  (including a fact matching two clauses, repeated variables, removals
  restoring the pre-state), ownership cascade, scopes, filters, wire
  round-trips, plus a randomised check that incremental results equal
  from-scratch evaluation after every op.
- `pnpm --dir packages/engine test`: loader in Node, mirror, op packing,
  QueryHandle deltas, storage adapters.
- `pnpm test` (core + examples) and `pnpm typecheck`.
- e2e: folk-todo (persistence), puddy-vite, catalog, linearlite standalone
  and against the sync server.
- `pnpm --dir packages/core bench`: `db.bench`/`reactive.bench`/`render.bench`
  before and after; `sync.bench` rewritten for the WebSocket path.
