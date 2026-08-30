# Stacks

`Stack`, `XStack`, `YStack`, `ZStack` and `ThemeableStack` are the layout
primitives everything else is built from. `Stack` is a `div` reset to a
flexbox — `display: flex`, `flex-direction: column`, `align-items: stretch`,
`box-sizing: border-box`, `min-width: 0`, `min-height: 0` — so it never
inherits browser text metrics and never overflows its parent. `XStack` and
`YStack` only pin the direction; `ZStack` layers its children on top of one
another; `ThemeableStack` adds the theme-reactive variants that `Card`,
`ListItem`, `Square` and friends extend.

## Usage

```tsx
import { XStack, YStack, ZStack, Stack } from "@jam/ui";

<YStack gap="$3" padding="$4">
  <XStack gap="$2" alignItems="center" justifyContent="space-between">
    <Stack flexGrow={1} />
  </XStack>
</YStack>
```

Layering, with the bottom child underneath:

```tsx
<ZStack width={120} height={120}>
  <Square size="$6" backgroundColor="$blue5" />
  <Square size="$4" backgroundColor="$blue9" top={20} left={20} position="absolute" />
</ZStack>
```

## Props

Every stack takes the full style prop surface (see `docs/STYLE-SYSTEM.md`)
plus `tag` to change the element it renders.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `fullscreen` | `boolean` | — | `position: absolute` filling its container. |
| `elevation` | size token or number | — | Drop shadow scaled from the token, using `$shadowColor`. |
| `elevate` | `boolean` | — | The default elevation for the stack's `size`. |
| `bordered` | `boolean \| number` | — | 1px (or `n`px) `$borderColor` border. |
| `transparent` | `boolean` | — | `background-color: transparent`. |
| `chromeless` | `boolean \| "all"` | — | Drops background and border; `"all"` also drops hover/press styling. |
| `circular` | `boolean` | — | Fully rounded. |

`ThemeableStack` adds `backgrounded`, `radiused`, `padded`, `hoverTheme`,
`pressTheme` and `focusTheme`.

## Parts

There are no subcomponents. `ZStack` wraps each child in an internal
absolutely-positioned fill layer that is transparent to the pointer, so lower
layers stay clickable while the layer contents keep their own hit testing.

## Variants

- The shape variants above are shared by all stacks, so `<XStack bordered
  elevate>` works exactly like `<Card bordered elevate>`.
- `ThemeableStack`'s `hoverTheme` / `pressTheme` / `focusTheme` wire
  `$backgroundHover` / `$backgroundPress` / `$backgroundFocus` and the matching
  border colours; `pressTheme` also sets `cursor: pointer`.

## Theming

Stacks read no theme keys of their own until you opt in: `bordered` reads
`$borderColor`, `elevation`/`elevate` read `$shadowColor`, `backgrounded` reads
`$background`, and the `*Theme` variants read the hover/press/focus keys. There
is no `Stack` component theme, so `theme="accent"` on a stack recolours it and
everything beneath.

## Accessibility

- A plain `div`, so it adds no semantics. Use `tag` (`"ul"`, `"nav"`,
  `"section"`) or `role` when the grouping is meaningful.
- `ZStack` layers are pointer-transparent, so a visually-covered child stays
  reachable only if it is actually on top — order children back-to-front.
