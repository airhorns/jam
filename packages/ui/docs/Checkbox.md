# Checkbox

A single on/off control for a form field or setting. Renders a real
`<button role="checkbox">` so click, Space and focus work natively, and
supports a third `"indeterminate"` state for "some of the children are
checked" summaries. Use `Switch` for settings that take effect immediately and
`RadioGroup` when exactly one of several options must be chosen.

## Usage

```tsx
import { Checkbox, Label, XStack } from "@jam/ui";

<XStack gap="$3" alignItems="center">
  <Checkbox id="terms" size="$4" defaultChecked={false}>
    <Checkbox.Indicator />
  </Checkbox>
  <Label htmlFor="terms">Accept the terms</Label>
</XStack>
```

Controlled, including the mixed state:

```tsx
const [checked, setChecked] = useControllableState<CheckedState>("checked", { defaultValue: "indeterminate" });

<Checkbox checked={checked} onCheckedChange={setChecked}>
  <Checkbox.Indicator />
</Checkbox>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `checked` | `boolean \| "indeterminate"` | — | Controlled state. |
| `defaultChecked` | `boolean \| "indeterminate"` | `false` | Initial state when uncontrolled. |
| `onCheckedChange` | `(checked: CheckedState) => void` | — | Called with the new state on every toggle, controlled or not. |
| `disabled` | `boolean` | `false` | Sets the real `disabled` attribute and applies `disabledStyle`. |
| `size` | size token or number | `"$true"` | Box side, radius and indicator glyph size. |
| `unstyled` | `boolean` | `false` | Drop the default look. |
| `name` | `string` | — | Renders a hidden mirrored `<input type="checkbox">` so the value posts with a form. |
| `value` | `string` | `"on"` | Value of that hidden input. |
| `required` | `boolean` | `false` | Sets `aria-required` and mirrors onto the hidden input. |

Uncontrolled state lives in the fact database under the checkbox's component
id, so it survives re-renders and is inspectable like any other fact.

## Parts

`Checkbox.Indicator` — the mark inside the box. Rendered only while the
checkbox is checked or indeterminate (`forceMount` keeps it mounted). With no
children it draws a `✓` glyph at 75% of the box size; in the indeterminate
state it draws a centred dash instead of its children. Accepts every style
prop plus `size` (inherited from the Checkbox by default).

`Checkbox.Frame` — the styled button, for composing your own root.

`Checkbox.Apply` — provides `size` to every Checkbox beneath it.

## Variants

- `size` — a size token (`"$2"`, `"$true"`) or a number. The box is 45% of the
  size token, rounded to a quarter of that (tamagui's ratios), so `$true` (44)
  gives a 20px box with a 5px radius.
- `unstyled` — strips background, border, padding and sizing, keeping only the
  button semantics.

## Theming

The frame reads `$background`, `$borderColor`, `$borderColorHover`,
`$borderColorPress`, `$backgroundPress`, `$outlineColor` and `$color`; the
indicator reads `$color`. There is no `Checkbox` component theme, so
`theme="accent"` (or any theme on an ancestor) recolours the box and its mark
together.

## Accessibility

- `role="checkbox"` with `aria-checked` `"true"` / `"false"` / `"mixed"`, plus
  a `data-state` attribute (`checked` / `unchecked` / `indeterminate`) for
  styling.
- A native `<button type="button">`, so Space toggles it and it takes part in
  the tab order without a `tabIndex`; Enter is swallowed, as on a native
  checkbox.
- `data-disabled=""` while disabled, for styling alongside the real attribute.
- With `name`, resetting the surrounding `<form>` restores `defaultChecked`.
- Focus shows a 2px `$outlineColor` outline via `focusVisibleStyle`, so it only
  appears for keyboard focus.
- `disabled` sets the real attribute: the button leaves the tab order, stops
  firing clicks and dims to 50%.
- Give the checkbox an `id` and point a `Label htmlFor` at it; clicking the
  label then activates the button.
