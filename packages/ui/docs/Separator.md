# Separator

A hairline divider between sections or list items. Drawn with a border rather
than a background so it always lands on one device pixel and stays crisp on
high-DPI screens. Horizontal by default; `vertical` turns it into a rule that
stretches to the height of its row.

## Usage

```tsx
import { Separator, YStack, XStack, Text } from "@jam/ui";

<YStack gap="$3">
  <Text>Account</Text>
  <Separator />
  <Text>Billing</Text>
</YStack>

<XStack gap="$3" height={40} alignItems="center">
  <Text>Draft</Text>
  <Separator vertical />
  <Text>Published</Text>
</XStack>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `vertical` | `boolean` | `false` | Draws a vertical rule instead of a horizontal one. |
| `unstyled` | `boolean` | `false` | Drops the border, sizing and margins. |

Style props work as usual: `borderColor`, `borderBottomWidth`, `margin`,
`alignSelf` and `flexGrow` all override the defaults.

## Parts

None.

## Variants

- `unstyled` — the styled default is `border-width: 0` with a 1px
  `border-bottom`, `height: 0`, `max-height: 0`, `flex-grow: 1`,
  `flex-shrink: 0`, `align-self: stretch` and `margin: 0`.
- `vertical` — swaps to a 1px `border-right` with `width: 0` and
  `max-width: 0`, and restores `height` to `initial` so it stretches.

Because both dimensions are pinned to zero on the drawn axis, the border is
the whole visible size; give the separator `alignSelf`/`margin` rather than
padding.

## Theming

Reads `$borderColor`. Override with `borderColor="$borderColorHover"` or any
colour token. There is no `Separator` component theme, so it takes the colour
of whatever theme surrounds it.

## Accessibility

- Renders a `div` with no role, which is the right default for a decorative
  rule.
- When the divider carries meaning (splitting a menu into groups), add
  `role="separator"` and, for a vertical one, `aria-orientation="vertical"`.
- A separator inside a `Group` is laid out between items automatically via the
  group's `separator` prop.
