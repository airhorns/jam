---
name: jam-ui-visual-review
description: Launch and inspect the @jam/ui component catalog for on-demand visual review, or capture screenshots of it.
allowed-tools: Bash(pnpm:*), Bash(pnpm exec agent-browser:*), Bash(agent-browser:*), Bash(mkdir:*), Bash(tee:*), Bash(tail:*), Bash(kill:*), Bash(cat:*)
---

# Jam UI Visual Review

Use this skill when reviewing @jam/ui component appearance or interaction in a
browser. The catalog in `examples/catalog` renders one demo page per component
through the real Jam renderer, theme tokens, CSS injection and fact-database
state.

## Screenshots without a browser session

For a quick look at one or more components in both themes:

```bash
SHOTS="Button,Dialog" pnpm --dir examples/catalog shots
```

PNGs land in `examples/catalog/shots/<Name>.<demo>.<theme>.png`. Each demo can
declare a shot recipe (click/hover/focus before capture) so overlays are open in
the picture. `pnpm --dir examples/catalog test:e2e` runs the same pass as a
smoke test without writing images.

## Launch

Preserve logs for handoff. Keep this command running in a long-running shell
session while you drive the browser from a second shell:

```bash
mkdir -p scratch/logs
pnpm --dir examples/catalog dev 2>&1 | tee scratch/logs/catalog.log
```

The server listens on port 5175 (`pnpm --dir examples/catalog dev -- --port N`
to move it; the shots/e2e commands read `CATALOG_PORT`). URL parameters select
what is shown: `?c=Button&theme=dark&demo=1&chrome=0`
(`chrome=0` hides the sidebar). In the page, `window.__catalog.show(name, theme,
demoIndex)` switches views without a reload.

```bash
pnpm exec agent-browser open "http://127.0.0.1:5175/?c=Button"
pnpm exec agent-browser snapshot -i
```

## Review Path

1. Toggle light/dark and inspect contrast changes.
2. Walk the component's demos; drive the interactive one (open overlays, toggle
   controls, use the keyboard) and confirm the fact-backed state updates.
3. Capture evidence with text, console, errors, or a screenshot:

```bash
pnpm exec agent-browser get text body
pnpm exec agent-browser console
pnpm exec agent-browser errors
pnpm exec agent-browser screenshot scratch/catalog.png
```

## Cleanup

```bash
pnpm exec agent-browser close
```

Record the log path and any screenshot path in the ticket or PR notes when used
as validation evidence. For branch PRs that touch `@jam/ui` appearance or
interaction, upload captured screenshot/video through GitHub-hosted media tooling
when available and link to that uploaded asset. Do not commit PR media files to
the branch or embed committed media in the PR body.
