# Square and Circle

Two fixed-size boxes that centre their contents. `Square` sets width and
height from one `size`; `Circle` is a `Square` with a fully rounded radius.
Useful for icon slots, colour swatches, badges and avatar placeholders.

## Usage

```tsx
import { Square, Circle, Text } from "@jam/ui";

<Square size="$6" backgroundColor="$blue9" borderRadius="$4">
  <Text color="white">4</Text>
</Square>

<Circle size="$4" backgroundColor="$green9" />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | size token or number | — | Width, height, `min-width`, `min-height`, `max-width` and `max-height` together. |
| `circular` | `boolean` | — | Fully rounded (already implied by `Circle`). |
| `bordered` | `boolean \| number` | — | 1px (or `n`px) `$borderColor` border. |
| `elevation` / `elevate` | size token / `boolean` | — | Themed drop shadow. |

Both are `ThemeableStack`s, so `hoverTheme`, `pressTheme`, `focusTheme`,
`backgrounded`, `radiused` and `padded` all work, as does the whole style prop
surface. Inline props beat variants, so a `borderRadius` of your own overrides
`circular` — pass one or the other.

## Parts

None. Contents are centred by `align-items: center` and
`justify-content: center` with `flex-direction: column`, so a single child (an
icon, a letter, a count) needs no extra wrapper.

## Variants

- `size` — spreads the size scale, so `"$4"`, `"4"` and `4` are all the `$4`
  token (44px by default) and `size={72}` is 72px. Every dimension is pinned,
  so the shape never stretches inside a flex row.
- `Circle` sets `border-radius: 100000px`, which stays a circle at any size
  without a percentage radius distorting under `overflow: hidden`.

## Theming

Neither reads a theme key by itself; they are transparent until you set
`backgroundColor` or opt into `backgrounded`/`bordered`/`elevate`. There is no
component theme, so `theme="blue"` on the shape (or an ancestor) recolours
`$background`, `$borderColor` and `$color` together.

## Accessibility

- Plain `div`s with no role. A shape used as a decorative swatch needs nothing;
  one that conveys information (a status dot) needs a text alternative — a
  `VisuallyHidden` label or `aria-label` with an explicit `role="img"`.
- `Circle` clips nothing by default; add `overflow="hidden"` when a child image
  should be cropped to the circle.
