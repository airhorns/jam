# Select

Pick one option from a dropdown. The trigger is a combobox button showing the
selected option's label; the list floats beneath it, sized at least as wide
as the trigger, and supports arrow keys, Home/End, typeahead and Enter/Space
selection. Use `RadioGroup` when all choices should be visible at once and
`ToggleGroup` for a small set of exclusive toggles.

## Usage

```tsx
import { Select, Label, YStack } from "@jam/ui";

<YStack gap="$2">
  <Label htmlFor="fruit">Favourite fruit</Label>
  <Select id="fruit" name="fruit" value={value} onValueChange={setValue}>
    <Select.Trigger width={240}>
      <Select.Value placeholder="Pick a fruit" />
    </Select.Trigger>
    <Select.Content>
      <Select.Viewport>
        <Select.Group>
          <Select.Label>Fruits</Select.Label>
          <Select.Item value="apple">
            <Select.ItemText>Apple</Select.ItemText>
            <Select.ItemIndicator />
          </Select.Item>
          <Select.Item value="banana" disabled>
            <Select.ItemText>Banana</Select.ItemText>
            <Select.ItemIndicator />
          </Select.Item>
        </Select.Group>
      </Select.Viewport>
    </Select.Content>
  </Select>
</YStack>
```

Any element as the trigger:

```tsx
<Select.Trigger asChild>
  <Button variant="outlined" iconAfter={<ChevronDown />}>
    <Select.Value placeholder="Assign to a team…" />
  </Button>
</Select.Trigger>
```

Items must appear in the `Select`'s own children tree (nested in arrays,
fragments, `Select.Group` or `Select.Viewport` is fine). The root reads each
item's `value`, `label` and text at render time so `Select.Value` can show the
selected label and typeahead can work while the list is closed; items
produced by another component's render are invisible to it. Give an item an
explicit `label` when its content is not plain text.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Controlled selected value. |
| `defaultValue` | `string` | — | Initial value when uncontrolled. |
| `onValueChange` | `(value: string) => void` | — | Called when an option is chosen. |
| `open` | `boolean` | — | Controlled open state. |
| `defaultOpen` | `boolean` | `false` | Initial open state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Called for every open/close, including dismissals. |
| `disabled` | `boolean` | `false` | Disables the trigger and keeps the list closed. |
| `required` | `boolean` | `false` | Marks the trigger `aria-required` and the hidden form input `required`. |
| `size` | size token | `"$true"` | Sizes the trigger, its value text and the item text together. |
| `placement` | `Placement` | `"bottom-start"` | Preferred side and alignment of the list; flips when it would overflow. |
| `name` | `string` | — | Renders a hidden input carrying the value for form submission. Reverts to `defaultValue` when the surrounding form resets. |
| `id` | `string` | generated | DOM id of the trigger, for `<Label htmlFor>`. |

## Parts

- `Select.Trigger` — a `Button` with `role="combobox"`, `aria-haspopup="listbox"`,
  `aria-expanded`, `aria-controls` (while open), `aria-required` (from the
  root's `required`), `data-state` and `data-layer-trigger`. Opening the list
  moves real DOM focus onto the selected option rather than using
  `aria-activedescendant`. Defaults to the group's `size`, space-between
  layout and a chevron `iconAfter`; pass your own to override. With
  `asChild` the attributes and handlers merge onto the single child and no
  defaults are added.
- `Select.Value` — text showing `children` if given, else the selected
  option's label, else `placeholder` (in `$placeholderColor`, with
  `data-placeholder`). Left-aligned, truncating with an ellipsis, `flex: 1`
  so it fills the trigger.
- `Select.Content` — the list, rendered in a portal only while open:
  `role="listbox"`, `aria-labelledby` the trigger, `tabIndex={-1}`,
  `data-placement`. Fixed-positioned 4px from the trigger with `min-width`
  equal to the trigger's width. `$background`, 1px `$borderColor`, `$4`
  radius, elevation, `overflow: hidden`; fades in from the trigger's side
  with `animation="quick"`. Variants: `elevate`, `elevation`, `bordered`,
  `unstyled`.
- `Select.Viewport` — the scrolling region: `$1` padding, 1px gap,
  `max-height: min(320px, 50vh)`, `overflow: auto`.
- `Select.Group` / `Select.Label` — `role="group"` wrapper and a small bold
  `$color10` heading (`size="$2"`, `$3`/`$2` padding). `Select.Group` mints
  an id that `Select.Label` renders onto itself, and wires it back onto the
  group as `aria-labelledby`.
- `Select.Item` — an option row: `role="option"`, `aria-selected`,
  `aria-disabled`, `data-state="checked" | "unchecked"`, `tabIndex={-1}`.
  `$3`/`$2` padding, `$3` radius, `$backgroundHover`/`$backgroundFocus`/
  `$backgroundPress` states; disabled items are half-opacity with
  `pointer-events: none`. Props: `value`, `label`, `disabled`, `unstyled`.
- `Select.ItemText` — the option's text, sized with the group and
  truncating; `flex: 1` so an indicator sits at the end.
- `Select.ItemIndicator` — rendered only inside the selected item; a
  16px-wide slot holding a check mark by default, or your `children`.

## Keyboard

| Focus | Key | Effect |
| --- | --- | --- |
| Trigger | Enter, Space, ArrowDown, ArrowUp | Open the list and focus the selected option (or the list). |
| Trigger | printable character | Select the next option whose label starts with the typed text, without opening. |
| List | ArrowDown / ArrowUp | Move focus to the next/previous enabled option. |
| List | Home / End | Focus the first/last enabled option. |
| List | printable character | Focus the next matching option; characters typed within 500ms extend the query. |
| Option | Enter, Space | Choose it and close. |
| List | Escape | Close without changing the value. |
| List | Tab | Close and let focus move on. |

Hovering an option moves focus to it, so the keyboard and pointer share one
highlight. Choosing an option or dismissing the list returns focus to the
trigger.

## Theming

Trigger is a `Button` and picks up the `Button` component theme; content and
items read `$background`, `$borderColor`, `$shadowColor`, `$color` and the
`$background*` interaction colours. A `theme` on the `Select` subtree
recolours the trigger and the portalled list together.

## Accessibility

- Follows the select-only combobox pattern: the trigger is the combobox and
  the list is a `listbox` of `option`s; opening the list moves real DOM
  focus onto the selected option rather than pointing at it with
  `aria-activedescendant`.
- Disabled options stay in the DOM with `aria-disabled` and are skipped by
  arrow keys and typeahead.
- A `name` renders a hidden input so the value submits with a surrounding
  `Form`; `Label htmlFor` should point at the `id` given to `Select`. The
  hidden input reverts to `defaultValue` when the form resets.
