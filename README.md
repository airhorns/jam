# Jam

A reactive rule engine where programs assert facts, define rules that derive new facts, and everything cleans up automatically when inputs are retracted.

Inspired by [Folk](https://folk.computer)'s When/Wish/Claim programming model. Built on [DBSP](https://github.com/feldera/feldera) for incremental computation.

## The idea

Programs don't call each other. They make **statements** into a shared reactive database, and **rules** react to those statements by deriving new ones. When a statement is retracted, everything downstream of it is automatically retracted too.

```rust
use jam::{engine::Engine, rule::{Program, RuleSpec}, pattern::{bind, exact_sym}, term::Term};
use std::sync::Arc;

let mut engine = Engine::new();

// Install a program with a claim and a rule
engine.add_program(Program {
    name: "example".into(),
    claims: vec![stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]],
    rules: vec![RuleSpec {
        // When /x/ is cool...
        patterns: vec![pat![bind("x"), exact_sym("is"), exact_sym("cool")]],
        // ...derive /x/ is awesome
        body: Arc::new(|bindings| {
            let x = bindings.get("x").unwrap().clone();
            vec![stmt![x, Term::sym("is"), Term::sym("awesome")]]
        }),
    }],
});

let result = engine.step();
// result.deltas = [("omar is cool", +1), ("omar is awesome", +1)]
```

Retract the input and everything derived from it vanishes:

```rust
engine.retract_fact(stmt![Term::sym("omar"), Term::sym("is"), Term::sym("cool")]);
let result = engine.step();
// result.deltas = [("omar is cool", -1), ("omar is awesome", -1)]
```

This works through arbitrarily long rule chains. Rule A derives fact B, rule B derives fact C — retract A's input and both B and C disappear.

## Features

- **Automatic retraction cascades** — retract a fact, all derived facts vanish. No manual cleanup.
- **Pattern matching with variable binding** — rules match facts by structure, capturing values into named variables.
- **Multi-pattern joins** — rules can require multiple facts to match simultaneously, joined on shared variables.
- **Chained rules** — derived facts trigger further rules, evaluated to a fixed point via DBSP's recursive subcircuit.
- **Program lifecycle** — add/remove named programs (bundles of claims + rules) at runtime.
- **Hold! state** — persistent facts with key-based overwrite that survive program removal.
- **Incremental** — between rule changes, only processes deltas proportional to what changed.

## How it works

The engine compiles rules into a [DBSP](https://www.feldera.com/blog/implementing-z-sets) dataflow circuit. Facts are elements in Z-sets (multisets with integer weights: +1 = present, -1 = retracted). DBSP propagates negative weights through all operators automatically, so retraction cascades are handled by the math.

When rules change (program added/removed), the circuit is rebuilt (~microseconds) and all facts are re-derived (~proportional to total facts). Between rebuilds, DBSP processes only incremental deltas.

See [FOLK.md](./FOLK.md) for the programming model this is based on, and [AGENTS.md](./AGENTS.md) for implementation details.

## Development

```bash
just test       # run tests
just check      # clippy
just fmt        # format
```

Requires Rust 1.91.1+ (set in `rust-toolchain.toml`).
