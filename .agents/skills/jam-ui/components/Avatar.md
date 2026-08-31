---
name: Avatar
group: Content
description: A fixed-size frame that clips its image. The fallback sits behind, so it shows through whenever the image is missing.
---

# Avatar

A fixed-size frame that clips a profile image. The image covers the frame and
sits above a fallback layer, so initials or an icon show through whenever the
image is missing or still loading — no `onError` wiring of your own.

## Usage

```tsx
import { Avatar, Text } from "@jam/ui";

<Avatar size="$6" circular>
  <Avatar.Image src="/ada.jpg" alt="Ada Lovelace" />
  <Avatar.Fallback backgroundColor="$blue5">
    <Text>AL</Text>
  </Avatar.Fallback>
</Avatar>
```

A square avatar with a soft radius, and one with no image at all:

```tsx
<Avatar size="$5" borderRadius="$4">
  <Avatar.Image src={user.photo} alt={user.name} />
  <Avatar.Fallback backgroundColor="$gray5" />
</Avatar>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | size token or number | `"$true"` | Both dimensions of the frame. |
| `circular` | `boolean` | — | Fully rounded. |
| `bordered` | `boolean \| number` | — | 1px (or `n`px) `$borderColor` ring. |
| `unstyled` | `boolean` | `false` | Drops the size and background defaults. |

## Parts

`Avatar.Image` — an `img` filling the frame (`inset: 0`, `width`/`height`
100%, `object-fit: cover`, `z-index: 1`). Takes `src`, `alt` and every style
prop; `objectFit="contain"` if the image should not be cropped. A `src` that
fails to load is remembered under the component's id and the image switches to
`display: none`, so the browser's placeholder glyph never covers the fallback;
a later `src` paints again. Your own `onError` still runs.

`Avatar.Fallback` — a `Stack` behind the image (`inset: 0`, `z-index: 0`,
contents centred) using `$background` and `$color`. Because it is *behind*
rather than conditionally rendered, it is what you see until the image paints.
It accepts `delayMs` for API parity with tamagui and ignores it.

## Variants

- `size` comes from `Square`, so it pins width, height and both min/max
  dimensions — an avatar in a flex row never stretches.
- `unstyled` drops `size: "$true"` and `$background`, keeping the clipping and
  positioning that make the layering work.

The frame is `position: relative` with `overflow: hidden` and
`user-select: none`, so both layers are clipped to its radius.

## Theming

The frame and the fallback read `$background`; the fallback also reads `$color`
and `$body` for its text. There is no `Avatar` component theme, so
`theme="blue"` tints the fallback surface and its initials together.

## Accessibility

- Always give `Avatar.Image` an `alt`. Use `alt=""` when the avatar is
  decorative and the person's name is already in the adjacent text — otherwise
  screen readers announce the name twice.
- Fallback initials are real text, so they are announced. If the image has a
  meaningful `alt`, mark the fallback `aria-hidden="true"` to avoid the
  duplicate.
- The frame has no role and is not focusable; wrap it in a link or button when
  the avatar itself is clickable.
