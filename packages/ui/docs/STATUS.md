# @jam/ui status

Baseline inventory taken before the quality pass (2026-08-29), kept here so the
"after" can be compared against it.

## Baseline findings

**Components.** 34 files, ~45 exported components. Almost all are pure
`styled()` shells:

- Only three event handlers exist in the whole package (`Checkbox`, `Switch`,
  `RadioGroup.Item` onClick). Every `Trigger`, `Close`, `Item`, `Tab` is inert.
- `open` / `value` are decorative on `Dialog`, `AlertDialog`, `Popover`,
  `Select`, `Tooltip`, `Tabs`, `Accordion` — content always renders, so the
  absolutely-positioned overlays are permanently visible.
- No keyboard support anywhere; `role="checkbox|switch|slider"` divs are not
  focusable.
- Props declared in types but not destructured leak onto DOM nodes
  (`Select` open/onOpenChange, `Tooltip` delayDuration, `ToggleGroup` value…).
- Dead code: `Progress` computes `percent` and never uses it; `Spinner` injects
  keyframes nothing references; `Portal` drops its children on the web;
  `Image.objectFit` variants are empty objects; `Slider` ignores value/step.
- Hardcoded colors/shadows/z-indexes bypass tokens and themes.
- No default tokens/themes ship — every consumer defines a palette from scratch.

**Style system.** Theme refs (`$background`) resolve to literal values at render
time, so switching theme re-hashes every class; no sub-tree theming. Media props
(`$gtSm`) are evaluated in JS via `matchMedia` facts rather than emitted as
`@media` rules (`injectMediaRule` is dead code). No `::placeholder` support.
Boolean variants must be passed as the strings `"true"`/`"false"`.

**Core.** `mount()` only tracks the root component; nested components execute
inside the untracked effect, so a `when()` read in a child component does not
re-render when the fact changes.

**QA.** Unit tests call components as plain functions and assert on the returned
VNode's `tag` / that `props.class` is defined / that sub-components exist. No
DOM rendering, no CSS inspection, no events. No visual catalog, no browser
tests for the library. CI does not exercise the library beyond `vitest run`.

## After the style-system pass

See [STYLE-SYSTEM.md](./STYLE-SYSTEM.md) for how the system now works.

**Style system.** Ported from tamagui v4: default tokens/fonts/media/animations
(`defaultConfig`), 390 generated themes (`createDefaultThemes`: light/dark ×
colour × component), themes as CSS variables behind `t_<name>` class chains so
switching theme changes one class, `<Theme>` / `theme` / `themeInverse`
sub-tree theming, component themes (`light_Button`) picked up by `name`.
Variants support spreads, typed catch-alls, functional variants with tamagui's
`extras`, nested variant defaults, `defaultVariants`, `unstyled`, and
`mergeVariants` on extension. `createStyledContext` propagates props between
compound parts. Pseudo (`hover/press/focus/focusVisible/focusWithin/disabled/
placeholder`) and media props emit real CSS rules. Fonts follow tamagui's
`createFont` fill semantics; `SizableText`/`Paragraph`/`Heading`/`H1–H6` and
`Button` (`Frame`/`Text`/`Icon`/`Apply`) match tamagui's composition.

**Core.** Component expansion is tracked, so `when()` in nested components
re-renders; `createContext`/`useContext`, `useComponentId`, `Portal`; `mount`'s
disposer removes the tree's facts.

**QA.** DOM tests through `@jam/ui/testing` (`render`, `css`, `mediaCss`,
events, `resetUI`) — 212 unit tests across 13 files. `examples/catalog` renders
every component in both themes; Playwright smoke suite in CI, `pnpm shots` for
visual review.

**Still open (next pass).** Overlay/menu behaviour (open state, dismiss,
keyboard, focus), `Card` should use its `surface1` component theme and show
elevation, remaining components need the same compound/context treatment as
Button, and per-component docs.
