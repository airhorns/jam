## Build & Development Commands

```bash
pnpm install       # Install all dependencies
pnpm dev           # Run folk-todo example dev server
pnpm test          # Run package/example unit tests where present
pnpm test:e2e      # Run folk-todo, puddy-vite, linearlite and catalog e2e tests (Playwright)
pnpm typecheck     # TypeScript check all packages

# Optional just conveniences, if just is installed
just dev
just test
just test-e2e
just typecheck

# Per-package commands (run from package directory)
pnpm test          # Unit tests (vitest run)
pnpm test:watch    # Watch mode tests
pnpm test:e2e      # E2e tests (Playwright, in examples that have them)
pnpm run bench     # Benchmarks (packages/core only)

# Rust engine (crates/), from the repo root
pnpm rust:check    # fmt --check, clippy (host + wasm32), cargo-deny, no ignored tests, cargo test — what CI runs
pnpm rust:coverage # cargo-llvm-cov over the crates; CI fails under 95% line coverage
pnpm rust:bench    # criterion suite over the engine at 10k/100k/1M facts, with CI's short sampling; see docs/rust-engine-benchmarks.md
pnpm build:engine  # Rebuild packages/engine/pkg from crates/jam-engine-wasm; commit the result
```

### Rust conventions

`crates/rust-toolchain.toml` pins the toolchain (rustup installs it on first use, including the
`wasm32-unknown-unknown` target); `cargo install cargo-deny --locked`,
`cargo install cargo-llvm-cov --locked` (plus `rustup component add llvm-tools-preview`) and
`cargo install wasm-bindgen-cli --locked --version 0.2.127` (the version pinned in
`crates/jam-engine-wasm/Cargo.toml`) are the only extra tools. Edition 2024, `#![forbid(unsafe_code)]`
via the workspace lints, `warnings = "deny"` and `clippy::all = "deny"` — every lint is an error and is
checked in CI. Prefer fixing over allowing; if you must, `#[allow(lint, reason = "...")]` with a real
reason. No `todo!`/`unimplemented!`/`dbg!`, no `#[ignore]` tests (delete or fix them), no wildcard
dependency versions. Tests live next to the code (`src/tests.rs` for engine-level behaviour, `mod tests`
per module for internals) and use `pretty_assertions`; keep line coverage at or above 95%. `crates/deny.toml` lists the allowed licenses — add one only when a new
dependency actually needs it. `cargo fmt` uses `crates/rustfmt.toml` (120 columns). CI also rebuilds the
WASM and fails if `packages/engine/pkg` differs, so run `pnpm build:engine` after touching the crates.

## New Worktree Setup With Mise

`mise.toml` pins the worktree toolchain. `mise` should be installed
once for the host/user before creating Jam worktrees; do not run the installer
as part of every new worktree setup.

If `mise` is missing from `PATH`, provision the host once, then start a new
shell or export the install location into `PATH` before continuing:

```bash
curl https://mise.run | sh
export PATH="$HOME/.local/bin:$PATH"
```

For each new Jam worktree, verify `mise` is available and then install/use the
repo-pinned tools. Activate `mise` in the shell so `pnpm`, `node`, and `just`
are on `PATH` like normal commands:

```bash
command -v mise
mise install
eval "$(mise activate bash)"
pnpm install
```

After setup, use normal repo commands such as `pnpm typecheck` and `just test`.
If shell activation is not practical in an unattended environment, use
`mise exec -- pnpm typecheck` as a one-command fallback. Both forms keep Node,
pnpm, and just aligned with `mise.toml` instead of whatever happens to be
installed globally.

## Architecture

This is a **pnpm monorepo** with workspaces under `packages/` and `examples/`.

### Core Concept

All application state — including the VDOM — lives in a shared **fact database**. Programs don't call each other; they make **claims** into the database and **react** to other programs' claims. Inspired by Folk Computer / Dynamicland.

### Packages

