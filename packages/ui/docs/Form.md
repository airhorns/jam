# Form

A real `<form>` that stacks its fields and calls your `onSubmit` instead of
reloading the page. `Form.Trigger` is the submit button, so Enter in a text
field submits natively — there is no keyboard wiring to do.

## Usage

```tsx
import { Form, Input, Label, YStack } from "@jam/ui";

<Form
  onSubmit={(event) => {
    const data = new FormData(event.target as HTMLFormElement);
    save({ email: String(data.get("email")) });
  }}
>
  <YStack gap="$2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" name="email" />
  </YStack>
  <Form.Trigger>Save</Form.Trigger>
</Form>
```

With your own button as the trigger:

```tsx
<Form.Trigger asChild>
  <Button theme="accent" iconAfter="→">Save</Button>
</Form.Trigger>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onSubmit` | `(event: Event) => void` | — | Called on submit with `preventDefault()` already applied. |
| `gap` | space token | `"$4"` | Space between fields; it is a `YStack` underneath. |

Every style prop works on the form itself, and any `form` attribute
(`action`, `method`, `noValidate`, `autoComplete`) passes straight through.

## Parts

`Form.Trigger` — a submit button. It is a `Button` with `type="submit"`, so
it takes the same `size`, `variant`, `theme`, `icon` and style props and wraps
its label the same way. With `asChild` it merges its classes and
`type="submit"` onto its child, so a fully custom `Button` submits the form
without a duplicate element in the DOM. The trigger must be inside the `Form`
for the browser to submit it.

`Form.Frame` — the styled `form`, for composing your own root.

## Variants

`Form` adds no variants of its own; it is a `Stack`, so `flexDirection`,
`gap`, `padding` and the shape variants (`bordered`, `elevate`) all apply.
`Form.Trigger` inherits every `Button` variant.

## Theming

Reads no theme keys — the form is transparent. `Form.Trigger` uses the
`Button` component theme (`light_Button`), so `theme="accent"` on the trigger
recolours just the button while `theme="accent"` on the form recolours every
control inside it.

## Accessibility

- A real `form` element, so submission, `required` validation, autofill and
  Enter-to-submit all behave natively. Nothing here reimplements them.
- Read values from `new FormData(event.target)` and give every field a `name`;
  that is also what the browser's autofill keys off.
- `Form.Trigger` renders a `<button type="submit">` and is therefore keyboard
  activatable with both Enter and Space. Never use a `div` with an `onClick` as
  a submit button.
- With `asChild`, check that the child is a real button — the `type="submit"`
  is merged onto whatever element the child renders.
- Prevent double submits by disabling the trigger while the request is in
  flight (`<Form.Trigger disabled={saving}>`); the form itself does not track
  that.
