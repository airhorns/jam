---
name: jam-browser-validation
description: Validate Jam web examples by launching the real app and driving it with the repo-pinned agent-browser CLI. Use for UI changes, app behavior checks, screenshots, console/error inspection, or any browser proof in this repository.
allowed-tools: Bash(pnpm:*), Bash(pnpm exec agent-browser:*), Bash(agent-browser:*)
---

# Jam Browser Validation

Use this skill when a Jam change should be proven in a browser. Jam uses custom
JSX and a fact database, so validate through the app UI plus any relevant
`window.__db` or DOM checks instead of relying only on static review.

## Launch

Prefer the repo-pinned toolchain:

```bash
pnpm --dir examples/folk-todo dev
```

Use package-specific dev commands when the changed surface is another example:

```bash
pnpm --dir examples/counter dev
pnpm --dir examples/puddy-vite dev
pnpm --dir examples/trello-clone dev
pnpm --dir examples/obsidian-clone dev
pnpm --dir examples/ui-catalog dev
```

If multiple worktrees are active, set a package-specific port or use the port
shown by Vite.

## Drive The App

Use the repo-pinned `agent-browser` dependency:

```bash
pnpm exec agent-browser open http://127.0.0.1:5173
pnpm exec agent-browser snapshot -i
pnpm exec agent-browser fill @e1 "Browser proof"
pnpm exec agent-browser press Enter
pnpm exec agent-browser snapshot -i
```

For folk-todo, a useful smoke path is:

1. Open the app and wait for `todos`.
2. Fill the new todo input.
3. Press Enter.
4. Toggle the created item.
5. Verify item text, class/state, and item count.

For docs or skills changes that only alter guidance, static validation is
usually enough. Use browser validation when the change affects an app, renderer
output, example behavior, or UI component appearance.

Useful evidence commands:

```bash
pnpm exec agent-browser get text body
pnpm exec agent-browser console
pnpm exec agent-browser errors
pnpm exec agent-browser screenshot scratch/browser-proof.png
```

For branch PRs that change UI or app behavior, upload or attach the captured
screenshot/video in the PR description. For low-level non-UI changes, state in
the PR description that media was omitted and why there is no UI-visible effect.

Close browser sessions you opened:

```bash
pnpm exec agent-browser close
```
