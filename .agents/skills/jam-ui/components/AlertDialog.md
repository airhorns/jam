---
name: AlertDialog
group: Overlays
description: A modal that interrupts the user and requires an explicit response; not dismissed by clicking outside.
---

# AlertDialog

A modal that interrupts the user and waits for an explicit decision — confirm
a destructive action, acknowledge an error. It is a `Dialog` with
`role="alertdialog"` that ignores presses outside the content; the user has
to choose Cancel or Action (Escape still cancels).

## Usage

```tsx
import { AlertDialog, Button, XStack } from "@jam/ui";

<AlertDialog>
  <AlertDialog.Trigger asChild>
    <Button theme="red">Delete account</Button>
  </AlertDialog.Trigger>
  <AlertDialog.Portal>
    <AlertDialog.Overlay />
    <AlertDialog.Content>
      <AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
      <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
      <XStack gap="$3" justifyContent="flex-end">
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action onClick={deleteAccount}>Yes, delete</AlertDialog.Action>
      </XStack>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog>
```

## Props

Same as [Dialog](./Dialog.md): `open`, `defaultOpen`, `onOpenChange`,
`modal` (default `true`), `dismissOnEscape` (default `true`) and
`dismissOnOutsidePress`, which defaults to `false` here.

## Parts

`Trigger`, `Portal`, `Overlay`, `Content`, `Title` and `Description` are the
Dialog parts. Two closers replace `Dialog.Close`:

- `AlertDialog.Cancel` — an outlined `Button` that closes the dialog.
- `AlertDialog.Action` — an accent `Button` that runs your `onClick` and then
  closes the dialog.

Both accept `asChild` to merge the behaviour onto your own element; the default
button styling is not applied in that case.

## Theming

As Dialog. Pass `theme="red"` to the Action (or its child) for a destructive
affordance.

## Accessibility

Content has `role="alertdialog"` and `aria-modal="true"`; the dialog is always
modal. Focus moves to the Cancel button on open (an `autofocus` element inside
the content wins) and returns to the trigger on close. Outside presses are
ignored; Escape behaves like Cancel.
