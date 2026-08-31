default:
    @just --list

test:
    corepack pnpm -r --if-present test

test-e2e:
    corepack pnpm --dir examples/folk-todo test:e2e
    corepack pnpm --dir examples/puddy-vite test:e2e
    corepack pnpm --dir examples/linearlite test:e2e
    corepack pnpm --dir examples/catalog test:e2e

# Run the @jam/ui component catalog (http://localhost:5175)
catalog:
    corepack pnpm --dir examples/catalog dev

# Screenshot every catalog component (light + dark) into examples/catalog/shots
shots *filter:
    cd examples/catalog && SHOTS="{{filter}}" corepack pnpm shots

typecheck:
    corepack pnpm -r typecheck

# Rust engine: fmt, clippy, cargo-deny, no ignored tests, cargo test (what CI runs)
rust-check:
    corepack pnpm rust:check

# Rebuild packages/engine/pkg from crates/jam-engine-wasm
build-engine:
    corepack pnpm build:engine

dev:
    corepack pnpm --dir examples/folk-todo dev
