---
name: Image
group: Content
description: "A styled `img`: every style prop works, plus `object-fit` under its CSS name and the React-Native `resizeMode` spelling."
---

# Image

A styled `img`. Everything the style system offers — `width`, `height`,
`borderRadius`, `aspectRatio`, `hoverStyle` — works on it, plus `object-fit`
under both its CSS name (`objectFit`) and the React-Native spelling
(`resizeMode`) so shared code reads the same on both platforms.

## Usage

```tsx
import { Image } from "@jam/ui";

<Image src="/hero.jpg" alt="A saguaro at dusk" width={320} height={180} borderRadius="$4" />

<Image src="/logo.svg" alt="Jam" height={40} resizeMode="contain" />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | — | Image URL. |
| `alt` | `string` | — | Text alternative; pass `""` for decorative images. |
| `width` / `height` | number or string | — | Layout size. Give at least one, or the image reflows the page as it loads. |
| `objectFit` | `"cover" \| "contain" \| "fill" \| "none" \| "scale-down"` | `"cover"` | How the pixels fit the box. |
| `resizeMode` | `"cover" \| "contain" \| "stretch" \| "center" \| "repeat"` | — | The React-Native spelling, mapped onto `object-fit`. |

## Parts

None.

## Variants

`resizeMode` maps onto real `object-fit` values:

| `resizeMode` | `object-fit` |
| --- | --- |
| `cover` | `cover` |
| `contain` | `contain` |
| `stretch` | `fill` |
| `center` | `none` |
| `repeat` | `none` plus `background-repeat: repeat` |

`objectFit` is a plain style prop, so it can be set per breakpoint
(`$sm={{ objectFit: "contain" }}`) and overrides `resizeMode` when both are
given later in the prop order.

The defaults are `display: block` (no baseline gap under the image),
`max-width: 100%` (never overflows its container) and `object-fit: cover`.

## Theming

Reads no theme keys. Add `backgroundColor="$background"` to show a placeholder
surface while the image loads, and `borderRadius` from the radius scale to
match the surrounding components.

## Accessibility

- `alt` is required for any image carrying information. An empty `alt=""`
  removes the image from the accessibility tree, which is correct for
  decoration.
- Set both `width` and `height` (or `aspectRatio`) so the layout does not shift
  when the image arrives.
- `object-fit: cover` crops. When the subject matters (a face, a chart), use
  `contain`, or add `objectPosition` to control which part survives the crop.
