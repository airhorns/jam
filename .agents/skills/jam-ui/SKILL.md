---
name: jam-ui
description: Build UI with @jam/ui, the tamagui-style component library for Jam apps — setup, style props and tokens, the component index, and one markdown reference per component (props, parts, variants, theming, accessibility).
---

# @jam/ui

`@jam/ui` is a port of tamagui's web style system and components onto Jam's
fact database. Every component renders through Jam's `h()` JSX factory, reads
theme tokens as CSS variables, keeps its widget state in the fact DB, and is
legible to `describeUI()` / drivable with `drive()` and `press()`.

Use this skill when writing or reviewing app UI built on `@jam/ui`. Read the
component's reference in `components/<Name>.md` before using it; read
[`style-system.md`](./style-system.md) before touching tokens, themes,
`styled()` or the CSS pipeline.

## Setup and imports

```tsx
import { h } from "@jam/core/jsx";               // JSX factory (tsconfig: jsxFactory "h", jsxFragmentFactory "Fragment")
import { createJamUI, defaultConfig, YStack, Button } from "@jam/ui";

createJamUI(defaultConfig);                       // once, before mount: tokens, themes, fonts, media, animations
mount(<App />, document.getElementById("app")!);
```

`setTheme("dark")` switches the whole page; `<Theme name="blue">` scopes a
sub-theme. Components take a `theme` prop for the same effect.

## Style props

Every component accepts tamagui's style prop surface as props, resolved to
atomic classes at render time:

- Layout: `flex`, `gap`, `padding`, `margin`, `width`, `height`, `position`, `inset`…
  `XStack`/`YStack` are flex rows/columns; `Stack` is `flex-shrink: 0` and only
  `ScrollView` shrinks.
- Tokens: `padding="$space.4"`, `borderRadius="$radius.3"`, `width="$size.10"`,
  `fontSize="$4"` (font scale), `backgroundColor="$blue9"` (palette),
  theme keys `$background`, `$color`, `$borderColor`, `$backgroundHover`…
- Pseudo and media: `hoverStyle={{…}}`, `pressStyle`, `focusStyle`,
  `$max-sm={{ padding: 12 }}`, `$hoverable`.
- `styled(Tag | Component, { name, defaultProps, variants })` builds new components.

## Conventions that matter to agents

- **Controlled or not**: stateful components take `value`/`defaultValue`/
  `onValueChange` (or `open`/`defaultOpen`/`onOpenChange`, `checked`…).
  Uncontrolled state lives in the fact DB under the component's id.
- **`asChild`**: compound parts (`Dialog.Trigger`, `Popover.Trigger`, `Form.Trigger`…)
  merge their behaviour onto the child you supply instead of rendering their own
  element — see [Slot](./components/Slot.md).
- **Legibility**: every control needs an accessible name (`aria-label`, a
  `Label htmlFor`, or text content). `describeUI()` from `@jam/core` prints the
  outline agents and tests read; `drive(id, key, value)` / `press(id)` operate it.
- **Never write facts during render**; post-commit work goes in `queueMicrotask`.

## Seeing components live

`pnpm dev:ui` serves the catalog at http://localhost:5175 — one page per
component with interactive demos followed by the same reference doc as below
(`?c=Button&theme=dark`, `&chrome=0` hides the sidebar). The
`jam-ui-visual-review` skill covers screenshots and browser inspection.

## Components

Each reference covers usage, props, parts, variants, theming and accessibility.

<!-- components:start -->
### Layout

- [Group](./components/Group.md) — XGroup and YGroup join children into one control, squaring off the interior corners and collapsing adjacent borders. Wrap each child in Group.Item.
- [ScrollView](./components/ScrollView.md) — A scrolling viewport; `horizontal` scrolls the other way and lays children out in a row.
- [Separator](./components/Separator.md) — A one-pixel divider drawn with a border, so it always lands on the pixel grid.
- [Shapes (Square and Circle)](./components/Shapes.md) — Square and Circle: fixed-size boxes that centre their contents, sized from one `size`.
- [Spacer](./components/Spacer.md) — A gap sized from the space scale, or a flexible one that eats the remaining room.
- [Stacks](./components/Stacks.md) — Stack is a flexbox reset; XStack and YStack pin the direction, ZStack layers its children, and ThemeableStack adds the theme-reactive variants everything else extends.

