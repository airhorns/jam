---
name: Label
group: Forms
description: "A real `<label>`: `htmlFor` gives you native click-to-focus and the control's accessible name."
---

# Label

Text that names a form control. Renders a real `<label>`, so `htmlFor` plus
the control's `id` gives you native click-to-focus and the correct
accessible name for free. Its line box is as tall as a control of the same
`size`, so a label sitting beside an `Input` lines up with it without manual
padding.

## Usage

```tsx
import { Label, Input, YStack, XStack, Checkbox } from "@jam/ui";

<YStack gap="$2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" placeholder="ada@example.com" />
</YStack>

<XStack gap="$3" alignItems="center">
  <Checkbox id="terms"><Checkbox.Indicator /></Checkbox>
  <Label htmlFor="terms">Accept the terms</Label>
</XStack>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `htmlFor` | `string` | — | `id` of the control this label names; rendered as the `for` attribute. |
| `size` | size token or number | `"$true"` | Font size, and a line box as tall as a control of that size. |
| `disabled` | `boolean` | `false` | 50% opacity and `cursor: not-allowed`, to match a disabled control. |
| `unstyled` | `boolean` | `false` | Drops the colour, sizing and layout defaults. |

Being a `SizableText`, it also takes `fontWeight`, `color`, `ellipsis`,
`textAlign` and the rest of the text props.

## Parts

None.

## Variants

- `size` — the font size comes from the font scale and the `line-height` from
  the *control* height at the same token, so `size="$4"` is 15px text on a 44px
  line box. Numbers work too (`size={32}`).
- `disabled` — visual only; it does not disable the control.
- `unstyled` — drops `$color`, the flex layout, `user-select: none` and the
  press colour.

The styled default is `display: flex` with `align-items: center`, so an icon
next to the label text is vertically centred.

## Theming

Reads `$color`, and `$colorPress` while pressed. The background is explicitly
transparent so a label inside a themed surface never paints its own box. There
is no `Label` component theme, so it takes the text colour of whatever theme
surrounds it.

## Accessibility

- `htmlFor` is the whole point: it associates the label with the control, gives
  the control its accessible name, and makes the label's hit area part of the
  control's. Without it, a label is just text.
- Wrapping the control in the label works too, but `htmlFor` is more robust
  with the button-based controls (`Checkbox`, `Switch`) where the real focus
  target is not an `input`.
- `user-select: none` stops a double click on the label selecting the text
  instead of activating the control.
- `disabled` on the label does not disable anything — set `disabled` on the
  control as well.
