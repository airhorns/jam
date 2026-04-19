# @jam/ui testing

`@jam/ui` follows the practical parts of Tamagui's current strategy that fit Jam:

- package-level Vitest coverage for component primitives, styling, tokens, themes, media, and native-mode output;
- DOM render smoke tests for representative components through Jam's real renderer;
- an on-demand visual catalog for browser review instead of pixel snapshots;
- native validation through the Swift runtime tests in `packages/native`.

## Automated tests

Run the UI package tests:

```bash
corepack pnpm --dir packages/jamagui test
```

The root CI path also runs these tests explicitly through:

```bash
corepack pnpm test:ui
```

`src/components/__tests__/rendering.test.tsx` uses jsdom to mount components with
`@jam/core` so the test covers VDOM emission, DOM patching, injected CSS, and
fact-database interaction. The rest of the suite keeps fast package-level checks
for component structure and style resolution.

## Visual review

Launch the catalog:

```bash
corepack pnpm dev:ui
```

Or run it directly:

```bash
corepack pnpm --dir examples/jamagui-catalog dev
```

Use `.agents/skills/jam-ui-visual-review/SKILL.md` for the full agent workflow,
including browser commands, interaction path, logs, screenshots, and cleanup.
The catalog is intentionally not a pixel-regression suite; it is a review surface
for humans and coding agents.

## Native strategy

Native parity is intentionally basic for now. The required checks are:

```bash
swift test --package-path packages/native
corepack pnpm --dir packages/native typecheck
```

`packages/native/Tests/JamNativeTests/ComponentTests.swift` exercises Jam UI
components in native mode through `JamRuntime` and verifies the emitted native
VDOM/style facts. If Swift or Xcode is unavailable, record that limitation and
still run the TypeScript check for the native bridge.
