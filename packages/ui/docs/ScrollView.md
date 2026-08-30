# ScrollView

A scrolling viewport. Vertical by default: content overflows downward and
scrolls, while the cross axis is clipped so a wide child can never produce a
second scrollbar. `horizontal` swaps both, and lays children out in a row.

## Usage

```tsx
import { ScrollView, YStack, ListItem } from "@jam/ui";

<ScrollView maxHeight={240} padding="$3" gap="$2">
  {items.map((item) => (
    <ListItem title={item.name} />
  ))}
</ScrollView>
```

A horizontal strip with no visible scrollbar:

```tsx
<ScrollView horizontal showsScrollIndicator={false} gap="$3" paddingVertical="$2">
  <Square size="$6" /> <Square size="$6" /> <Square size="$6" />
</ScrollView>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `horizontal` | `boolean` | `false` | Scrolls along x and lays children out in a row. |
| `showsScrollIndicator` | `boolean` | `true` | `false` hides the scrollbar (`scrollbar-width: none`) without disabling scrolling. |
| `unstyled` | `boolean` | `false` | Drops the overflow and direction defaults. |

A ScrollView needs a bound on the scrolling axis to scroll at all: give it
`maxHeight`/`height` (or `flex={1}` inside a bounded parent) for the vertical
case, and `maxWidth`/`width` for the horizontal one.

## Parts

None — it is a single styled `Stack`, so `gap`, `padding` and `alignItems`
apply directly to its children.

## Variants

- `unstyled` — the styled default is `flex-direction: column` with
  `overflow-y: auto` and `overflow-x: hidden`.
- `horizontal` — `flex-direction: row`, `overflow-x: auto`,
  `overflow-y: hidden`.
- `showsScrollIndicator` — only the `false` case emits anything.

## Theming

Reads no theme keys; it is transparent. Add `backgroundColor="$background"` if
the scroller needs its own surface.

## Accessibility

- A scrollable `div` with no `tabIndex` is not keyboard-scrollable in every
  browser. Add `tabIndex={0}` (and a label) when the region scrolls
  independently, so keyboard users can reach it.
- Hiding the scroll indicator removes the only affordance that the region
  scrolls — keep it visible unless the content obviously continues past the
  edge.
