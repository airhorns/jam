# Spacer

A gap between siblings, sized from the space scale. Prefer `gap` on the parent
stack when every gap is the same; reach for `Spacer` when one gap differs, or
when you want a flexible gap that pushes the rest of the row to the far edge.

## Usage

```tsx
import { Spacer, XStack, Button } from "@jam/ui";

<XStack alignItems="center">
  <Button>Back</Button>
  <Spacer flex={1} />
  <Button>Cancel</Button>
  <Spacer size="$2" direction="horizontal" />
  <Button>Save</Button>
</XStack>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | space token or number | `"$true"` | Both dimensions of the gap. `"$2"`, `2` and `7` all resolve through the space scale; a number is used as pixels. |
| `direction` | `"horizontal" \| "vertical" \| "both"` | `"both"` | Collapses the unused axis, so a horizontal spacer only takes width. |
| `flex` | `number` | — | Grows to fill the remaining room; the value is the `flex-grow` factor (`0` also pins `flex-shrink: 0`). `flex` as a bare boolean works at runtime for parity with tamagui, but the style system already types `flex` as numeric, so write `flex={1}`. |

Also takes the usual style props, so `<Spacer size="$4" backgroundColor="$red9" />`
is a quick way to see where it lands.

## Parts

None.

## Variants

- `size` spreads the space scale (`"...space"`) and accepts bare numbers, so
  `size="$6"` is 32px with the default tokens and `size={12}` is 12px. Negative
  space tokens (`"$-2"`) pull siblings together.
- `direction` — `horizontal` zeroes height, `vertical` zeroes width, `both`
  leaves the box square.
- `flex` — useful together with `size`: a flexible spacer keeps `size` as its
  minimum.

## Theming

Reads no theme keys. It is a transparent `span` with `pointer-events: none`, so
it never intercepts clicks or shows a background.

## Accessibility

Purely presentational and empty, so it contributes nothing to the
accessibility tree. Do not use it to separate content that needs a semantic
break — use `Separator` for that.
