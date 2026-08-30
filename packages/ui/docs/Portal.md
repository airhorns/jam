# Portal

Render children at the root of the mounted tree instead of in place, so
overlays escape any ancestor's `overflow: hidden`, `transform` or stacking
context. `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `Tooltip`, `Select`
and `Toast` all portal their floating content; reach for `Portal` directly
only when building a new overlay.

## Usage

```tsx
import { Portal, YStack } from "@jam/ui";

<Card overflow="hidden">
  <Paragraph>Clipped content…</Paragraph>
  {open && (
    <Portal>
      <YStack position="fixed" inset={0} zIndex={100_000}>…</YStack>
    </Portal>
  )}
</Card>
```

## Behaviour

- Children are appended to the **mount container** (the element passed to
  `mount`), after everything rendered in place, in the order the portals were
  encountered. They are not moved to `document.body`, so `container.contains`
  is still true and any CSS scoped to the container still applies.
- Context flows through: providers above the `Portal` in the component tree
  (theme, component contexts, `Toast.Provider`…) are visible inside it, and
  the portalled subtree keeps stable component ids derived from the portal's
  own position, so `useControllableState` and other per-component state
  survive re-renders.
- Nothing is rendered for the `Portal` itself; it has no element and takes
  no props other than `children`.
- Events bubble through the DOM, not the component tree, so a click inside
  portalled content does **not** reach `onClick` handlers on the component
  that rendered the portal. Overlays use `useDismissableLayer` with
  `data-layer`/`data-layer-trigger` attributes to decide what counts as
  "inside".

## Layering

Portalled content is positioned by its own styles, not by the portal.
Overlays in `@jam/ui` use `position: fixed` and `z-index: 100000`
(toast viewports `100001`) so they stack above app content; later portals
render after earlier ones and so paint on top at equal `z-index`.
