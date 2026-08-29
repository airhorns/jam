# RadioGroup

A set of options of which exactly one can be chosen. The group is a
`role="radiogroup"` container and each item is a `role="radio"` button, so
arrow keys move the selection the way they do in a native radio group. Use
`ToggleGroup` when several options may be active at once and `Select` when the
list is long enough to want a dropdown.

## Usage

```tsx
import { RadioGroup, Label, XStack } from "@jam/ui";

<RadioGroup defaultValue="monthly" name="billing">
  {["monthly", "yearly"].map((value) => (
    <XStack key={value} gap="$3" alignItems="center">
      <RadioGroup.Item value={value} id={value}>
        <RadioGroup.Indicator />
      </RadioGroup.Item>
      <Label htmlFor={value}>{value}</Label>
    </XStack>
  ))}
</RadioGroup>
```

Controlled and horizontal:

```tsx
const [value, setValue] = useControllableState<string>("plan", { defaultValue: "a" });

<RadioGroup value={value} onValueChange={setValue} orientation="horizontal" size="$5">…</RadioGroup>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Controlled selection. |
| `defaultValue` | `string` | — | Initial selection when uncontrolled; omit for none. |
| `onValueChange` | `(value: string) => void` | — | Called with the newly selected item's value. |
| `orientation` | `"horizontal" \| "vertical"` | `"vertical"` | Layout direction, `aria-orientation`, and which arrow keys navigate. |
| `disabled` | `boolean` | `false` | Disables every item in the group. |
| `size` | size token or number | `"$2"` gap, `"$true"` items | Item diameter and the gap between rows. |
| `required` | `boolean` | `false` | Sets `aria-required` on the group. |
| `name` | `string` | — | Rendered as `data-name`, reserved for form integration. |

`RadioGroup.Item`: `value` (required), `disabled`, `size`, `unstyled`, `id`,
plus every style prop. `RadioGroup.Indicator`: `forceMount`, `unstyled`, plus
every style prop.

## Parts

`RadioGroup.Item` — one radio. Renders `<button type="button" role="radio">`
with `aria-checked`, `data-state` and `data-value`, selects itself on click,
and is disabled when either it or the group is.

`RadioGroup.Indicator` — the filled dot, rendered only while its item is
selected (`forceMount` keeps it mounted). Sized at 50% of the item so it
follows the item's `size` with no extra maths.

`RadioGroup.Frame` — the styled container.

`RadioGroup.Apply` — provides `size`/`orientation` to every RadioGroup beneath.

## Variants

- `size` — on the group it sets the gap from the matching space token; on an
  item it sets the diameter at half the size token (tamagui's ratio), so
  `$true` (44) gives a 22px radio.
- `orientation` — `row` or `column` layout.
- `checkedState` (item) — the selected look: a 2px `$color` ring. Set by the
  group from its own state rather than by hand.
- `unstyled` — strips the group's gap and the item's background, border and
  sizing.

## Theming

Items read `$background`, `$borderColor`, `$borderColorHover`, `$outlineColor`
and `$color`; the indicator fills with `$color`. There is no `RadioGroup`
component theme, so `theme="…"` anywhere above recolours the whole group —
`theme="blue"` gives blue rings and dots.

## Accessibility

- `role="radiogroup"` with `aria-orientation` and, when set, `aria-required`;
  items are `role="radio"` with `aria-checked`.
- Arrow keys along the group's orientation move the selection **and** the
  focus to the next enabled item, wrapping at the ends; Home and End jump to
  the first and last. Cross-axis arrows are left alone so the page can still
  scroll.
- Tab order matches native radios: with nothing selected every item is
  tabbable, and once something is selected only the selected item is, so Tab
  enters and leaves the group as a single stop.
- Disabled items get the real `disabled` attribute, so they are skipped by
  both Tab and the arrow keys.
- Pair each item with a `Label htmlFor` pointing at the item's `id`.
