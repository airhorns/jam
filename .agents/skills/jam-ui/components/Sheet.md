---
name: Sheet
group: Overlays
description: Bottom drawer that slides up over the page and rests at snap points; drag the handle to move or dismiss it.
---

# Sheet

A bottom drawer that slides up over the page and rests at one of several
snap points. Drag the handle to move between them or past the smallest to
dismiss. Modal by default: focus is trapped, body scroll is locked, and a
dimmed overlay sits behind. Use `Dialog` for centred modal content and
`Popover` for small anchored panels.

## Usage

```tsx
import { Sheet, Button, H4, Paragraph } from "@jam/ui";

<Button onClick={() => setOpen(true)}>Open</Button>
<Sheet open={open} onOpenChange={setOpen} snapPoints={[85, 50]}>
  <Sheet.Overlay />
  <Sheet.Handle />
  <Sheet.Frame padding="$4" gap="$3">
    <H4>Details</H4>
    <Sheet.ScrollView>
      <Paragraph>…</Paragraph>
    </Sheet.ScrollView>
    <Button onClick={() => setOpen(false)}>Done</Button>
  </Sheet.Frame>
</Sheet>
```

Control which snap point the sheet rests at:

```tsx
<Sheet open={open} onOpenChange={setOpen} snapPoints={[85, 50]} position={position} onPositionChange={setPosition}>
  …
</Sheet>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called for every open/close, including drag-to-dismiss. |
| `modal` | `boolean` | `true` | Trap Tab focus inside and lock body scroll while open. |
| `snapPoints` | `number[]` | `[80]` | Heights the sheet can rest at, as viewport percentages, largest first. |
| `position` | `number` | — | Controlled index into `snapPoints`. |
| `defaultPosition` | `number` | `0` | Initial index when uncontrolled. |
| `onPositionChange` | `(position: number) => void` | — | Called when a drag settles on a different snap point. |
| `dismissOnSnapToBottom` | `boolean` | `true` | Dragging below the smallest snap point closes the sheet. |
| `dismissOnOverlayPress` | `boolean` | `true` | Close on pointerdown outside the sheet (the overlay or the page). |
| `dismissOnEscape` | `boolean` | `true` | Close on Escape. |

Remaining props go to the positioner (the `role="dialog"` element).

## Parts

- `Sheet` — renders nothing while closed. While open it portals a
  full-viewport frame (`position: fixed; inset: 0; pointer-events: none;
  z-index: 100000`) holding any `Sheet.Overlay` children followed by the
  positioner: a `YStack` pinned to the bottom edge with `role="dialog"`,
  `aria-modal`, `data-state`, `data-position` (the current snap index) and
  `tabIndex={-1}`, whose inline `height` is the current snap point. Slides
  up from below (`enterStyle` `y: "100%"`) with `animation="medium"`, and
  animates between snap points.
- `Sheet.Overlay` — an `aria-hidden` `$shadow6` scrim behind the positioner
  that fades in. It is picked out of the children by type, so it can be
  written before or after the frame.
- `Sheet.Handle` — an 8px-tall, 30%-wide (max 120px) pill above the frame in
  `$background` at 50% opacity (70% on hover, 100% while pressed) with a grab
  cursor and `touch-action: none`. Pointer-drag it to move the sheet.
- `Sheet.Frame` — the panel: `flex: 1`, `$background`, `$6` (16px) top
  radii, `overflow: hidden`, elevated with an upward `$shadowColor` shadow.
  Give it your padding and gap.
- `Sheet.ScrollView` — a `flex: 1; min-height: 0; overflow: auto` region for
  content longer than the frame.

## Dragging

While the handle is dragged the positioner follows the pointer via an inline
`translateY` (with `transition: none`), clamped between the largest snap
point and fully off-screen. On release it snaps to whichever of
`snapPoints` (plus 0 when `dismissOnSnapToBottom`) is nearest the dragged
height; landing on 0 calls `onOpenChange(false)`, anything else
`onPositionChange`. Only the primary button drags.

## Theming

Frame and Handle read `$background`; the overlay reads `$shadow6` and the
frame's shadow `$shadowColor`. There is no component theme.

## Accessibility

- The positioner is a `role="dialog"` with `aria-modal="true"` while modal.
  Add `aria-labelledby`/`aria-describedby` yourself pointing at your heading
  and text.
- Opening moves focus to the first `[autofocus]` element, else the first
  focusable element, else the dialog; closing restores focus to whatever had
  it before.
- Escape closes the topmost open layer only; Tab is trapped inside while
  `modal`.
- The handle is `aria-hidden` and pointer-only — keep a button in the frame
  to close the sheet without dragging.
