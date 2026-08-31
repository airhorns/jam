# Slider

One or more thumbs on a track for picking a number, or a range, out of a
continuous span: volume, price, opacity. Press anywhere on the slider to move
the nearest thumb there and start dragging; the arrow, Page and Home/End keys
move the focused thumb by whole steps.

## Usage

```tsx
import { Slider } from "@jam/ui";

<Slider defaultValue={40} max={100} step={1}>
  <Slider.Track>
    <Slider.TrackActive />
  </Slider.Track>
  <Slider.Thumb aria-label="Volume" />
</Slider>
```

A range needs one `Thumb` per value, each with its `index`:

```tsx
<Slider defaultValue={[20, 60]} onValueChange={([lo, hi]) => setRange(lo, hi)}>
  <Slider.Track>
    <Slider.TrackActive />
  </Slider.Track>
  <Slider.Thumb index={0} aria-label="Minimum" />
  <Slider.Thumb index={1} aria-label="Maximum" />
</Slider>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `number \| number[]` | — | Controlled value; an array for a range. |
| `defaultValue` | `number \| number[]` | `min` | Initial value when uncontrolled. |
| `min` | `number` | `0` | Lowest value. |
| `max` | `number` | `100` | Highest value. |
| `step` | `number` | `1` | Granularity; fractional steps stay exact (`0.1` gives `0.2`, not `0.30000000000000004`). |
| `minStepsBetweenThumbs` | `number` | `0` | Number of steps that must separate two thumbs; a keyboard move that would close the gap is blocked. |
| `onValueChange` | `(value: number[]) => void` | — | Called on every change, always with an array. |
| `onSlideEnd` | `(value: number[]) => void` | — | Called once when a drag ends or a key finishes moving a thumb. |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | Vertical sliders run bottom to top. |
| `dir` | `"ltr" \| "rtl"` | `"ltr"` | Rendered as the `dir` attribute; `"rtl"` fills the track from the right and flips which arrow key increases the value. |
| `inverted` | `boolean` | `false` | Fills the track from the opposite edge (right, or top when vertical) and flips which arrow key increases the value. |
| `disabled` | `boolean` | `false` | Ignores pointer and keyboard input. |
| `size` | size token or number | `"$true"` | Knob diameter and rail thickness. |
| `name` | `string` | — | Submits with the owning form: one hidden input per value (`name[]` for a range), restored to `defaultValue` on form reset. |

`Slider.Thumb`: `index` (`0` unless it is a range), `size`, `unstyled`, plus
every style prop. `Slider.Track` and `Slider.TrackActive`: `size`, `unstyled`,
plus every style prop.

## Parts

`Slider.Track` — the rail. `overflow: hidden` so the fill is clipped to its
rounded ends.

`Slider.TrackActive` — the filled part: from the start of the rail to the only
thumb, or between the first and last thumbs of a range. Positioned in
percentages with an inline `style`, so it needs no measuring.

`Slider.Thumb` — a `<button role="slider">` carrying `aria-valuemin`,
`aria-valuemax`, `aria-valuenow` and `aria-orientation`. Offset by half a knob
so it stays inside the rail at both ends. Give each one an `aria-label`.

`Slider.Frame` — the styled container. `Slider.Apply` provides
`size`/`orientation` to every Slider beneath.

## Variants

- `size` — the size token drives everything: the knob is `round(token * 0.45)`
  and the rail `max(4, round(token / 6))`, so `$true` gives a 20px knob on a
  7px rail and `$6` a 29px knob on an 11px rail. The frame reserves the knob's
  height (or width) so nothing overflows its row.
- `orientation` — `row` with `width: 100%`, or `column` with a `$12` (144px)
  default height. Also flips which edge the fill and thumbs are positioned
  from (`left`/`width` vs `bottom`/`height`).
- `unstyled` — drops the rail fill, the knob's border and background, the
  cursors and the disabled styling; sizing and positioning stay.

## Theming

The `Slider` component theme is `surface1` (one step off the page background)
and the track inherits it, so the unfilled rail stays visible on a plain
surface. The fill is `$color10` and the knob `$background` with a `$color8`
border that goes `$color10` on hover — so the filled part reads as the
strongest thing on the track in both light and dark themes. `theme="blue"` on
the slider tints the rail and recolours the fill and the knob's hover border.

## Accessibility

- Each thumb is a real button with `role="slider"` and the three `aria-value*`
  attributes, so it is a tab stop and screen readers announce the value.
- Arrow keys move by one `step` (Left/Down decrease, Right/Up increase),
  Shift+Arrow and PageUp/PageDown by ten times that, Home and End jump to the
  focused thumb's own clamped `min`/`max`. Handled keys call `preventDefault`,
  everything else is left alone. `dir="rtl"` or `inverted` moves the start
  of the track to the other edge, so pointer, keys and the filled part all
  grow from there.
- In a range, each thumb is clamped between its neighbours (widened by
  `minStepsBetweenThumbs`), so the values can never cross or close the gap.
- `aria-disabled` is always present (`"false"` when enabled), and
  `data-disabled`/`data-orientation` are set on the frame, `Slider.Track`,
  `Slider.TrackActive` and every `Slider.Thumb`.
- `disabled` puts the `disabled` attribute on every thumb, dims the slider,
  and drops both pointer and keyboard handling.
- `touch-action: none` on the frame keeps a drag from scrolling the page.
- A `name` submits the value(s) with the owning form and restores the initial
  value when the form is reset, with or without `name` set.
