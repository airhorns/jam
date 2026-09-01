---
name: Tabs
group: Navigation
description: One panel at a time, chosen from a row or column of tabs.
---

# Tabs

One panel at a time out of a set, chosen from a row (or column) of tabs. Use
`ToggleGroup` when the buttons are commands rather than panels, and
`Accordion` when several sections can be open at once.

## Usage

```tsx
import { Tabs } from "@jam/ui";

<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Tab value="profile">Profile</Tabs.Tab>
    <Tabs.Tab value="connections">Connections</Tabs.Tab>
    <Tabs.Tab value="billing" disabled>Billing</Tabs.Tab>
  </Tabs.List>
  <Tabs.Content value="profile">Edit your name and bio.</Tabs.Content>
  <Tabs.Content value="connections">Manage linked accounts.</Tabs.Content>
  <Tabs.Content value="billing">Invoices.</Tabs.Content>
</Tabs>
```

Vertical tabs put the list beside the panel with no extra layout:

```tsx
<Tabs defaultValue="general" orientation="vertical" height={200}>…</Tabs>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Controlled selected tab. |
| `defaultValue` | `string` | `""` | Initially selected tab when uncontrolled. |
| `onValueChange` | `(value: string) => void` | — | Called with the newly selected value. |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | Also picks the root's direction and which arrows navigate. |
| `activationMode` | `"automatic" \| "manual"` | `"automatic"` | Whether the arrow keys select as they move focus. |
| `dir` | `"ltr" \| "rtl"` | `"ltr"` | Reading direction; reverses which arrow moves to the next tab. |
| `size` | size token or number | `"$true"` | Tab height, padding and font size; panel padding. |

`Tabs.List`: `loop` (default `true`), `size`, `unstyled`, plus style props.
`Tabs.Tab`: `value` (required), `disabled`, `size`, `unstyled`.
`Tabs.Content`: `value` (required), `forceMount`, `size`, `unstyled`.

## Parts

`Tabs.List` — `role="tablist"` with `aria-orientation`; owns arrow-key
navigation over its tabs.

`Tabs.Tab` — `<button role="tab">` with `aria-selected`, `aria-controls`,
`data-state` (`active` / `inactive`) and `data-value`. Its `id` is generated
from the root's component id, so nothing needs wiring by hand.

`Tabs.Content` — `role="tabpanel"` with `aria-labelledby` and `tabIndex={0}`.
Renders nothing unless its tab is selected; `forceMount` renders it regardless
(visible, with `data-state="inactive"` and `tabIndex={-1}` so only the active
panel is a Tab stop), for pagers and cross-fades that position or hide inactive
panels themselves. Radix hides inactive force-mounted panels instead; pass
`inert` to an off-screen panel yourself if it contains focusable content.

`Tabs.Frame` — the styled root. `Tabs.Apply` provides `size`/`orientation` to
every Tabs beneath.

## Variants

- `size` — tabs are sized like buttons (height from the size token, horizontal
  padding from the matching space token, font size from the same step) but with
  no radius, so the indicator sits flush. Panels take their padding from the
  matching space token: `$true` gives 44px-tall tabs and 18px of panel padding.
- `orientation` — `horizontal` lays the root out as a column with the list's
  bottom border as the baseline; `vertical` lays it out as a row with the
  list's right border as the baseline.
- `activeState` (tab) — the selected look: full-strength `$color` text, weight
  600, and a 2px indicator on the border facing the panel. Set by the root from
  its own state rather than by hand.
- `unstyled` — the list drops `border-style` (so its width is never painted),
  the tab drops sizing, colours and cursors, and the panel drops its padding.

The indicator is the tab's own 2px border pulled 1px over the list's 1px
border with a negative margin, so the selected tab reads as a single line
rather than two stacked ones. No measuring, no absolutely positioned
indicator, and it survives wrapping.

## Theming

Inactive tabs are `$color10` and go `$color` on hover with a
`$backgroundHover` fill; the selected tab and its indicator are `$color`. The
list's baseline is `$borderColor`. There is no `Tabs` component theme, so
`theme="blue"` on the root recolours the indicator and the selected label.

## Accessibility

- Follows the ARIA tabs pattern: `tablist` / `tab` / `tabpanel` with
  `aria-selected`, `aria-controls` and `aria-labelledby` wired from generated
  ids.
- Only the selected tab is in the tab order (`tabIndex` `0` vs `-1`), so Tab
  moves in and out of the tab strip in one step; when nothing is selected all
  tabs are reachable.
- Arrow keys along the orientation move between the enabled tabs and wrap
  unless `loop={false}`; Home and End jump to the first and last. `dir="rtl"`
  swaps which arrow moves forward. In `automatic` mode focus also selects,
  which is right when panels are cheap; use `manual` when selecting is
  expensive, and Space or Enter then activates.
- Clicking a tab focuses it (a left click with no modifier key) before
  selecting it, so keyboard navigation continues from wherever the pointer
  last landed.
- Cross-axis arrows are left alone, so a vertical tab list does not swallow
  Left/Right.
- Disabled tabs get the real `disabled` attribute and are skipped by both Tab
  and the arrow keys.
- The panel is focusable (`tabIndex={0}`) so Tab from the selected tab lands on
  the content it controls.
