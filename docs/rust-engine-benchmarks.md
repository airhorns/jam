# jam-engine benchmarks

`crates/jam-engine/benches/engine.rs` is a criterion suite over the engine's main use cases at
10k, 100k and 1M facts. It exists to keep the hot paths honest as the store and query engine
change: every group below is something linearlite or the catalog does on every keystroke, load
or sync batch.

## Running

```bash
pnpm rust:bench                       # CI's settings: 10 samples, 1s measure, 1s warm-up, no plots
cd crates && cargo bench -p jam-engine                          # full criterion sampling
cd crates && cargo bench -p jam-engine -- 'query|churn'         # one or more groups
cd crates && cargo bench -p jam-engine -- --save-baseline main  # then --baseline main after a change
```

Criterion writes `crates/target/criterion/<group>/<bench>/<size>/new/estimates.json`; the
`Engine Benchmarks` CI job uploads those as the `jam-engine-benchmarks` artifact on every push.
The job is a smoke test that the suite still compiles and runs — GitHub runners are too noisy
for regression thresholds, so compare numbers locally with `--baseline`.

Timings depend heavily on whether the working set fits in cache; the 1M-fact world is the one
that exercises DRAM. Run on a quiet machine and repeat anything surprising before believing it.

## The world

Issues spread over 16 projects, five facts each (`[issue $id project p]` asserted with scope
`project:p`, then `title`, `status` (alternating open/closed), `priority` (0–4) and `created`),
plus one `[project p name n]` fact per project. "With queries" worlds register what a linearlite
client keeps live: the four-clause list join, the every-title query and one
`[issue $id project p] [issue $id status $s]` query per project.

| group | bench | what it measures |
|---|---|---|
| `load` | `no-queries` | `apply` + `drain` of the whole world into an empty engine |
| | `with-queries` | the same load with the standard queries registered, so every fact is routed and joined |
| | `clear` | `Engine::clear` of a loaded world |
| `lookup` | `has_fact/{hit,miss}` | a single exact probe of the primary table |
| | `scope_of` | scope lookup of one fact |
| | `intern/{existing,new}` | interning a known and a fresh string |
| `facts` | `entity` | `facts(NONE, [issue id _ _])` — all five facts of one issue |
| | `attribute` | `facts(NONE, [issue _ status open])` — half the issues |
| | `scope` | every fact of one project's scope |
| | `all` | every fact |
| `query` | `entity` | one-shot `query` for one issue's title |
| | `project-open` | one-shot two-clause query: open issues of one project |
| | `join-3` / `join-4` | one-shot three- and four-clause joins across every issue |
| `register` | `titles` | `register` + `drain` + `release` of the every-title query |
| | `join-4` | the same for the list join |
| | `rows/join-4` | `rows` of a registered list join |
| `churn` | `assert-existing` | asserting a fact that is already present (a no-op transaction) |
| | `replace-title` / `replace-status` | a single `replace` with the standard queries live |
| | `create+delete-issue` | five asserts then a wildcard drop of the issue |
| | `batch-1000-titles` | one transaction replacing 1000 titles |
| | `drop-wildcard+reassert` | `[issue _ priority 3]` dropped (a fifth of the issues) and reasserted |
| `revoke` | `reclaim-1000` | revoking an owner of 1000 `dom` facts and reasserting under a fresh one |
| | `tree-100x10` | the same through 100 child owners of 10 facts each |

Throughputs are per fact (or per row for queries), so `M/s` columns compare directly across sizes.

## Results

Mean times with CI's sampling on a busy development laptop (load average 15–30), so treat them
as indicative. "Before" is the engine as first merged; "after" is the store described in
[`rust-engine-spec.md` §4.2](rust-engine-spec.md).

