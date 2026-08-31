---
name: Progress
group: Feedback
description: A track whose Progress.Indicator fills to `value` out of `max`. With no value it sweeps as indeterminate.
---

# Progress

A horizontal bar showing how far along a task is. `Progress` is the rounded,
clipped track; `Progress.Indicator` is the filled part, and it reads the value
from the track through context, so there is nothing to pass down. Leave `value`
unset for an indeterminate bar and the indicator sweeps instead of filling.

## Usage

```tsx
import { Progress } from "@jam/ui";

<Progress value={60}>
  <Progress.Indicator />
</Progress>

<Progress value={3} max={8} size="$2">
  <Progress.Indicator />
</Progress>

<Progress>
  <Progress.Indicator />
</Progress>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `number \| null` | — | Progress so far, clamped to `0…max`. Unset (or `null`) is indeterminate. |
| `max` | `number` | `100` | The value that counts as complete. Anything that is not a positive number falls back to `100`. |
| `getValueLabel` | `(value, max) => string` | percentage | Builds `aria-valuetext` for a known value. |
| `size` | size token or number | `"$true"` | Track height (a quarter of the size token) and a sensible minimum width. |
| `unstyled` | `boolean` | `false` | Drops the height, radius, clipping and background. |

## Parts

`Progress.Indicator` — the filled bar. `height: 100%` and `width: 200%`,
positioned by `translateX` so an animating value that overshoots still covers
the track. It reads `value`/`max` from the `Progress` above it and needs no
props; every style prop still works if you want a custom fill. It carries the
same `data-state`, `data-value` and `data-max` as the track.

`Progress.Frame` — the styled track, for composing your own root.

## Variants

- `size` — height is 25% of the size token (so `$true` → 11px, `$2` → 7px) and
  `min-width` is twenty times the height, so a bar never collapses to nothing
  in a flex row. `width: 100%` by default; override it freely.
- `unstyled` on the frame or the indicator drops only that part's defaults.

Determinate progress translates the 200%-wide indicator by
`-100% + ratio × 50%`, so 0% shows nothing, 100% shows a full track. The
indeterminate case narrows the indicator to 40% and animates it across with an
injected `@keyframes` rule gated on `[data-state="indeterminate"]`. Its inline
transform parks that bar in the middle of the track, which is what shows when
animations are switched off.

## Theming

The track uses the `Progress` component theme (`light_Progress`, from the
`surface1` template) and the indicator asks for the `ProgressIndicator` theme
(`surface3`) by name, so the fill is several steps darker than the track
without either colour being hard-coded. Both read `$background`.
`theme="accent"` on the `Progress` recolours the pair together.

> The indicator sets `theme="ProgressIndicator"` explicitly because
> `resolveThemeName` does not currently find a component theme nested inside
> another component theme: from inside `light_Progress` it looks for
> `light_Progress_ProgressIndicator`, which is never built.

## Accessibility

- `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, and — when the
  value is known — `aria-valuenow` and an `aria-valuetext` percentage.
  `getValueLabel` replaces that percentage with your own wording, such as
  "3 of 8 files".
- `data-state` is `"loading"`, `"complete"` or `"indeterminate"`, and
  `data-value` / `data-max` mirror the numbers for styling and tests.
- An indeterminate bar deliberately omits `aria-valuenow`, which is how screen
  readers know the progress is unknown.
- A progress bar is not a label. Point `aria-labelledby` at the text describing
  the task, or give it an `aria-label`.