### Typography

- [Text](./components/Text.md) — Text, SizableText, Paragraph, Anchor and the Heading family, sized from the font scale.

### Forms

- [Button](./components/Button.md) — Interactive button with size, variant, and theme-aware pseudo states.
- [Checkbox](./components/Checkbox.md) — A role=checkbox button with checked, unchecked and mixed states.
- [Form](./components/Form.md) — A real `<form>` whose `onSubmit` runs instead of reloading the page. Form.Trigger is the submit button.
- [Input (Input and TextArea)](./components/Input.md) — Single-line Input and multi-line TextArea. One `size` sets height, radius, padding and font size together.
- [Label](./components/Label.md) — A real `<label>`: `htmlFor` gives you native click-to-focus and the control's accessible name.
- [RadioGroup](./components/RadioGroup.md) — One-of-many selection with native radio keyboard behaviour.
- [Select](./components/Select.md) — A single-choice dropdown: combobox trigger, floating listbox sized to it, keyboard navigation and typeahead.
- [Slider](./components/Slider.md) — A thumb dragged along a track to pick a number or a range.
- [Switch](./components/Switch.md) — A role=switch button whose thumb slides one track height when on.
- [ToggleGroup](./components/ToggleGroup.md) — Joined toggle buttons that read as one segmented control.

### Overlays

- [AlertDialog](./components/AlertDialog.md) — A modal that interrupts the user and requires an explicit response; not dismissed by clicking outside.
- [Dialog](./components/Dialog.md) — Modal dialog rendered in a portal with an overlay, focus trap, and Escape/overlay dismissal.
- [Menu](./components/Menu.md) — A dropdown menu of actions with keyboard navigation, typeahead, checkbox and radio items.
- [Popover](./components/Popover.md) — Non-modal floating content anchored to a trigger, with an arrow and viewport-aware placement.
- [Sheet](./components/Sheet.md) — Bottom drawer that slides up over the page and rests at snap points; drag the handle to move or dismiss it.
- [Tooltip](./components/Tooltip.md) — Hover/focus-triggered label for a control, styled as an accent chip.

### Content

- [Accordion](./components/Accordion.md) — Collapsible sections, one open at a time or many.
- [Avatar](./components/Avatar.md) — A fixed-size frame that clips its image. The fallback sits behind, so it shows through whenever the image is missing.
- [Card](./components/Card.md) — A surface with a header and footer that share its sizing. `elevate` adds the themed shadow, `bordered` the outline.
- [Image](./components/Image.md) — A styled `img`: every style prop works, plus `object-fit` under its CSS name and the React-Native `resizeMode` spelling.
- [ListItem](./components/ListItem.md) — A list row with an optional leading icon, a title/subtitle column and a trailing icon. Announced as a list item, so keep the rows inside a `role="list"` container.

### Feedback

- [Progress](./components/Progress.md) — A track whose Progress.Indicator fills to `value` out of `max`. With no value it sweeps as indeterminate.
- [Spinner](./components/Spinner.md) — An indeterminate loading ring. `size` takes "small", "large" or a size token; `color` tints the leading arc.
- [Toast](./components/Toast.md) — Brief auto-dismissing notifications; imperative toasts stack in a viewport, declarative ones float at the same corner.

### Navigation

- [Tabs](./components/Tabs.md) — One panel at a time, chosen from a row or column of tabs.

### Utilities

- [Portal](./components/Portal.md) — Renders children at the root of the mounted tree, so overlays escape any ancestor's clipping and stacking context.
- [Slot (Slot and asChild)](./components/Slot.md) — Merges a component's props onto the element you supply; the mechanism behind every asChild prop.
- [VisuallyHidden](./components/VisuallyHidden.md) — Content for screen readers: still in the accessibility tree and the tab order, just not on screen.
<!-- components:end -->
