---
name: jam-ui-visual-review
description: Launch and inspect the @jam/ui visual component catalog for on-demand agent review.
allowed-tools: Bash(corepack pnpm:*), Bash(corepack pnpm exec agent-browser:*), Bash(agent-browser:*), Bash(mkdir:*), Bash(tee:*), Bash(tail:*), Bash(kill:*), Bash(cat:*)
---

# Jam UI Visual Review

Use this skill when reviewing @jam/ui component appearance or interaction in a browser.
It launches the Vite catalog in `examples/ui-catalog`, which exercises exported
Jam UI components through the real Jam renderer, theme tokens, CSS injection, and
fact-database state.

## Launch

Preserve logs for handoff. Keep this command running in a long-running shell
session while you drive the browser from a second shell:

```bash
mkdir -p scratch/logs
corepack pnpm --dir examples/ui-catalog dev 2>&1 | tee scratch/logs/ui-catalog.log
```

Open the printed Vite URL, usually `http://127.0.0.1:5173`:

```bash
corepack pnpm exec agent-browser open http://127.0.0.1:5173
corepack pnpm exec agent-browser snapshot -i
```

## Review Path

1. Confirm the page title is `@jam/ui component catalog`.
2. Toggle Light/Dark and inspect contrast changes.
3. Toggle the notification switch and confirm progress changes.
4. Toggle Accepted, Web/Native radio choices, Comfortable/Compact density, and Overview/Native tabs.
5. Capture evidence with text, console, errors, or a screenshot:

```bash
corepack pnpm exec agent-browser get text body
corepack pnpm exec agent-browser console
corepack pnpm exec agent-browser errors
corepack pnpm exec agent-browser screenshot scratch/ui-catalog.png
```

## Cleanup

```bash
corepack pnpm exec agent-browser close
```

Record the log path and any screenshot path in the ticket or PR notes when used as validation evidence.
For branch PRs that touch `@jam/ui` appearance or interaction, upload or attach
the screenshot/video in the PR description so reviewers can inspect the rendered
component state directly.

## Native Catalog

Use `examples/ui-catalog-native` when validating the same `@jam/ui` primitives
through the SwiftUI renderer. Build the native runtime bundle first so the Swift
resource file reflects current TypeScript source:

```bash
corepack pnpm --dir packages/native build
corepack pnpm --dir examples/ui-catalog-native build:program
swift build --package-path examples/ui-catalog-native
```

For broader native coverage, also run:

```bash
swift test --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/spatial-counter
```

On Linux, first check whether the Swift compiler is available directly or through
the repeatable Docker image:

```bash
swift --version
docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift --version
docker run --rm -v "$PWD":/workspace -w /workspace swift:5.9-jammy swift build --package-path packages/native
```

The current native package imports Apple frameworks (`JavaScriptCore` and
`SwiftUI`), so Linux Swift images can prove compiler availability but cannot
compile or render the Apple-platform targets. If that build fails with missing
Apple modules, record the exact failure and still run the local native-mode VDOM
contract test, web catalog, generated native catalog program, and
`packages/native` JavaScript bundle build:

```bash
corepack pnpm --dir examples/ui-catalog-native build:program
corepack pnpm --dir packages/ui exec vitest run src/__tests__/native-mode.test.ts
corepack pnpm --dir examples/ui-catalog build
corepack pnpm --dir packages/native build
```

The native catalog source remains the handoff artifact for macOS validation. CI
should run the Swift package and native example builds on macOS when this
surface changes.
