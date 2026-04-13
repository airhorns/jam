# puddy-vite

Web-based prototype of the Puddy chat app, built on a simplified Jam fact database using Preact + Vite.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev          # Start dev server at http://localhost:5173
```

## Testing

```bash
pnpm test         # Run unit tests (vitest)
pnpm test:watch   # Run tests in watch mode
pnpm test:e2e     # Run Playwright e2e tests
pnpm typecheck    # TypeScript type checking
```

Playwright requires browsers installed: `npx playwright install chromium`

## Architecture

The app uses a Jam-style fact database (`src/jam.ts`) as its primary state store instead of conventional Preact state management. All application state lives as tuples in the fact DB, and UI components subscribe to patterns via `useWhen()`.

- `src/jam.ts` — Fact database with scoped `claim`, durable `remember`, singleton `replace`, destructive `forget`, and reactive `useWhen()` queries
- `src/app.tsx` — Main UI built with `useWhen()` reactive queries
- `src/models/` — ACP event parser and session helpers
- `src/networking/` — HTTP/SSE client and session manager
