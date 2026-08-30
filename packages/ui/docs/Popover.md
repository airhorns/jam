# Popover

Floating content anchored to a control: a small panel with a pointing arrow
that opens on click and closes on Escape, a press outside, or an explicit
close. Non-modal by default so the rest of the page stays interactive. Use
`Tooltip` for read-only hover labels, `Dialog` when the user must finish
something before continuing, and `Select` for choosing from a list.

## Usage

```tsx
import { Popover, Button, YStack, Paragraph } from "@jam/ui";

<Popover placement="bottom">
  <Popover.Trigger asChild>
    <Button>Dimensions</Button>
  </Popover.Trigger>
  <Popover.Content width={260}>
    <Popover.Arrow />
    <YStack gap="$3">
      <Paragraph>…</Paragraph>
      <Popover.Close asChild><Button size="$3">Done</Button></Popover.Close>
    </YStack>
  </Popover.Content>
</Popover>
```

Position against a wider element than the button that opens it:

```tsx
<Popover>
  <Popover.Anchor asChild>
    <XStack justifyContent="space-between">
      <SizableText>Notifications</SizableText>
      <Popover.Trigger size="$2">Configure</Popover.Trigger>
    </XStack>
  </Popover.Anchor>
  <Popover.Content>…</Popover.Content>
</Popover>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called for every open/close, including dismissals. |
| `placement` | `Placement` | `"bottom"` | Preferred side, optionally with `-start`/`-end` alignment. Flips to the opposite side when it would leave the viewport. |
| `offset` | `number` | `8` | Gap in px between the anchor and the content. |
| `modal` | `boolean` | `false` | Trap focus inside and lock body scroll while open. |
| `dismissOnEscape` | `boolean` | `true` | Close on Escape. |
| `dismissOnOutsidePress` | `boolean` | `true` | Close on pointerdown outside the content, trigger and anchor. |
| `dismissOnFocusOutside` | `boolean` | `!modal` | Close when keyboard focus lands outside the content, trigger and anchor (Tab past the last item). |
| `hoverable` | `boolean \| { delay?: number }` | `false` | Open while the pointer is over the trigger/anchor or content; `delay` (150ms) is the grace period for moving between them. Clicking the trigger keeps it open instead of toggling. |
| `disableFocus` | `boolean` | `hoverable` | Leave focus where it is when the popover opens. |

`Placement` is `"top" | "bottom" | "left" | "right"` or one of those suffixed
with `-start` / `-end`.

## Parts

- `Popover.Trigger` — a `Button` that toggles the popover; carries
  `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, `data-state`
  and `data-layer-trigger`. With `asChild` these merge onto the single child.
- `Popover.Anchor` — optional `YStack` (or its child with `asChild`) the
  content is positioned against instead of the trigger.
- `Popover.Content` — the panel, rendered in a portal only while open:
  `role="dialog"`, `tabIndex={-1}`, `data-placement` with the side actually
  used. A `YStack` sized by the `size` variant (`$true` → 18px padding, 9px
  radius) with `$background`, 1px `$borderColor` border and elevation. Slides
  in from the anchor's side (`enterStyle` opacity 0 plus a 6px offset) with
  `animation="quick"`. Its inline `style` holds the fixed position; anything
  you pass in `style` is merged over it.
- `Popover.Arrow` — an 8px square rotated 45° and clipped so only the half
  facing the anchor shows, with the same background and border as the
  content. It sits on the edge facing the anchor, at the anchor's centre.
  `size` changes the square's size.
- `Popover.Close` — a `Button` (or its child with `asChild`) that closes the
  popover after running your own `onClick`.

## Variants

`Popover.Content`: `size` (size token or number; sets padding and radius),
`elevate` (on by default), `elevation`, `bordered`, `unstyled`.

## Positioning

Content is measured after it renders and placed with `position: fixed`
(invisible until the first measurement). It repositions on scroll and
resize while open. The preferred side flips when the content would overflow
the viewport and the opposite side fits; the cross axis is then shifted to
stay 8px inside the viewport. The resolved placement is exposed on
`data-placement` for both the content and the arrow's outer box.

## Theming

Content and Arrow read `$background`, `$borderColor` and `$shadowColor`, so a
`theme` on the popover subtree recolours both together. There is no
component theme.

## Accessibility

- Trigger announces `aria-haspopup="dialog"` and its expanded state; while
  open, `aria-controls` points at the content's id. For a menu, pass
  `aria-haspopup="menu"` to the trigger and `role="menu"` (with an
  `aria-label`) to `Popover.Content`; both override the defaults.
- Opening moves focus to the first `[autofocus]` element, else the first
  focusable element, else the content; closing restores focus to the
  trigger. `hoverable` popovers (or `disableFocus`) leave focus on the
  trigger so a pointer pass doesn't steal it.
- Trigger opens on click, not on Enter/Space, so `Popover.Trigger asChild`
  around a non-button element (an `<input>`) needs its own key handler to be
  keyboard-openable; prefer a real button trigger next to the field.
- Escape closes the topmost open layer only, so a popover inside a dialog
  closes before the dialog does.
- Pass `modal` to trap Tab focus inside; by default focus can move out to
  the page (which also closes nothing — outside *presses* dismiss, focus
  changes don't).
