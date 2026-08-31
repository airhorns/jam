---
name: ListItem
group: Content
description: A list row with an optional leading icon, a title/subtitle column and a trailing icon. Announced as a list item, so keep the rows inside a `role="list"` container.
---

# ListItem

One row of a list: an optional leading icon, a title with an optional
subtitle, and an optional trailing icon. It is announced as a list item, so
keep the rows inside a container with `role="list"`. Everything
about it is sized from one `size` token — row height, horizontal padding,
vertical padding, title font size and the smaller subtitle underneath.

## Usage

```tsx
import { ListItem, YStack, YGroup, Separator } from "@jam/ui";

<YStack role="list" gap="$1">
  <ListItem title="Inbox" subTitle="12 unread" icon="✉" iconAfter="›" />
  <ListItem title="Archive" iconAfter="›" />
  <ListItem title="Trash" disabled />
</YStack>
```

Composing the column yourself:

```tsx
<ListItem.Frame>
  <YStack flexGrow={1} flexShrink={1}>
    <ListItem.Title>Deploy</ListItem.Title>
    <ListItem.Subtitle>Finished 4 minutes ago</ListItem.Subtitle>
  </YStack>
  <ListItem.Icon placement="after">›</ListItem.Icon>
</ListItem.Frame>
```

In a bordered group, with separators:

```tsx
<YGroup bordered role="list" separator={<Separator />}>
  <YGroup.Item><ListItem title="Profile" /></YGroup.Item>
  <YGroup.Item><ListItem title="Notifications" /></YGroup.Item>
</YGroup>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string or element | — | Primary line. A string is wrapped in `ListItem.Title`. |
| `subTitle` | string or element | — | Second, dimmer line. A string is wrapped in `ListItem.Subtitle`. |
| `icon` | string or element | — | Leading glyph, in a `ListItem.Icon`. |
| `iconAfter` | string or element | — | Trailing glyph. |
| `size` | size token or number | `"$true"` | Row height, padding and the text sizes. |
| `variant` | `"outlined"` | — | Transparent with a 1px border instead of a filled surface. |
| `active` | `boolean` | `false` | The pressed background, held. |
| `disabled` | `boolean` | `false` | 50% opacity and `pointer-events: none`. |
| `hoverTheme` / `pressTheme` | `boolean` | — | From `ThemeableStack`; `pressTheme` adds `cursor: pointer`. |
| `noTextWrap` | `boolean` | `false` | Leave children exactly as passed instead of wrapping strings in text. |
| `textProps` | object | — | Extra props for the wrapping text component. |
| `unstyled` | `boolean` | `false` | Drops the row's own styling. |

String children are wrapped in `ListItem.Text` the same way `Button` wraps
its children, so `<ListItem>Plain row</ListItem>` is styled text, not a bare
text node.

## Parts

`ListItem.Frame` — the row itself, with `justify-content: space-between`,
`overflow: hidden` and no text decoration. It carries `role="listitem"`
unless `tag` is `button` or `a`, in which case the row keeps its native role
and gets `cursor: pointer`, so a row of links or buttons looks and reads like
one without further props.

`ListItem.Text` — the default wrapper for children: `$color`, grows and
shrinks, `ellipsis`, `cursor: inherit`.

`ListItem.Title` — `ListItem.Text` for the primary line.

`ListItem.Subtitle` — one size step smaller (half-steps skipped, so `$true`
drops to `$3`) at 60% opacity.

`ListItem.Icon` — an inline-flex `span` sized from the row's font size, with
`placement="before" | "after"` adding the `$2` margin on the correct side.

`ListItem.Apply` — provides `size`/`variant`/`color` to every part beneath.

## Variants

- `size` — `min-height` from the size scale, `padding-horizontal` from the
  space scale at the same key, and `padding-vertical` from four space steps
  down (tamagui's ratio), so a `$true` row is 44px tall with 18px side padding
  and 4px above and below.
- `variant="outlined"` — transparent background, 1px `$borderColor`, and hover
  and press that only move the border colour.
- `active` — pins `$backgroundPress` through hover too, for the selected row.
- `disabled` — dims and stops pointer events.
- `unstyled` — keeps the list-item semantics only.

## Theming

Reads `$background`, `$backgroundHover`, `$backgroundPress`, `$borderColor`,
`$borderColorHover`, `$borderColorPress` and `$color`. There is no `ListItem`
component theme, so `theme="accent"` on the row (or on the list) recolours the
surface, its border and all of its text together.

## Accessibility

- The frame carries `role="listitem"`, which only counts inside a container
  with `role="list"` — without one the row is an orphan for screen readers.
  `tag="li"` inside a real `ul` works too, but remember to zero the `ul`'s
  browser `padding-inline-start`.
- A ListItem is not a button. For a tappable row, put a `Button` or an anchor
  inside it, or use `tag="button"` / `tag="a"` on the frame — a click handler
  on a bare `div` is not keyboard reachable. A button or anchor row keeps its
  native role rather than `listitem` (and a pointer cursor), so announce the
  container with an `aria-label` instead of `role="list"` when every row is a
  button.
- `active` is the pressed shade (`$backgroundPress`), which in the dark scheme
  is the same colour as a `$color1` panel. To mark the *selected* row in a
  list, use `backgroundColor="$color3"` or a colour theme
  (`theme={selected ? "blue" : undefined}`) rather than `active`.
- `disabled` sets `pointer-events: none`, which hides clicks but does not
  remove the row from the accessibility tree; add `aria-disabled="true"` when
  the row represents a real disabled action.
- The title and subtitle are separate text nodes, so they are announced in
  order; keep the subtitle to supporting detail.
