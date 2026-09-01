---
name: Input
group: Forms
description: Single-line Input and multi-line TextArea. One `size` sets height, radius, padding and font size together.
---

# Input and TextArea

Text fields. `Input` is a single-line `<input>`, `TextArea` a multi-line
`<textarea>` with the same styling. One `size` prop sets height, corner
radius, horizontal padding and font size together, so a field always matches a
`Button` of the same size. `onChangeText` gives you the value directly without
digging into the event.

## Usage

```tsx
import { Input, TextArea, Label, YStack } from "@jam/ui";

<YStack gap="$2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" size="$4" placeholder="ada@example.com" onChangeText={setEmail} />
</YStack>

<TextArea rows={5} placeholder="What changed?" onChangeText={setBody} />
```

Sizes, and a field with no chrome of its own:

```tsx
<Input size="$2" placeholder="Small" />
<Input size="$6" placeholder="Large" />
<Input unstyled placeholder="Borderless" paddingHorizontal="$3" />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | size token or number | `"$true"` | Height, radius, horizontal padding and font size. |
| `value` | `string` | — | Set as a DOM property, so a controlled field works. |
| `defaultValue` | `string` | — | Initial value for an uncontrolled field; a `TextArea` renders it as its text content, which is where a textarea's default lives. |
| `placeholder` | `string` | — | Styled with `$placeholderColor`. |
| `onChangeText` | `(text: string) => void` | — | Called with the new value on every edit. |
| `onInput` | `(event: Event) => void` | — | The raw event; fires alongside `onChangeText`. |
| `disabled` | `boolean` | `false` | Real attribute plus `disabledStyle`. |
| `readOnly` | `boolean` | `false` | Real attribute (`readonly`). |
| `type` | `string` | — | `"email"`, `"password"`, `"search"` and so on. |
| `unstyled` | `boolean` | `false` | Drops the border, background and sizing. |
| `rows` | `number` | `3` | TextArea only: how many lines of minimum height. |

## Parts

`Input.Frame` / `TextArea.Frame` — the styled element, for building your own
wrapper. The exported components are thin function wrappers that add
`onChangeText`; they carry the frame's `staticConfig`, so
`styled(Input, {...})` still extends it.

## Variants

- `size` on `Input` — `getFontSized` for the text plus `getButtonSized` for
  the height and radius, and horizontal padding from one space step below the
  size token. `$true` is a 44px field with a 9px radius, 16px side padding and
  15px text.
- `size` on `TextArea` — the same, but `height: auto` with a `min-height` of
  `rows × line-height`, and vertical padding from two space steps below the
  token. `rows={5}` at `$true` is a 115px minimum.
- `unstyled` — `border-width: 0`, `outline-style: none`,
  `background-color: transparent` and no sizing at all, for a field that
  inherits its container's look.

The styled defaults include `hoverStyle` (`$borderColorHover`), `focusStyle`
(`$borderColorFocus` plus a 2px `$outlineColor` outline inset by 1px),
`placeholderStyle` (`$placeholderColor`) and `disabledStyle` (50% opacity,
`cursor: not-allowed`). `min-width: 0` keeps the field from overflowing a flex
row, and `Stack`'s `align-items: stretch` makes it fill a column without a
hard-coded width.

## Theming

Uses the `Input` component theme (`light_Input` / `dark_Input`, built from the
`surface1` template) and `TextArea` uses `light_TextArea`, so a field is a step
away from the page background without any explicit colour. It reads
`$background`, `$color`, `$borderColor`, `$borderColorHover`,
`$borderColorFocus`, `$outlineColor`, `$placeholderColor` and `$body`.
`theme="accent"` on the field or an ancestor recolours all of them.

## Accessibility

- Name every field: a `Label htmlFor` pointing at the field's `id` is the
  default; `aria-label` when there is genuinely no visible label. A
  `placeholder` is not a label — it disappears as soon as typing starts.
- Focus is visible as a 2px `$outlineColor` outline (`focusStyle`, not
  `focusVisibleStyle`, because a text field's focus should show for mouse users
  too).
- `disabled` sets the real attribute, so the field leaves the tab order.
  `readOnly` keeps it focusable and copyable, which is usually what you want
  for a value the user may need to read.
- `TextArea` grows only to `min-height`; the browser's native resize handle
  still works unless you set `resize: none`.
