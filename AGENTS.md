## Build & Development Commands

```bash
corepack pnpm install       # Install all dependencies
corepack pnpm dev           # Run folk-todo example dev server
corepack pnpm test          # Run package/example unit tests where present
corepack pnpm test:e2e      # Run folk-todo e2e tests (Playwright)
corepack pnpm typecheck     # TypeScript check all packages

# Optional just conveniences, if just is installed
just dev
just test
just test-e2e
just typecheck

# Per-package commands (run from package directory)
corepack pnpm test          # Unit tests (vitest run)
corepack pnpm test:watch    # Watch mode tests
corepack pnpm test:e2e      # E2e tests (Playwright, in examples that have them)
corepack pnpm run bench     # Benchmarks (packages/core only)
```

## Architecture

This is a **pnpm monorepo** with workspaces under `packages/` and `examples/`.

### Core Concept

All application state — including the VDOM — lives in a shared **fact database**. Programs don't call each other; they make **claims** into the database and **react** to other programs' claims. Inspired by Folk Computer / Dynamicland.

### Packages

- **@jam/core** (`packages/core/`): The reactive database and rendering engine.
  - `db.ts` — FactDB: MobX-reactive fact store with per-pattern indexing and Datalog-style pattern matching
  - `primitives.ts` — Public API: `claim`, `remember`, `replace`, `forget`, `when`, `whenever`, `transaction`, `$`, `_`
  - `jsx.ts` — Custom JSX factory (`h`/`Fragment`) with deterministic entity ID generation
  - `renderer.ts` — Two-phase rendering: emit VDOM claims into the fact DB, then patch the real DOM
  - `select.ts` — CSS selector queries over VDOM facts
  - `persist.ts` / `persist-worker.ts` — SQLite/OPFS persistence via wa-sqlite

- **@jam/ui** (`packages/ui/`): Tamagui-inspired styled component library with theming, tokens, and 40+ components.

### Examples

- `examples/counter/` — Minimal counter (good for testing core changes)
- `examples/folk-todo/` — Full todo app with external programs, has unit + e2e tests
- `examples/puddy-vite/` — Chat app with session management, VCR testing (MSW), unit + e2e tests

### Two-Phase Rendering Pipeline

1. **Emit phase**: Execute component tree via JSX, write VDOM facts (prefixed `dom:`) into the fact DB
2. **Patch phase**: Read VDOM facts back out, reconcile against the real DOM

This means external "programs" (using `whenever`) can observe and decorate any element's VDOM facts without touching the component that created them.

## JSX Configuration

All packages use a custom JSX factory — **not React**:

- TSConfig: `"jsxFactory": "h"`, `"jsxFragmentFactory": "Fragment"`
- Vite: `esbuild.jsxFactory: "h"`, `esbuild.jsxFragment: "Fragment"`
- Import: `import { h } from "@jam/core/jsx"` (required in every JSX file)

## Testing

- **Unit tests**: Vitest, files in `src/__tests__/`. Run a single test file: `cd packages/core && corepack pnpm exec vitest run src/__tests__/db.test.ts`
- **E2E tests**: Playwright (Chromium). Test servers use per-worktree default ports to avoid cross-worktree collisions; set `PLAYWRIGHT_PORT` or the example-specific `*_PLAYWRIGHT_PORT` variable to override.
- **CI** runs: install → typecheck → unit tests → folk-todo e2e

## Browser Automation

Use the repo-local `agent-browser` dependency for web automation:

```bash
corepack pnpm exec agent-browser --help
```

If a global `agent-browser` exists, it is fine to use it, but prefer
`corepack pnpm exec agent-browser` in unattended sessions so the CLI version is
pinned by the repo lockfile.

Core workflow:

1. `corepack pnpm dev` or a package-level `corepack pnpm --dir <example> dev` - launch the app
2. `corepack pnpm exec agent-browser open <url>` - navigate to the running app
3. `corepack pnpm exec agent-browser snapshot -i` - get interactive elements with refs (@e1, @e2)
4. `corepack pnpm exec agent-browser click @e1` / `fill @e2 "text"` - interact using refs
5. Re-snapshot after page changes

For Jam app changes, browser validation should touch the actual running app:
launch the relevant example, add or modify real app state through the UI, and
capture evidence with `snapshot -i`, `get text`, `console`, `errors`, or a
screenshot. Do not rely only on static inspection when the change affects user
flows.

## Native / Swift Development

Use the existing Swift package entry points; do not add alternate native command
layers unless the package layout changes.

```bash
just test-swift
just build-native
swift test --package-path packages/native
swift build --package-path examples/counter-ios
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
corepack pnpm --dir examples/folk-todo dev 2>&1 | tee scratch/logs/folk-todo.log
```

For background processes, write both a log and PID file:

```bash
mkdir -p scratch/logs
nohup corepack pnpm --dir examples/folk-todo dev > scratch/logs/folk-todo.log 2>&1 &
echo $! > scratch/logs/folk-todo.pid
tail -f scratch/logs/folk-todo.log
```

Before handoff, stop any process you started and leave the log path in the
workpad or PR notes when it was used as validation evidence.
