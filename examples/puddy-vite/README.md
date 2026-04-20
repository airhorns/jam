# puddy-vite

Web-based prototype of the Puddy chat app, built on a simplified Jam fact database using Preact + Vite.

## Setup

```bash
corepack pnpm install
corepack pnpm --dir examples/puddy-vite exec sandbox-agent install-agent mock --no-token
```

The Playwright e2e config installs the built-in `mock` agent and starts a real
local sandbox-agent server automatically. For manual development, run the same
server the app proxies to:

```bash
corepack pnpm --dir examples/puddy-vite exec sandbox-agent server --no-token --no-telemetry --host 127.0.0.1 --port 2468
```

## Development

```bash
corepack pnpm dev          # Start dev server at http://localhost:5173
```

## Testing

```bash
corepack pnpm test         # Run unit tests (vitest)
corepack pnpm test:watch   # Run tests in watch mode
corepack pnpm test:e2e     # Run Playwright e2e tests
corepack pnpm typecheck    # TypeScript type checking
```

Playwright requires browsers installed: `corepack pnpm exec playwright install chromium`

## Architecture

The app uses a Jam-style fact database (`src/jam.ts`) as its primary state store instead of conventional Preact state management. All application state lives as tuples in the fact DB, and UI components subscribe to patterns via `useWhen()`.

- `src/jam.ts` — Fact database with scoped `claim`, durable `remember`, singleton `replace`, destructive `forget`, and reactive `useWhen()` queries
- `src/app.tsx` — Main UI built with `useWhen()` reactive queries
- `src/models/` — ACP event parser and session helpers
- `src/networking/` — HTTP/SSE client and session manager