- **@jam/core** (`packages/core/`): The reactive database and rendering engine.
  - `db.ts` — FactDB: reactive fact store over the `@jam/engine` WASM engine (indexing, pattern matching, owners/scopes); `reactive.ts` — the tracking primitives (`autorun`, `reaction`, `transaction`)
  - `primitives.ts` — Public API: `claim`, `remember`, `replace`, `forget`, `when`, `whenever`, `transaction`, `$`, `_`
  - `jsx.ts` — Custom JSX factory (`h`/`Fragment`) with deterministic entity ID generation; `expandTree` runs the component tree (with `createContext`/`useContext`, `useComponentId`, `useCleanup`, `Portal`) and `emitExpanded` writes the result as facts
  - `renderer.ts` — Two-phase rendering: expand the tree in a tracked effect, emit VDOM claims into the fact DB and run the cleanups of components that left, then patch the real DOM
  - `select.ts` — CSS selector queries over VDOM facts
  - `sync.ts` — `sync()`: every durable fact is mirrored into a `FactStorage` with its `scope`; subscriptions by scope/pattern (or `follow()` driven by other facts) decide which facts are in memory, local-only or streamed from a sync server over WebSockets with the storage log as the outbox; browser tabs sharing a storage elect one leader that holds the connection
  - `tabs.ts` — `TabCoordinator`: BroadcastChannel + Web Locks between the tabs of one origin (`browserTabs`), or none (`soloTabs`)
  - `filter.ts` — `FactFilter` compilation and the wire protocol types shared by client and server
  - `server.ts` (`@jam/core/server`) — `createSyncServer`: the Node side, an engine over any `FactStorage` (`sqliteStorage`, `memoryStorage`) with per-connection filters, snapshot/replay, `allow` authorization
  - `persist.ts` — mirrors device-local facts into their own storage and restores them on load
  - `__bench__/sync.bench.ts` — sync throughput against an in-process `createSyncServer`: initial load, remote-change latency, write round-trips (vitest bench mode skips suite hooks, so fixtures use tinybench `setup`/`teardown`)

- **@jam/engine** (`packages/engine/`, `crates/`): The fact engine. `crates/jam-engine` is the Rust store (facts, owners, scopes, pattern queries, change tracking) and `crates/jam-engine-wasm` its wasm-bindgen wrapper; `packages/engine/pkg/` holds the committed WASM build (`pnpm build:engine` regenerates it — needs `cargo` and `wasm-bindgen-cli`; CI checks it matches the source). `src/index.ts` is the typed TS wrapper (`Engine`), `src/wasm.ts` loads the module in browsers and Node, `src/storage/` the `FactStorage` adapters (`memoryStorage`, `indexedDBStorage`, `sqliteStorage`). See `docs/rust-engine-spec.md`.

- **@jam/ui** (`packages/ui/`): Port of tamagui's web style system and components onto the fact DB. `createJamUI(defaultConfig)` sets up tokens, 390 generated themes (CSS variables behind `t_light t_light_blue t_light_blue_Button` class chains), fonts, media queries and animations; `styled()` supports tamagui-style variants, styled contexts, pseudo/media props and sub-tree theming via `<Theme>`. Read `.agents/skills/jam-ui/style-system.md` before changing the style system; the `jam-ui` skill there indexes one reference doc per component (`components/<Name>.md`, rendered in the catalog beneath each component's demos); `packages/ui/docs/STATUS.md` tracks what is still rough.

### Examples

- `examples/counter/` — Minimal counter (good for testing core changes)
- `examples/folk-todo/` — Full todo app with external programs, has unit + e2e tests
- `examples/puddy-vite/` — Chat app with session management, VCR testing (MSW), unit + e2e tests
- `examples/trello-clone/` — Kanban board example with unit + e2e tests
- `examples/obsidian-clone/` — Linked-note workspace example with unit + e2e tests
- `examples/linearlite/` — Multi-project Linear clone on `sync()`: per-project subscriptions, a `ws` sync server over SQLite (`pnpm server`), unit + e2e tests including a suite against an in-process sync server
- `examples/catalog/` — @jam/ui component catalog (port 5175; set `CATALOG_PORT` if that port is taken — Playwright reuses whatever server is listening there). One demo file per component in `src/demos/`, registered in `src/registry.ts`. URL params: `?c=Button&theme=dark&chrome=0&demo=1`. `pnpm test:e2e` runs the smoke suite (every component renders in both themes with no console errors); `pnpm shots` (or `just shots Button,Card`) writes a PNG per component per theme into `shots/` for visual inspection.

### Two-Phase Rendering Pipeline

1. **Emit phase**: Expand the whole component tree inside a tracked reaction (every component runs tracked, so `when()` anywhere in the tree re-renders on change), then write VDOM facts (prefixed `dom:`) into the fact DB
2. **Patch phase**: Read VDOM facts back out, reconcile against the real DOM

This means external "programs" (using `whenever`) can observe and decorate any element's VDOM facts without touching the component that created them.

Component-level primitives from `@jam/core`:

- `createContext(default)` / `useContext(ctx)` — `<ctx.Provider value>` scopes a value to a subtree; resolved during expansion
- `useComponentId()` — the stable entity id of the calling component instance; use it to key per-instance state in the fact DB (`replace(id, "open", true)`)
- `useCleanup(fn)` — run `fn` once when the calling component leaves the tree (or the root unmounts). Use it to forget per-instance facts, cancel timers and release anything keyed by the component id in module state; cleanups run before the DOM patch, in the same transaction as the new VDOM facts
- Entity ids: an element's `id` prop is its entity id (a global address, so DOM ids must be unique); otherwise ids derive from `key` or tree position. A component's `id` prop is *not* its entity id — it is an ordinary prop the component may hand to a nested element.
- `<Portal>` — renders children as direct children of the mount container (for overlays); ids stay derived from the portal's own tree position
- `injectVdom(parentId, startIndex, ...nodes)` — add children to an existing element from outside the tree

## JSX Configuration

All packages use a custom JSX factory — **not React**:

- TSConfig: `"jsxFactory": "h"`, `"jsxFragmentFactory": "Fragment"`
- Vite: `esbuild.jsxFactory: "h"`, `esbuild.jsxFragment: "Fragment"`
- Import: `import { h } from "@jam/core/jsx"` (required in every JSX file)

## Testing

- **Unit tests**: Vitest, files in `src/__tests__/`. Run a single test file: `cd packages/core && pnpm exec vitest run src/__tests__/db.test.ts`
- **Sync simulation**: `packages/core/src/__tests__/sync-convergence.test.ts` runs seeded random multi-browser, multi-tab runs against a real sync server under fake timers, so a failure reproduces exactly. Widen or narrow it with `SIM_SEEDS=1,2,3` / `SIM_SEEDS=$(seq -s, 1 2000)` and `SIM_STEPS=1000`; `SIM_TRACE=1` appends every storage write and tab message to a failure, `SIM_DEBUG=1` reports where a stuck run stopped. Touching `sync.ts`? Run a few thousand seeds before pushing.
- **DOM tests**: add `// @vitest-environment happy-dom` at the top of a test file to get a real DOM. `@jam/ui/testing` exports `render()`, `css(el, pseudo?)` (declarations the style system injected for an element), `computed()`, `click/keydown/type/focus`, and `resetUI()`.
- **E2E tests**: Playwright (Chromium). Test servers use per-worktree default ports to avoid cross-worktree collisions; set `PLAYWRIGHT_PORT` or the example-specific `*_PLAYWRIGHT_PORT` variable to override.
- **CI** runs: install → typecheck → UI tests → unit tests → folk-todo, puddy-vite, linearlite and catalog e2e. A separate CI job runs the core benchmarks.

## Browser Automation

Use the repo-local `agent-browser` dependency for web automation:

```bash
pnpm exec agent-browser --help
```

If a global `agent-browser` exists, it is fine to use it, but prefer
`pnpm exec agent-browser` in unattended sessions so the CLI version is
pinned by the repo lockfile.

Core workflow:

1. `pnpm dev` or a package-level `pnpm --dir <example> dev` - launch the app
2. `pnpm exec agent-browser open <url>` - navigate to the running app
3. `pnpm exec agent-browser snapshot -i` - get interactive elements with refs (@e1, @e2)
4. `pnpm exec agent-browser click @e1` / `fill @e2 "text"` - interact using refs
5. Re-snapshot after page changes

For Jam app changes, browser validation should touch the actual running app:
launch the relevant example, add or modify real app state through the UI, and
capture evidence with `snapshot -i`, `get text`, `console`, `errors`, or a
screenshot. Do not rely only on static inspection when the change affects user
flows.

## PR Media Requirements

When a branch changes Jam UI, app behavior, examples, renderer output, or
`@jam/ui` component appearance, capture screenshots or video from the relevant
running app, example, or component catalog after validation. Upload or
attach that media in the pull request description so reviewers can inspect the
result without rebuilding locally.

For low-level changes with no user-visible surface, such as fact database
performance work or internal refactors that do not affect rendered output, media
may be omitted. In that case, the pull request description should say media was
omitted and briefly explain why the change has no UI/app-visible effect.

## Runtime Logs

When starting any long-running dev server or backend-like process, preserve logs
so another agent can inspect them later. Use the existing ignored `scratch/`
directory for transient logs:

```bash
mkdir -p scratch/logs
pnpm --dir examples/folk-todo dev 2>&1 | tee scratch/logs/folk-todo.log
```

For background processes, write both a log and PID file:

```bash
mkdir -p scratch/logs
nohup pnpm --dir examples/folk-todo dev > scratch/logs/folk-todo.log 2>&1 &
echo $! > scratch/logs/folk-todo.pid
tail -f scratch/logs/folk-todo.log
```

Before handoff, stop any process you started and leave the log path in the
workpad or PR notes when it was used as validation evidence.