| bench | 10k before → after | 100k before → after | 1M before → after |
|---|---|---|---|
| load/no-queries | 738 µs → 347 µs | 8.39 ms → 4.02 ms | 155 ms → 50 ms |
| load/with-queries | 14.9 ms → 2.50 ms | 176 ms → 31 ms | 2.70 s → 430 ms |
| load/clear | 1.61 ms → 128 µs | 5.96 ms → 1.64 ms | 109 ms → 19 ms |
| lookup/has_fact/hit | 4 ns → 13 ns | 5 ns → 15 ns | 17 ns → 74 ns |
| lookup/scope_of | 29 ns → 14 ns | 36 ns → 17 ns | 146 ns → 68 ns |
| facts/entity | 195 ns → 201 ns | 221 ns → 209 ns | 390 ns → 284 ns |
| facts/attribute | 4.5 µs → 9.4 µs | 38 µs → 92 µs | 2.38 ms → 4.97 ms |
| facts/scope | 14.7 µs → 18.1 µs | 130 µs → 179 µs | 5.18 ms → 2.40 ms |
| facts/all | 35 µs → 38 µs | 598 µs → 404 µs | 14.8 ms → 6.3 ms |
| query/entity | 294 ns → 271 ns | 417 ns → 298 ns | 644 ns → 522 ns |
| query/project-open | 10.9 µs → 17.0 µs | 126 µs → 175 µs | 3.67 ms → 5.86 ms |
| query/join-3 | 250 µs → 179 µs | 3.35 ms → 2.03 ms | 69.8 ms → 63.1 ms |
| query/join-4 | 145 µs → 111 µs | 2.12 ms → 1.27 ms | 48.8 ms → 33.6 ms |
| register/titles | 181 µs → 65 µs | 1.67 ms → 645 µs | 22.8 ms → 18.3 ms |
| register/join-4 | 147 µs → 120 µs | 1.80 ms → 1.32 ms | 38.0 ms → 34.4 ms |
| churn/replace-title | 75 ns → 82 ns | 105 ns → 97 ns | 8.0 µs → 340 ns |
| churn/replace-status | 70 ns → 79 ns | 104 ns → 97 ns | 10.1 µs → 250 ns |
| churn/create+delete-issue | 15.8 µs → 3.3 µs | 19.7 µs → 3.3 µs | 37.7 µs → 3.3 µs |
| churn/batch-1000-titles | 66 µs → 77 µs | 97 µs → 98 µs | 248 µs → 220 µs |
| churn/drop-wildcard+reassert | 1.08 ms → 76 µs | 12.5 ms → 894 µs | 164 ms → 30.6 ms |
| revoke/reclaim-1000 | 690 µs → 233 µs | | |

What moved the big numbers, in the order it was found by profiling (`samply record` over a
release build with `CARGO_PROFILE_RELEASE_STRIP=false CARGO_PROFILE_RELEASE_DEBUG=true`):

- **Routing by shape.** Facts are matched to query clauses through one hash lookup on
  `(length, first two literal positions, their values)` instead of a probe per registered
  pattern, so a fact's cost no longer grows with the number of registered queries.
- **Buckets keep their positions.** Every fact records where it sits in each index bucket, so
  removal is a swap-remove instead of a scan — `create+delete-issue` and `drop-wildcard` stopped
  scaling with bucket size.
- **Fewer indexes.** Scans are served by an index on their first two literal positions only and
  check the rest per fact, so the linearlite world builds a handful of indexes instead of one per
  literal combination and every insert does a handful of hash-table writes instead of a dozen.
- **A prefix-grouped primary table.** Facts are keyed by all terms but the last with 12-byte
  entries, so exact probes, `[e a _]`-shaped lookups and `replace` all hit the same table, and
  the one cache miss per fact that dominated `load` is shared between them.

## Known trade-offs

- `has_fact` at 1M facts is 74 ns rather than 17 ns: the primary table is ~12 MB and no longer
  L2-resident, and confirming a tag match dereferences the fact slot, a second cache miss. Every
  path that used to pay a second probe (replace, intern, routing) got faster by more than that.
- `facts/attribute` and `query/project-open` are ~2× slower than before because the scan policy
  indexes two literal positions and checks the third per fact (`[issue _ status open]` walks
  every status fact, half of which match); the index it saves is one every insert would
  otherwise pay for. The policy is `scan_mask` in `store.rs` if a workload needs three.
- One-shot `query/join-3` at 1M facts produces 200k rows and its per-row cost roughly doubles
  from 100k to 1M as the joins leave cache; the runtime keeps queries registered and reads
  `rows`, which is the `register/rows/join-4` case.

## Profiling

```bash
cd crates
CARGO_PROFILE_RELEASE_STRIP=false CARGO_PROFILE_RELEASE_DEBUG=true \
  cargo bench -p jam-engine --no-run
samply record --save-only -o profile.json.gz \
  target/release/deps/engine-<hash> --bench --profile-time 5 'load/with-queries/1000000'
samply load profile.json.gz
```

`--profile-time` makes criterion run the routine for a fixed time without sampling statistics,
which is what a profiler wants.
