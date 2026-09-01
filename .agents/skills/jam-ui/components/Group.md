---
name: Group
group: Layout
description: XGroup and YGroup join children into one control, squaring off the interior corners and collapsing adjacent borders. Wrap each child in Group.Item.
---

# Group

Joins several controls into one visual unit: a segmented button bar, a
prefix/input/suffix field, a list of rows in a bordered card. The group squares
off the interior corners, passes its own radius to the first and last item, and
collapses adjacent borders into one line so a bordered group has no double
edges. `XGroup` is horizontal, `YGroup` (aliased as `Group`) is vertical.

## Usage

```tsx
import { XGroup, YGroup, Group, Button, Separator, ListItem } from "@jam/ui";

<XGroup bordered size="$4">
  <Group.Item><Button>Day</Button></Group.Item>
  <Group.Item><Button>Week</Button></Group.Item>
  <Group.Item><Button>Month</Button></Group.Item>
</XGroup>

<YGroup bordered separator={<Separator />} tag="ul">
  <Group.Item><ListItem title="Inbox" /></Group.Item>
  <Group.Item><ListItem title="Archive" /></Group.Item>
</YGroup>
```

Every child must be wrapped in `Group.Item` — that is how the group knows
which item is first and last.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `orientation` | `"horizontal" \| "vertical"` | per component | Overrides `XGroup`/`YGroup`'s direction. |
| `size` | size token or number | `"$true"` | Picks the radius token the outer corners use. |
| `bordered` | `boolean \| number` | — | Border on the group, and collapses the items' adjacent borders. |
| `separator` | element | — | Rendered between every pair of items. |
| `disablePassBorderRadius` | `boolean` | `false` | Keeps each item's own radius instead of passing the group's. |
| `unstyled` | `boolean` | `false` | Drops the direction, alignment and radius defaults. |

## Parts

`Group.Item` — wraps one child. A stretch-aligned column flexbox with
`min-width: 0`, so an `Input` or `Button` inside fills the cell and long text
truncates instead of widening the group.

`Group.Frame` — the styled box, for composing your own root.

## Variants

- `size` — spreads the size scale onto the radius scale, so `size="$4"` gives
  the `$4` radius (9px by default) on the outer corners.
- `orientation` — sets `flex-direction`, and which pair of corners each edge
  item keeps.
- `unstyled` — leaves the corner and border handling in place (that is
  structural) but drops `flex-direction: row` and `align-items: stretch`.

The corner and border-collapse behaviour is a small set of CSS rules injected
once and matched by marker classes on the frame; the edge items get
`border-radius: inherit`, so the group can hand down a token-derived radius it
never has to compute a value for. Those rules are more specific than the
atomic style classes, so they win regardless of stylesheet order.

## Theming

Reads `$borderColor` when `bordered`. The items keep their own theming — a
`Button` inside a group is still `light_Button`. There is no `Group` component
theme, so `theme="accent"` on the group recolours its border and every item.

## Accessibility

- Renders a `div` by default. Use `tag="ul"` with `ListItem` children (they are
  `li`s), or add `role="group"` / `role="toolbar"` with an `aria-label` when the
  grouping is meaningful.
- For a set of mutually exclusive buttons, use `ToggleGroup` instead — it adds
  the radio semantics and arrow-key navigation that `Group` deliberately does
  not.
- A `separator` element is purely visual; give it `role="separator"` yourself if
  it needs to be announced.
