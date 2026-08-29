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
