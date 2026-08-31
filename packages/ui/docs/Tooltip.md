# Tooltip

A short label that appears next to a control on hover or keyboard focus and
disappears when the pointer leaves, the control is pressed, or Escape is
pressed. Rendered as an inverted chip through the `Tooltip` component theme.
Tooltips are for supplementary text only — anything the user must act on
belongs in a `Popover`.

## Usage

```tsx
import { Tooltip, Button } from "@jam/ui";

<Tooltip placement="top">
  <Tooltip.Trigger asChild>
    <Button icon={<Info />} aria-label="More information" />
  </Tooltip.Trigger>
  <Tooltip.Content>
    <Tooltip.Arrow />
    Shows what the button does
  </Tooltip.Content>
</Tooltip>
```

Without `asChild` the trigger is a focusable inline `span`, so plain text can
carry a tooltip:

```tsx
<Tooltip delay={0}>
  <Tooltip.Trigger borderBottomWidth={1} borderBottomStyle="dotted">
    jargon
  </Tooltip.Trigger>
  <Tooltip.Content>A definition</Tooltip.Content>
</Tooltip>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called whenever hover, focus, press or Escape changes the state. |
| `placement` | `Placement` | `"top"` | Preferred side; flips when it would leave the viewport. |
| `offset` | `number` | `6` | Gap in px between trigger and content. |
| `delay` | `number` | `400` | Hover delay in ms before opening. Focus opens immediately; `0` opens on enter. |
| `skipDelayDuration` | `number` | `300` | Reopening any tooltip within this many ms of the last tooltip closing skips `delay`. There is no `Tooltip.Provider`; this pooling is global across every mounted `Tooltip`. |

## Parts

- `Tooltip.Trigger` — an inline-flex `span` with `tabIndex={0}`, or the
  single child with `asChild`. Carries `data-state`, `data-layer-trigger`
  and, while open, `aria-describedby` pointing at the content — appended to
  a caller-supplied `aria-describedby` rather than replacing it. Handles
  `pointerenter` (schedule open, ignoring touch pointers), `pointerleave` /
  `blur` (close) and `focus` (open now, unless a pointerdown on the trigger
  is what caused the focus — e.g. a mouse click) and `pointerdown` (close,
  and mark the trigger so the focus it causes doesn't reopen it).
- `Tooltip.Content` — the chip, rendered in a portal only while open:
  `role="tooltip"`, `pointerEvents: none`, `data-placement`. Extends
  `Popover.Content` with no border, centred items and a compact `size`
  variant: `$3` (the default) gives 13px horizontal / 7px vertical padding
  and a 7px radius. Bare text children are wrapped in `Tooltip.Text`;
  pass `textProps` to size or colour them or `noTextWrap` to opt out.
- `Tooltip.Arrow` — the same clipped rotated square as `Popover.Arrow`,
  without a border, filled with the chip's background.
- `Tooltip.Text` — `SizableText` at `size="$2"`, `$color`, centred.

## Variants

`Tooltip.Content`: `size` (size token or number), `unstyled`.

## Theming

Content uses the `Tooltip` component theme, which resolves to the
`accent` sub-theme of the current theme: dark chip on light pages, light
chip on dark pages. Wrapping a tooltip in `theme="blue"` etc. gives a
coloured chip. `Tooltip.Text` reads `$color` from that theme.

## Accessibility

- Content has `role="tooltip"` and the trigger references it with
  `aria-describedby` while open, so screen readers read the tooltip as the
  control's description.
- Keyboard users get the tooltip on focus with no delay; it closes on blur.
- Pressing the trigger closes the tooltip so it never covers what the press
  revealed.
- Escape closes an open tooltip without affecting other layers underneath
  it.
- Opening a tooltip closes any other tooltip that's currently open, so at
  most one is ever visible at a time.
- Because tooltip content is not interactive (`pointerEvents: none`), keep
  it to a phrase; put controls in a `Popover` instead.
