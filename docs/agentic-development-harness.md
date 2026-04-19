# Agentic Development Harness

This repo includes a small harness for unattended development sessions that need to launch Jam examples, inspect logs, drive a browser, or check the Swift/native surface.

Use `mise exec -- <command>` when `mise` is available so Node, pnpm, and just match `mise.toml`.

## Logged App Runs

Start the default folk-todo app with logs captured under `.jam/logs/`:

```bash
mise exec -- corepack pnpm run agent:dev
```

Inspect and stop runs:

```bash
mise exec -- corepack pnpm run agent:status
mise exec -- corepack pnpm run agent:logs
mise exec -- corepack pnpm run agent:stop
```

The same commands are available through just:

```bash
mise exec -- just agent-dev
mise exec -- just agent-status
mise exec -- just agent-logs
mise exec -- just agent-stop
```

The harness writes one JSON run record per launched process under `.jam/runs/`. Each record includes the PID, command, working directory, URL, and log path. `.jam/` is ignored by git.

For arbitrary long-running components, use `start custom` and put the command after `--`:

```bash
mise exec -- node scripts/agent-harness.mjs start custom -- corepack pnpm --dir examples/puddy-vite dev
mise exec -- node scripts/agent-harness.mjs logs
```

## Browser Validation

`agent-browser` is pinned as a root dev dependency. The folk-todo smoke test opens the running app, adds a todo, toggles it done, and verifies the DOM changed:

```bash
mise exec -- corepack pnpm run agent:dev
mise exec -- corepack pnpm run agent:browser
mise exec -- corepack pnpm run agent:stop
```

By default the smoke uses the worktree-specific port chosen by `playwright.worktree-port.mjs`. Override it with `FOLK_TODO_AGENT_PORT` or pass an explicit URL:

```bash
mise exec -- node scripts/agent-harness.mjs start folk-todo --port 5173
mise exec -- node scripts/agent-harness.mjs browser-smoke folk-todo --url http://127.0.0.1:5173
```

## Native and Swift

Native commands are routed through the same harness so agents have one entry point for Swift work:

```bash
mise exec -- corepack pnpm run agent:native
mise exec -- node scripts/agent-harness.mjs native build packages/native
mise exec -- node scripts/agent-harness.mjs native test packages/native
mise exec -- node scripts/agent-harness.mjs native run examples/counter-ios
```

`native doctor` reports whether `swift`, `xcrun`, and the known native package manifests are present. Build/test/run commands fail with a clear message when Swift is not installed.

## Direct CLI Reference

```bash
node scripts/agent-harness.mjs --help
node scripts/agent-harness.mjs start folk-todo
node scripts/agent-harness.mjs status
node scripts/agent-harness.mjs logs
node scripts/agent-harness.mjs stop all
node scripts/agent-harness.mjs browser-smoke folk-todo
node scripts/agent-harness.mjs native doctor
```
