# Jam

A reactive rule engine inspired by [Folk](https://folk.computer)'s When/Wish/Claim programming model, built on [DBSP](https://github.com/feldera/feldera) (Database Stream Processor) for automatic incremental computation.

## What it does

Programs assert **facts** (statements) and define **rules** that react to facts and derive new ones. When a fact is retracted, all facts that were derived from it are automatically retracted too — cascading through arbitrarily long rule chains. This "automatic revocation" is the core feature.

```
Program asserts: "omar is cool"
Rule fires:      "if X is cool, derive X is awesome"
Rule fires:      "if X is awesome, derive X is legendary"

Retract "omar is cool"
→ "omar is awesome" automatically disappears
→ "omar is legendary" automatically disappears
```

Programs can be added and removed at runtime. Removing a program retracts all its claims and rules, cascading through the system.

## How it works

The system is built on DBSP, an incremental computation engine that uses **Z-sets** (multisets with integer weights). Facts are elements with weight +1 (present) or -1 (retracted). DBSP automatically propagates negative weights through all operators — filters, joins, recursive fixed-point loops — so retraction cascades are handled by the math, not by a hand-built dependency graph.

When rules change (program added/removed), the DBSP circuit is rebuilt from scratch and all current facts are re-injected. Circuit construction is microseconds; re-derivation is proportional to total facts. Between rebuilds, DBSP processes only deltas — proportional to what changed, not the full dataset.

### Architecture

```
Engine (public API — manages programs, facts, circuit lifecycle)
  │
  ├── Programs: HashMap<ProgramId, {claims, rules}>
  ├── Facts: base facts + hold state
  │
  └── Compiled DBSP Circuit (rebuilt when rules change)
       │
       ├── facts_input ──┐
       ├── hold_input ───┤
       │                 ▼
       │   ┌─────────────────────────────────────────┐
       │   │  RECURSIVE SUBCIRCUIT (fixed-point)     │
       │   │                                         │
       │   │  all_facts = external + derived         │
       │   │                                         │
       │   │  Rule 1: filter → flat_map(body) ──┐    │
       │   │  Rule 2: filter → join → body ─────┤    │
       │   │  Rule N: ...                       │    │
       │   │                                    ▼    │
       │   │  derived = union(outputs) ──► feedback  │
       │   └─────────────────────────────────────────┘
       │       │
       └── all_facts ──► output
```

Each rule gets dedicated DBSP operators (like Feldera compiles SQL into specialized dataflow). Single-pattern rules are `filter → flat_map`. Multi-pattern rules use `join_index` on shared variables. The recursive subcircuit handles rule chains (rule A's output triggers rule B).

## Module map

- **`term.rs`** — `Term` (symbol/int/string/bool) and `Statement` (Vec<Term>). These carry the heavy DBSP derive burden (rkyv, SizeOf, IsNone) so they can live in Z-sets.
- **`pattern.rs`** — `Pattern` and `PatternTerm` (exact match, variable bind, wildcard). `match_statement()` does unification, returning `Bindings` (BTreeMap<VarId, Term>). Supports repeated variables for intra-pattern joins.
- **`rule.rs`** — `RuleSpec`, `Program`, `BodyFn`. A program is a named bundle of claims (unconditional facts) and rules (pattern → body function). Body functions are `Arc<dyn Fn(&Bindings) -> Vec<Statement>>` — must be deterministic since DBSP requires pure operators.
- **`circuit.rs`** — `compile_circuit()` takes a rule set and builds a DBSP dataflow. This is the core: recursive subcircuit for fixed-point evaluation, `flat_map` for single-pattern rules, `join` for multi-pattern rules, `plus` to union outputs.
- **`engine.rs`** — `Engine` is the public API. Manages program lifecycle (add/remove → circuit rebuild), fact assertion/retraction, Hold! (persistent state that survives program removal), and delta tracking across rebuilds.

## Key concepts

**Statement**: An ordered sequence of terms — the atom of data. Like Folk's natural-language facts but structured: `[Symbol("omar"), Symbol("is"), Symbol("cool")]`.

**Pattern**: A statement template with variable slots. `[Bind("x"), Exact("is"), Exact("cool")]` matches any 3-term statement where terms 1-2 are "is" and "cool", capturing term 0 as `x`.

**Rule**: A pattern (or patterns joined with shared variables) plus a body function. When matching facts exist, the body runs and produces derived facts. When the triggering facts are retracted, the derived facts are automatically retracted.

**Program**: A named bundle of claims and rules, analogous to a Folk page. Adding/removing a program rebuilds the circuit.

**Hold!**: Persistent facts keyed by (program_id, optional name). Calling `hold()` with a key retracts the previous value and asserts the new one. Hold facts survive program removal — they enter the circuit via a separate input stream.

**Step**: One call to `engine.step()` processes all pending deltas, runs the circuit to fixed point, and returns what changed as `Vec<(Statement, +1/-1)>`.

## What's not built yet

- Negation (`/nobody/` — fire when no match exists) via DBSP antijoin
- Collected results (aggregation across all matches) via DBSP aggregate
- A frontend DSL / macro system for writing rules ergonomically
- Subscribe/Notify (discrete events vs continuous reactive state)
- Performance optimization (better indexing, compiled pattern matchers)
- Rules with >2 patterns

## Reference

See `FOLK.md` for a comprehensive writeup of Folk's programming model — the system this is based on.
