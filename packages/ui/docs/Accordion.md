# Accordion

A stack of collapsible sections: an FAQ, a settings page, a long form broken
into steps. `type="single"` keeps at most one section open (add `collapsible`
to let it close again); `type="multiple"` keeps any number open. Use `Tabs`
when exactly one panel is always visible.

## Usage

```tsx
import { Accordion } from "@jam/ui";

<Accordion type="single" defaultValue="shipping" collapsible width={420}>
  <Accordion.Item value="shipping">
    <Accordion.Header>
      <Accordion.Trigger>
        Shipping
        <Accordion.Indicator />
      </Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content>Free over $50.</Accordion.Content>
  </Accordion.Item>
  <Accordion.Item value="returns">…</Accordion.Item>
</Accordion>
```

`type="multiple"` takes an array:

```tsx
<Accordion type="multiple" defaultValue={["shipping", "returns"]}>…</Accordion>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"single" \| "multiple"` | `"single"` | Whether the value is a string or an array. |
| `value` | `string \| string[]` | — | Controlled value; matches `type`. |
| `defaultValue` | `string \| string[]` | — | Initially open item(s) when uncontrolled. |
| `onValueChange` | `(value: string) => void` / `(value: string[]) => void` | — | Called with the new value; in single mode closing reports `""`. |
| `collapsible` | `boolean` | `false` | Single mode only: pressing the open trigger closes it. |
| `orientation` | `"vertical" \| "horizontal"` | `"vertical"` | Layout direction and which arrows navigate. |
| `disabled` | `boolean` | `false` | Disables every trigger. |
| `size` | size token or number | `"$true"` | Frame radius, trigger height and padding, content padding. |

`type` discriminates the prop types, so `value`, `defaultValue` and
`onValueChange` are typed as a string in single mode and an array in multiple
mode with no casts.

`Accordion.Item`: `value` (required), `disabled`, `size`, `unstyled`.
`Accordion.Content`: `forceMount`, `size`, `unstyled`.

## Parts

`Accordion.Item` — one section. Carries `data-state` (`open` / `closed`) and
`data-value`, and provides its open state to the trigger, indicator and
content, so nothing below it needs the item's value.

`Accordion.Header` — an `<h3>` wrapper with no margin, for the heading level
the ARIA pattern expects. Optional: the trigger works on its own.

`Accordion.Trigger` — `<button aria-expanded aria-controls id>` with
`data-state`. Toggles its item on click.

`Accordion.Indicator` — a `1em` chevron (override by passing children) that
rotates 180° when the item opens, animated by the shared `quick` transition.

`Accordion.Content` — `role="region"` with `aria-labelledby`. Renders nothing
while its item is closed; `forceMount` keeps it in the DOM with the `hidden`
attribute instead.

`Accordion.Frame` — the styled container. `Accordion.Apply` provides
`size`/`orientation` to every Accordion beneath.

## Variants

- `size` — the frame's radius comes from the matching radius token, the
  trigger's `minHeight` from the size token with horizontal padding from the
  matching space token, and the content's padding from the same space step with
  `paddingTop: 0` so it hugs the trigger above it. `$true` gives a 9px radius,
  44px-tall rows and 18px of content padding.
- `orientation` — `column` or `row`; also selects which arrows navigate.
- `openState` (trigger, indicator) — the open look: weight 600 on the trigger
  and a flipped indicator. Set by the item from its own state.
- `unstyled` — the frame drops its border, fill and radius, the item its
  divider, the trigger its sizing and colours, the content its padding.

The item dividers are the items' own bottom borders; the last one is removed by
a single injected `.jam-last-borderless > *:last-child` rule, so the count of
items does not matter and nothing depends on `Group`.

## Theming

The frame is `$background` inside a `$borderColor` border; triggers are
transparent (so the frame shows through) and go `$backgroundHover` /
`$backgroundPress`; the indicator is `$color10` and the text `$color`. There is
no `Accordion` component theme, so `theme="…"` on the frame recolours the whole
stack.

## Accessibility

- Follows the ARIA accordion pattern: a heading per section, a button with
  `aria-expanded` and `aria-controls`, and a `role="region"` panel labelled by
  its trigger. Ids are generated from each item's component id.
- Every trigger is a real button, so all of them are tab stops and Space/Enter
  toggles. Arrow keys along the orientation additionally move focus between the
  enabled triggers and wrap at the ends; Home and End jump to the first and
  last. Cross-axis arrows are left alone.
- In single, non-collapsible mode the open trigger simply does nothing when
  pressed. It deliberately does not get `aria-disabled`, which the style system
  treats as `:disabled` and would dim the open row.
- A disabled item's trigger gets the real `disabled` attribute and is skipped
  by both Tab and the arrow keys.
