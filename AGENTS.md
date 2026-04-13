## Build & Development Commands

```bash
pnpm install              # Install all dependencies
just dev                  # Run folk-todo example dev server
just test                 # Run core + folk-todo unit tests
just test-e2e             # Run folk-todo e2e tests (Playwright)
just typecheck            # TypeScript check all packages

# Per-package commands (run from package directory)
pnpm test                 # Unit tests (vitest run)
pnpm test:watch           # Watch mode tests
pnpm test:e2e             # E2e tests (Playwright, in examples that have them)
pnpm run bench            # Benchmarks (packages/core only)
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

- **Unit tests**: Vitest, files in `src/__tests__/`. Run a single test file: `cd packages/core && npx vitest run src/__tests__/db.test.ts`
- **E2E tests**: Playwright (Chromium). Folk-todo uses port 5174, puddy-vite uses port 5173.
- **CI** runs: typecheck → core tests → folk-todo tests → folk-todo e2e

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
