---
name: Spinner
group: Feedback
description: An indeterminate loading ring. `size` takes "small", "large" or a size token; `color` tints the leading arc.
---

# Spinner

An indeterminate loading ring: a circular border with one tinted arc, spinning
at a constant rate. Use it while waiting for something whose progress you
cannot measure; use `Progress` when you know how far along you are.

## Usage

```tsx
import { Spinner, Button, XStack, Text } from "@jam/ui";

<Spinner />
<Spinner size="large" color="$blue9" />

<XStack gap="$2" alignItems="center">
  <Spinner size="small" />
  <Text>Loading…</Text>
</XStack>
```

Inside a button while a request is in flight:

```tsx
<Button disabled={saving} icon={saving ? <Spinner size="small" /> : undefined}>
  Save
</Button>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `"small" \| "large"` \| size token \| number | `"small"` | Diameter, and a ring thickness scaled from it. |
| `color` | colour token or CSS colour | — | Tints the leading arc; defaults to `$color`. |

Style props apply to the ring itself, so `borderColor` changes the track and
`margin`/`opacity` behave as usual.

## Parts

`Spinner.Frame` — the styled ring, for composing your own wrapper. The
exported `Spinner` is a thin function wrapper that injects the keyframes; it
carries the frame's `staticConfig`, so `styled(Spinner, {...})` still extends
it.

## Variants

- `size` — `"small"` is 20px and `"large"` is 36px (matching tamagui). Size
  tokens work too (`size="$6"` → 64px) as do plain numbers. The border is
  `diameter / 12`, at least 2px, so the ring stays proportional at every size.
- `color` — sets only `border-top-color`, so the track keeps `$borderColor` and
  the arc reads as motion rather than a solid ring.

The rotation is a `@keyframes` rule plus an `animation` shorthand, neither of
which can come from a style prop, so both are injected once as a keyed CSS rule
and matched by a doubled `.is_Spinner.is_Spinner` selector that outranks the
atomic classes. Rendering many spinners injects the rule once.

## Theming

Reads `$borderColor` for the track and `$color` for the arc. There is no
`Spinner` component theme, so a spinner inside `theme="accent"` picks up the
accent colours automatically.

## Accessibility

- `role="progressbar"` with `aria-busy="true"` and a default
  `aria-label="Loading"`. Override the label when you can say what is loading
  (`aria-label="Loading messages"`).
- It reports no value, which is correct for indeterminate progress — a screen
  reader announces "busy" rather than a bogus percentage.
- Do not rely on the spinner alone for a long wait; pair it with text so the
  state is readable when animations are off.
- The animation ignores `prefers-reduced-motion`. In a motion-sensitive context
  render text or a `Progress` bar instead.
