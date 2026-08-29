# Toast

Brief notifications that appear in a corner of the viewport and dismiss
themselves. Two ways to use it: declaratively, rendering a `<Toast>` whose
`open` state you own, or imperatively through `toastController.show()`,
which stacks toasts inside a mounted `Toast.Viewport`. Use `AlertDialog` when
the user must acknowledge something; toasts are for status that can be
missed.

## Usage

Declarative — you decide when it shows and what it contains:

```tsx
import { Toast, Button, XStack, YStack } from "@jam/ui";

<Button onClick={() => setOpen(true)}>Save</Button>
<Toast open={open} onOpenChange={setOpen} duration={4000}>
  <XStack gap="$3" alignItems="flex-start">
    <YStack flex={1} gap="$1">
      <Toast.Title>Saved</Toast.Title>
      <Toast.Description>Your changes have been saved.</Toast.Description>
    </YStack>
    <Toast.Action altText="Undo the save" onClick={undo}>Undo</Toast.Action>
    <Toast.Close>✕</Toast.Close>
  </XStack>
</Toast>
```

Imperative — mount one viewport, then show toasts from anywhere:

```tsx
import { Toast, toastController } from "@jam/ui";

// Once, near the app root:
<Toast.Provider placement="top-right" duration={6000}>
  <App />
  <Toast.Viewport />
</Toast.Provider>

// Anywhere:
toastController.show("Deployed", { message: "v2.4.1 is live.", theme: "green" });
toastController.show("Payment failed", {
  theme: "red",
  duration: 8000,
  type: "foreground",
  action: { label: "Retry", onPress: retry },
});
```

## Props

`Toast`:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called when the toast closes itself, from `Toast.Close`, or from the timer. |
| `duration` | `number` | provider's `duration` | Auto-dismiss time in ms; `Infinity` keeps it until closed. |
| `type` | `"foreground" \| "background"` | `"background"` | `foreground` announces assertively. |
| `unstyled` | `boolean` | `false` | Drop the card styling. |

`Toast.Provider` (all optional, merged over the parent provider):

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `duration` | `number` | `5000` | Default auto-dismiss time. |
| `placement` | `ToastPlacement` | `"bottom-right"` | Corner toasts appear in. |
| `label` | `string` | `"Notifications"` | Accessible name of the viewport region. |

`ToastPlacement` is `"top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"`.

`toastController.show(title, options)` returns the toast's id; `options` is
`{ message?, duration?, theme?, type?, action?: { label, onPress } }`.
`toastController.hide(id)` and `hideAll()` remove toasts early.
`useToastController()` returns the same object; `useToastState()` returns the
most recently shown record for apps that render their own toast UI.

## Parts

- `Toast` — a `YStack` card with `role="status"`, `aria-live` (`polite`, or
  `assertive` for `foreground`), `aria-atomic`, `aria-labelledby` its title,
  `tabIndex={0}` and `data-state`. `$background` with a 1px `$borderColor`
  border, `$4` radius, `$4`/`$3` padding, `min(360px, calc(100vw - 36px))`
  wide, elevated with `$shadowColor`, focus ring in `$outlineColor`. Slides
  in 16px from its edge of the screen with `animation="quick"`. Rendered
  only while open. Outside a viewport it portals its own viewport frame at
  the provider's `placement`; inside `Toast.Viewport` it lays out inline with
  the imperative toasts.
- `Toast.Viewport` — a fixed `role="region"` (`aria-label` from `label`)
  pinned to a corner with `$4` padding and `$2` gap, `pointer-events: none`
  so the page stays clickable between toasts. Bottom placements stack upward
  (`column-reverse`). Renders every toast shown through `toastController`,
  then its own `children`. Props: `placement`, `label`.
- `Toast.Title` — `SizableText` at `$4`, weight 600, `$color`.
- `Toast.Description` — `SizableText` at `$2` in `$color11`.
- `Toast.Action` — a `size="$2"` `Button` (or its child with `asChild`) with
  `aria-label` set to the required `altText`, a plain-language description
  of what pressing it does.
- `Toast.Close` — a small circular chromeless `Button` (or its child with
  `asChild`) labelled "Close" that closes the toast after your own
  `onClick`.

Imperative toasts render `title` as `Toast.Title`, `message` as
`Toast.Description`, an `action` as `Toast.Action` (hiding the toast after
`onPress`) and a `Toast.Close`, inside a `theme` wrapper when one is given.

## Timing

Each open toast schedules a dismiss after `duration`. Hovering or focusing
the toast cancels the timer; leaving or blurring restarts it from the full
duration. Closing a toast clears its timer.

## Theming

The card reads `$background`, `$borderColor`, `$shadowColor` and
`$outlineColor`, the title `$color` and the description `$color11`. Pass
`theme="green"` (or any theme name) in imperative `options`, or wrap a
declarative `Toast` in a `Theme`, to recolour a single toast.

## Accessibility

- `role="status"` with `aria-live` lets screen readers announce toasts
  without moving focus; use `type="foreground"` only for things the user
  must hear immediately.
- Toasts are focusable so keyboard users can reach the action and close
  buttons; a focused toast will not auto-dismiss.
- `altText` on `Toast.Action` is required because the visible label
  ("Undo") has no context once announced on its own.
