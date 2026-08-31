---
name: Card
group: Content
description: A surface with a header and footer that share its sizing. `elevate` adds the themed shadow, `bordered` the outline.
---

# Card

A surface that groups related content: a padded, rounded, optionally elevated
box with a header and footer that share its sizing. `Card` clips its children,
so an image or a `Card.Background` fills the rounded shape without spilling
past the corners.

## Usage

```tsx
import { Card, H4, Paragraph, Button, Image } from "@jam/ui";

<Card size="$4" bordered elevate width={280}>
  <Card.Header>
    <H4>Sonoran Desert</H4>
    <Paragraph>12 photos</Paragraph>
  </Card.Header>
  <Card.Footer>
    <Button size="$3">Open</Button>
  </Card.Footer>
  <Card.Background>
    <Image src="/desert.jpg" width="100%" height="100%" />
  </Card.Background>
</Card>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | size token or number | `"$true"` | Corner radius on the card, and the padding of its header and footer. Shared with the parts through context. |
| `bordered` | `boolean \| number` | — | 1px (or `n`px) `$borderColor` border. |
| `elevate` | `boolean` | — | The themed drop shadow for the card's size. |
| `elevation` | size token or number | — | An explicit shadow size. |
| `hoverTheme` / `pressTheme` | `boolean` | — | Wire the theme's hover/press background and border; `pressTheme` also sets `cursor: pointer`. |
| `padded` | `boolean` | — | Padding on the card itself rather than on the header. |
| `unstyled` | `boolean` | `false` | Drops the background, radius, `position: relative` and clipping. |

## Parts

`Card.Header` — the top block. A `YStack` padded from the card's `size`,
`z-index: 10`, transparent, with `margin-bottom: auto` so it sits at the top
even when the card is taller than its content.

`Card.Footer` — a padded row pinned to the bottom (`margin-top: auto`,
`flex-direction: row`, `align-items: center`, `z-index: 5`).

`Card.Background` — an absolutely positioned fill behind the content
(`inset: 0`, `z-index: 0`, `pointer-events: none`, `border-radius: inherit`),
so a background image picks up the card's rounded corners automatically.

`Card.Apply` — provides a `size` to every card part beneath it, for a card
whose frame you compose yourself.

## Variants

- `size` on the frame spreads the size scale onto the radius scale (`$4` → the
  `$4` radius); on the header and footer the same token is read from the space
  scale and becomes their padding, so the header's inset always matches the
  card's roundness.
- `unstyled` on the frame, header, footer and background each drop only that
  part's defaults.

The shared `size` travels through a styled context, so `<Card size="$5">`
needs no prop drilling to its header.

## Theming

Reads `$background` for the surface, `$borderColor` when `bordered`, and
`$shadowColor` for `elevate`/`elevation`. There is no `Card` component theme,
so `theme="accent"` on the card recolours the surface, the border and the text
inside it together.

## Accessibility

- A `div` with no role. A card that is entirely one link or button should have
  that control as its child rather than a click handler on the card.
- `overflow: hidden` clips a focus ring that would otherwise draw outside the
  card; give interactive children some inset (the header's padding is usually
  enough) so their focus outline stays visible.
- `Card.Background` is `pointer-events: none`, so it never swallows clicks
  meant for the content above it.
