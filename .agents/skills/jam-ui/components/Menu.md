---
name: Menu
group: Overlays
description: A dropdown menu of actions with keyboard navigation, typeahead, checkbox and radio items.
---

# Menu

A dropdown menu of actions opened from a button: the APG menu button pattern
with the keyboard, typeahead and pointer behaviour of Radix's `DropdownMenu`.
Items run a command and close the menu; checkbox and radio items toggle
settings. Use `Select` when the user is picking a value for a field, `Popover`
for arbitrary content, and `ToggleGroup` for an always-visible set of options.

## Usage

```tsx
import { Menu, Button } from "@jam/ui";

<Menu>
  <Menu.Trigger asChild>
    <Button>Options</Button>
  </Menu.Trigger>
  <Menu.Content>
    <Menu.Item onSelect={() => rename()}>Rename</Menu.Item>
    <Menu.Item onSelect={() => duplicate()}>Duplicate</Menu.Item>
    <Menu.Separator />
    <Menu.Item disabled>Share</Menu.Item>
    <Menu.Item theme="red" onSelect={() => remove()}>Delete</Menu.Item>
  </Menu.Content>
</Menu>
```

Checkbox and radio items with indicators:

```tsx
<Menu.Content>
  <Menu.Group>
    <Menu.Label>View</Menu.Label>
    <Menu.CheckboxItem checked={showDone} onCheckedChange={setShowDone}>
      <Menu.ItemIndicator />
      Show completed
    </Menu.CheckboxItem>
  </Menu.Group>
  <Menu.Separator />
  <Menu.RadioGroup value={sort} onValueChange={setSort}>
    <Menu.Label>Sort by</Menu.Label>
    <Menu.RadioItem value="created"><Menu.ItemIndicator />Created</Menu.RadioItem>
    <Menu.RadioItem value="modified"><Menu.ItemIndicator />Modified</Menu.RadioItem>
  </Menu.RadioGroup>
</Menu.Content>
```

Keep the menu open after a selection by preventing the select event:

```tsx
<Menu.CheckboxItem checked={value} onCheckedChange={set} onSelect={(e) => e.preventDefault()}>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called for every open/close, including dismissals and selections. |
| `placement` | `Placement` | `"bottom-start"` | Preferred side and alignment; flips when it would leave the viewport. |
| `offset` | `number` | `4` | Gap in px between the trigger and the content. |
| `modal` | `boolean` | `false` | Trap Tab focus inside and lock body scroll while open. |
| `loop` | `boolean` | `false` | Arrow keys wrap from the last item to the first and back. |
| `dir` | `"ltr" \| "rtl"` | `"ltr"` | Reading direction, rendered as the `dir` attribute on the content. |

## Parts

- `Menu.Trigger` — a `Button` (or its child with `asChild`) carrying
  `aria-haspopup="menu"`, `aria-expanded`, `data-state` and, while open,
  `aria-controls`. Opens on primary-button pointerdown (the press is
  `preventDefault`ed so the menu can take focus) and on Enter, Space or
  ArrowDown (focusing the first item) or ArrowUp (focusing the last). With
  `asChild` on one of your own components, that component must spread the
  props it receives onto its element or the trigger does nothing (see
  `Slot.md`).
- `Menu.Content` — the list, rendered in a portal only while open:
  `role="menu"`, `aria-orientation="vertical"`, `aria-labelledby` the trigger,
  `tabIndex={-1}`, `data-placement`. A `YStack` with `$background`, a 1px
  `$borderColor` border, `$4` radius, elevation and `$1` padding, capped at
  `min(480px, 100vh - 16px)` tall and scrolling beyond that.
- `Menu.Item` — `role="menuitem"`, `tabIndex={-1}`, `disabled` →
  `aria-disabled` and `data-disabled=""`. `onSelect(event)` receives a
  cancelable `menu.itemSelect` `CustomEvent`; the menu closes unless
  `preventDefault()` was called. `textValue` overrides the text used for
  typeahead when the visible label isn't plain text.
- `Menu.CheckboxItem` — `role="menuitemcheckbox"` with `checked`
  (`boolean | "indeterminate"`), `onCheckedChange`, `aria-checked`
  (`"mixed"` for indeterminate) and `data-state`.
- `Menu.RadioGroup` / `Menu.RadioItem` — a `Menu.Group` holding
  `role="menuitemradio"` items; `value`/`onValueChange` on the group,
  `value` on each item.
- `Menu.ItemIndicator` — a 16px box showing a check (or a dot for
  indeterminate) only while its item is checked; pass your own children to
  replace the glyph. Unmounted while unchecked unless `forceMount`, which
  keeps the empty box (with `data-state="unchecked"`) so unchecked items
  stay aligned with checked ones.
- `Menu.Group` — `role="group"`, labelled by a `Menu.Label` child when there
  is one.
- `Menu.Label` — `SizableText` in `$color10` for headings inside the menu.
- `Menu.Separator` — a `Separator` with `role="separator"`.
- `Menu.Arrow` — optional `FloatingArrow` pointing at the trigger.

## Variants

`Menu.Content`: `size`, `elevate` (on by default), `elevation`, `bordered`,
`unstyled`. `Menu.Item`, `Menu.CheckboxItem`, `Menu.RadioItem`: `disabled`,
`unstyled`; they accept `theme` so a destructive item can be `theme="red"`.

## Theming

Content reads `$background`, `$borderColor` and `$shadowColor`; items read
`$backgroundHover`, `$backgroundFocus` and `$backgroundPress`, so a `theme`
on the menu subtree recolours everything together. There is no component
theme.

## Accessibility

- Follows the APG menu button pattern: Enter/Space/ArrowDown open and focus
  the first item, ArrowUp opens and focuses the last; ArrowDown/ArrowUp move
  between enabled items (wrapping only with `loop`); Home/PageUp and
  End/PageDown jump to the ends; Escape closes and returns focus to the
  trigger; Tab is swallowed rather than leaving the menu.
- Printable characters focus the next item whose text starts with the typed
  string; keys within a second extend the query, and repeating one letter
  cycles through its matches. Space during an active typeahead is part of the
  query, not a selection.
- Opening with the pointer focuses the menu itself, so a mouse user isn't
  shown a keyboard focus ring on the first item; moving the mouse over an item
  focuses it and leaving returns focus to the menu. Touch and pen don't move
  focus.
- Enter and Space typed into a focusable element nested inside an item (an
  input) are left alone; the item only selects when it is the focused
  element.
- The menu closes when the window loses focus, when the pointer is pressed
  outside, and when keyboard focus lands outside it (unless `modal`).
- Escape closes the topmost open layer only, so a menu inside a dialog closes
  before the dialog does.
