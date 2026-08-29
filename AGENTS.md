## Build & Development Commands

```bash
pnpm install       # Install all dependencies
pnpm dev           # Run folk-todo example dev server
pnpm test          # Run package/example unit tests where present
pnpm test:e2e      # Run folk-todo, puddy-vite, and linearlite e2e tests (Playwright)
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
```

## New Worktree Setup With Mise

`mise.toml` pins the Codex/native worktree toolchain. `mise` should be installed
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
  - `db.ts` — FactDB: MobX-reactive fact store with per-pattern indexing and Datalog-style pattern matching
  - `primitives.ts` — Public API: `claim`, `remember`, `replace`, `forget`, `when`, `whenever`, `transaction`, `$`, `_`
  - `jsx.ts` — Custom JSX factory (`h`/`Fragment`) with deterministic entity ID generation; `expandRoot` runs the component tree (with `createContext`/`useContext`, `useComponentId`, `Portal`) and `emitExpanded` writes the result as facts
  - `renderer.ts` — Two-phase rendering: expand the tree in a tracked reaction, emit VDOM claims into the fact DB, then patch the real DOM
  - `select.ts` — CSS selector queries over VDOM facts
  - `pglite.ts` / `pglite-worker.ts` — `openDatabase`: PGlite (Postgres in WASM) in a shared worker, backed by IndexedDB
  - `persist.ts` — mirrors facts into a `jam_facts` table and restores them on load
  - `tables.ts` — `syncTable`: live queries over PGlite tables ↔ facts, fact writes → SQL (what Electric sync plugs into)

- **@jam/ui** (`packages/ui/`): Tamagui-inspired styled component library with theming, tokens, and 40+ components.

### Examples

- `examples/counter/` — Minimal counter (good for testing core changes)
- `examples/folk-todo/` — Full todo app with external programs, has unit + e2e tests
- `examples/puddy-vite/` — Chat app with session management, VCR testing (MSW), unit + e2e tests
- `examples/trello-clone/` — Kanban board example with unit + e2e tests
- `examples/obsidian-clone/` — Linked-note workspace example with unit + e2e tests
- `examples/linearlite/` — Linear clone on PGlite + Electric sync (port of Electric's demo), unit + e2e tests
- `examples/catalog/` — @jam/ui component catalog (port 5175). One demo file per component in `src/demos/`, registered in `src/registry.ts`. URL params: `?c=Button&theme=dark&chrome=0&demo=1`. `pnpm test:e2e` runs the smoke suite (every component renders in both themes with no console errors); `pnpm shots` (or `just shots Button,Card`) writes a PNG per component per theme into `shots/` for visual inspection.
- `examples/ui-catalog/` — Browser catalog for `@jam/ui` component review
- `examples/ui-catalog-native/` — Native catalog source for SwiftUI renderer coverage
- `examples/counter-ios/` and `examples/spatial-counter/` — Swift native examples

### Two-Phase Rendering Pipeline

1. **Emit phase**: Expand the whole component tree inside a MobX reaction (every component runs tracked, so `when()` anywhere in the tree re-renders on change), then write VDOM facts (prefixed `dom:`) into the fact DB
2. **Patch phase**: Read VDOM facts back out, reconcile against the real DOM

This means external "programs" (using `whenever`) can observe and decorate any element's VDOM facts without touching the component that created them.

Component-level primitives from `@jam/core`:

- `createContext(default)` / `useContext(ctx)` — `<ctx.Provider value>` scopes a value to a subtree; resolved during expansion
- `useComponentId()` — the stable entity id of the calling component instance; use it to key per-instance state in the fact DB (`set(id, "open", true)`)
- `<Portal>` — renders children as direct children of the mount container (for overlays); ids stay derived from the portal's own tree position
- `injectVdom(parentId, startIndex, ...nodes)` — add children to an existing element from outside the tree

## JSX Configuration

All packages use a custom JSX factory — **not React**:

- TSConfig: `"jsxFactory": "h"`, `"jsxFragmentFactory": "Fragment"`
- Vite: `esbuild.jsxFactory: "h"`, `esbuild.jsxFragment: "Fragment"`
- Import: `import { h } from "@jam/core/jsx"` (required in every JSX file)

## Testing

- **Unit tests**: Vitest, files in `src/__tests__/`. Run a single test file: `cd packages/core && pnpm exec vitest run src/__tests__/db.test.ts`
- **DOM tests**: add `// @vitest-environment happy-dom` at the top of a test file to get a real DOM. `@jam/ui/testing` exports `render()`, `css(el, pseudo?)` (declarations the style system injected for an element), `computed()`, `click/keydown/type/focus`, and `resetUI()`.
- **E2E tests**: Playwright (Chromium). Test servers use per-worktree default ports to avoid cross-worktree collisions; set `PLAYWRIGHT_PORT` or the example-specific `*_PLAYWRIGHT_PORT` variable to override.
- **CI** runs: install → typecheck → UI tests → unit tests → folk-todo, puddy-vite, linearlite and catalog e2e. A separate CI job runs core benchmarks. The native Swift packages are not built in CI: `packages/native` bundles `@jam/core` as a single IIFE, which cannot include the PGlite worker.

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

When a branch changes Jam UI, app behavior, examples, native views, renderer
output, or `@jam/ui` component appearance, capture screenshots or video from the
relevant running app, example, or component catalog after validation. Upload or
attach that media in the pull request description so reviewers can inspect the
result without rebuilding locally.

For low-level changes with no user-visible surface, such as fact database
performance work or internal refactors that do not affect rendered output, media
may be omitted. In that case, the pull request description should say media was
omitted and briefly explain why the change has no UI/app-visible effect.

## Native / Swift Development

Use the existing Swift package entry points; do not add alternate native command
layers unless the package layout changes.

```bash
just test-swift
just build-native
swift test --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/spatial-counter
swift build --package-path examples/ui-catalog-native
```

Before native work, probe the host:

```bash
swift --version
xcrun simctl list devices
```

If Swift/Xcode is unavailable, record that as an environment limitation in the
ticket workpad and still run the web/package validation that is relevant to the
change.

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
