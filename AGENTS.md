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

- **@jam/ui** (`packages/jamagui/`): Tamagui-inspired styled component library with theming, tokens, and 40+ components.

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

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
