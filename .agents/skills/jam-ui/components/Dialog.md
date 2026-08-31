---
name: Dialog
group: Overlays
description: Modal dialog rendered in a portal with an overlay, focus trap, and Escape/overlay dismissal.
---

# Dialog

A window layered over the page that asks the user to complete a task or read
something before returning. Modal by default: focus is trapped inside, the
page behind stops scrolling, and Escape or a press on the overlay closes it.
Use `AlertDialog` when the user must make an explicit choice, `Sheet` for a
bottom drawer, and `Popover` for lightweight content anchored to a control.

## Usage

```tsx
import { Dialog, Button, XStack } from "@jam/ui";

<Dialog>
  <Dialog.Trigger asChild>
    <Button>Edit profile</Button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content width={420}>
      <Dialog.Title>Edit profile</Dialog.Title>
      <Dialog.Description>Make changes and save when you're done.</Dialog.Description>
      {/* form fields */}
      <XStack gap="$3" justifyContent="flex-end">
        <Dialog.Close asChild><Button variant="outlined">Cancel</Button></Dialog.Close>
        <Dialog.Close asChild><Button theme="accent">Save</Button></Dialog.Close>
      </XStack>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog>
```

Controlled:

```tsx
const [open, setOpen] = useControllableState<boolean>("open", { defaultValue: false });

<Dialog open={open} onOpenChange={setOpen}>…</Dialog>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when a trigger, close button, Escape or an outside press changes the state. |
| `modal` | `boolean` | `true` | Trap Tab focus in the content, lock body scroll and set `aria-modal`. |
| `dismissOnEscape` | `boolean` | `true` | Close on Escape. |
| `dismissOnOutsidePress` | `boolean` | `true` | Close on pointerdown outside the content (including on the overlay). |

The open state is stored in the fact database under the dialog's component id,
so it survives re-renders and is inspectable like any other fact.

## Parts

- `Dialog.Trigger` — a `Button` that toggles the dialog and carries
  `aria-haspopup="dialog"`, `aria-expanded`, `data-state` and, while open,
  `aria-controls`. With `asChild` those attributes and the click handler are
  merged onto the single child instead. Accepts every Button prop.
- `Dialog.Portal` — renders its children at the document root while the dialog
  is open (`forceMount` keeps them mounted). Its frame is a fixed, fullscreen,
  flex-centred layer with `pointerEvents: none` so only the overlay and
  content receive input.
- `Dialog.Overlay` — fixed fullscreen backdrop in `$shadow6`, fades in.
- `Dialog.Content` — the window itself: `role="dialog"`, `aria-modal`,
  `tabIndex={-1}`, and `aria-labelledby`/`aria-describedby` pointing at a
  Title/Description when one is rendered (a caller's `aria-describedby` is
  kept alongside). A `YStack` with `$background`, 1px `$borderColor` border,
  `$true` padding and radius, `$4` gap, elevation, `maxWidth: min(90vw, 560px)`,
  `maxHeight: 85vh` and scrolling overflow. Animates in from
  `enterStyle={{ opacity: 0, scale: 0.96, y: 10 }}` with `animation="quick"`.
  Supports `elevate`, `elevation`, `bordered`, `fullscreen` and `unstyled`.
- `Dialog.Title` — an `H2` with the id Content's `aria-labelledby` points to.
- `Dialog.Description` — a `Paragraph` with the id `aria-describedby` points to.
- `Dialog.Close` — a `Button` (or, with `asChild`, its child) that closes the
  dialog. Compose your own `onClick` freely; it runs before closing.

All parts accept style props; `Content`, `Overlay` and `Portal` accept
`unstyled` to drop their defaults.

## Variants

`Dialog.Content`: `elevate` (on by default), `elevation="$4"`, `bordered`,
`fullscreen`, `unstyled`.

## Theming

Content reads `$background`, `$borderColor` and `$shadowColor`; Overlay reads
`$shadow6`; Title and Description inherit `$color` through the heading and
paragraph styles. There is no component theme, so `theme="…"` on the Dialog
subtree (or on `Content`) recolours everything inside — `theme="accent"`
makes a filled, inverted dialog.

## Accessibility

- Content has `role="dialog"` (`alertdialog` for AlertDialog) and, when
  modal, `aria-modal="true"`.
- Opening moves focus to the first `[autofocus]` element, else the first
  focusable element, else the content; closing returns focus to the element
  that was focused before, typically the trigger.
- While modal, Tab and Shift+Tab cycle inside the content and body scroll is
  locked; the scrollbar's width is kept as body padding so the page doesn't
  shift when it disappears.
- Escape closes the topmost open layer only, so nested overlays close one at a
  time.
