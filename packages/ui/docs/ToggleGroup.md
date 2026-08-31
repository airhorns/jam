# ToggleGroup

A row (or column) of joined toggle buttons that reads as one segmented
control: text alignment, a view switcher, a set of filters. `type="single"`
keeps at most one item active and reports a string; `type="multiple"` keeps any
number and reports an array. Use `RadioGroup` when the options are a form
choice rather than a command, and `Tabs` when the items switch panels.

## Usage

```tsx
import { ToggleGroup } from "@jam/ui";

<ToggleGroup type="single" defaultValue="center" size="$3">
  <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
  <ToggleGroup.Item value="center">Center</ToggleGroup.Item>
  <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
</ToggleGroup>
```

Multiple, controlled:

```tsx
const [value, setValue] = useControllableList("marks", { defaultValue: ["bold"] });

<ToggleGroup type="multiple" value={value} onValueChange={setValue}>
  <ToggleGroup.Item value="bold">B</ToggleGroup.Item>
  <ToggleGroup.Item value="italic">I</ToggleGroup.Item>
</ToggleGroup>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"single" \| "multiple"` | `"single"` | Whether the value is a string or an array. |
| `value` | `string \| string[]` | — | Controlled value; matches `type`. |
| `defaultValue` | `string \| string[]` | — | Initial value when uncontrolled. |
| `onValueChange` | `(value: string) => void` / `(value: string[]) => void` | — | Called with the new value; in single mode deselecting reports `""`. |
| `disableDeactivation` | `boolean` | `false` | Pressing the active item again leaves it active. |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | Layout direction, `aria-orientation`, and which arrows navigate. |
| `dir` | `"ltr" \| "rtl"` | `"ltr"` | Reading direction; reverses which arrow moves to the next item. |
| `loop` | `boolean` | `true` | Wrap around at the ends when navigating with the arrow keys. |
| `disabled` | `boolean` | `false` | Disables every item. |
| `size` | size token or number | `"$true"` | Item height, padding, radius and font size. |

`type` discriminates the prop types, so `value`, `defaultValue` and
`onValueChange` are typed as a string in single mode and an array in multiple
mode with no casts.

`ToggleGroup.Item`: `value` (required), `disabled`, `size`, `unstyled`, plus
every style prop.

## Parts

`ToggleGroup.Item` — one toggle. Renders `<button type="button" aria-pressed>`
with `data-state` (`on` / `off`), `data-value` and `data-disabled`, toggles
itself on click, and is disabled when either it or the group is.

`ToggleGroup.Frame` — the styled container.

`ToggleGroup.Apply` — provides `size`/`orientation` to every ToggleGroup
beneath.

## Variants

- `size` — items are sized with `getButtonSized` (height from the size token,
  horizontal padding from the matching space token, radius from the matching
  radius token) and take their font size from the same step, so `$true` gives
  44px-tall items with a 9px outer radius.
- `orientation` — `row` or `column`; also selects which set of injected
  first/last-child rules joins the items.
- `activeState` (item) — the pressed look: `$color5` fill and a `$color7`
  border. Set by the group from its own state rather than by hand.
- `unstyled` (item) — strips the fill, border, padding and sizing.

Only the group's outer corners stay rounded: two CSS rules per orientation are
injected once (`.jam-grouped-h > *:not(:first-child)` …) to square off the
inner corners and pull adjacent items together by 1px so their borders
collapse into one. That does not depend on `Group`, and works with any number
of items.

## Theming

Items read `$background`, `$backgroundHover`, `$backgroundPress`,
`$borderColor`, `$outlineColor`, `$color` and, when active, `$color5` /
`$color6` / `$color7`. There is no `ToggleGroup` component theme, so
`theme="…"` on the group recolours it — `theme="blue"` gives a blue active
segment.

## Accessibility

- The group is `role="group"` with `aria-orientation` and `data-orientation`;
  items are plain buttons carrying `aria-pressed`, which is the correct role
  for a toggle that does not switch panels.
- Every item is a native button, so each is a tab stop and Space/Enter
  activates it. Arrow keys along the orientation additionally move focus
  between the enabled items and wrap at the ends unless `loop` is `false`; Home
  and End always jump to the first and last. `dir="rtl"` swaps which arrow
  moves forward. Cross-axis arrows are left alone.
- The focus ring is drawn inside the item (`outlineOffset: -1`) with
  `zIndex: 10`, so it is not clipped by the neighbouring segment.
- Disabled items get the real `disabled` attribute and are skipped by both Tab
  and the arrow keys.
