# Button

A themed, sized `<button>`. String children are wrapped in `Button.Text` so
the button's size, colour and font props flow to the label; `icon` and
`iconAfter` render in `Button.Icon` slots either side of it. Most other
components' triggers (`Dialog.Trigger`, `Popover.Trigger`, `Select.Trigger`,
`Toast.Action`…) are Buttons, so anything here applies to them too.

## Usage

```tsx
import { Button, XStack } from "@jam/ui";

<XStack gap="$3">
  <Button onClick={save}>Save</Button>
  <Button variant="outlined" size="$3" icon={<PlusIcon />}>Add</Button>
  <Button variant="ghost" theme="red" iconAfter="→">Delete</Button>
  <Button circular size="$4" aria-label="Settings" icon={<GearIcon />} />
  <Button disabled>Saving…</Button>
</XStack>
```

Set defaults for a group of buttons:

```tsx
<Button.Apply size="$2" variant="outlined">
  <Button>Cancel</Button>
  <Button theme="blue">OK</Button>
</Button.Apply>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | size token or number | `"$true"` (44px) | Height from the size scale, horizontal padding from the space scale, radius from the radius scale, and the label's font size. A number is used as the height directly. |
| `variant` | `"outlined" \| "ghost"` | — | `outlined`: transparent with a `$borderColor` border. `ghost`: transparent with no border until hovered. |
| `circular` | `boolean` | `false` | A round button as tall as it is wide; pair with `icon` and `aria-label`. |
| `chromeless` | `boolean \| "all"` | `false` | No background or border; `"all"` also drops hover/press backgrounds. |
| `elevation` | size token or number | — | Adds a `$shadowColor` drop shadow scaled by the token. |
| `disabled` | `boolean` | `false` | Sets the `disabled` attribute, 50% opacity, `not-allowed` cursor and `pointer-events: none`. |
| `unstyled` | `boolean` | `false` | Only the browser reset (no outline, border or background). |
| `icon` / `iconAfter` | `VChild` | — | Rendered in a `Button.Icon` before/after the label, sized to the font size. |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | Native button type. |
| `noTextWrap` | `boolean` | `false` | Render string children as-is instead of in `Button.Text`. |
| `textProps` | `object` | — | Extra props for the wrapping `Button.Text`. |

Text style props set on the button (`color`, `fontFamily`, `fontSize`,
`fontWeight`, `fontStyle`, `letterSpacing`, `textAlign`, `ellipsis`) are
forwarded to the label rather than applied to the frame. Every other style
prop and DOM attribute goes to the frame.

## Parts

- `Button.Frame` — the styled `<button>`: flex row, centred, `$background`
  with a 1px transparent border (so `outlined` doesn't shift layout),
  `$body` font, `gap` from the size's space token. Hover uses
  `$backgroundHover`/`$borderColorHover`, press `$backgroundPress`,
  keyboard focus a 2px `$outlineColor` ring offset 2px.
- `Button.Text` — `SizableText` with `ellipsis`, `flexShrink: 1`, `$color`
  and the button's font size; reads `size` and text props from the button's
  styled context.
- `Button.Icon` — an inline-flex `<span>` whose font size, width and height
  equal the label's font size, so text glyphs and SVGs with `1em` sizing
  both line up.
- `Button.Apply` — provider for the shared styled context (`size`,
  `variant`, text props); every `Button`, `Button.Text` and `Button.Icon`
  beneath uses the values as defaults.

## Sizes

| `size` | Height | Padding | Radius | Font |
| --- | --- | --- | --- | --- |
| `$2` | 28px | 7px | 5px | 13px |
| `$3` | 36px | 13px | 7px | 14px |
| `$true` / `$4` | 44px | 18px | 9px | 15px |
| `$5` | 52px | 24px | 10px | 16px |

## Theming

`Button` has a component theme: `theme="blue"` on a button (or a parent)
selects `blue_Button`, which is the accent palette's `surface2`, so
`$background`, `$color` and the hover/press colours all come from that
theme. Without an explicit theme the base `light_Button`/`dark_Button`
gives the neutral filled look. `variant="outlined"` and `ghost` keep the
theme's `$color` and `$borderColor` on a transparent background.

Colour themes are pale surfaces by design, so a primary call-to-action is
the `accent` theme, which inverts the palette: `<Button theme="accent">` is
dark-on-light in light mode and light-on-dark in dark mode. For a coloured
fill use the compound name, `<Button theme="blue_accent">Save</Button>`,
which resolves to `light_blue_accent`: a solid blue with white text. Nesting
`<Theme name="blue"><Button theme="accent">` reaches the same theme.

## Accessibility

- Renders a real `<button type="button">`, so Space/Enter activate it and it
  participates in forms only when `type="submit"`.
- `tag="a"` with an `href` makes a link that looks like a button: the `type`
  attribute is dropped, the frame keeps its `flex` display and pointer
  cursor, and the browser underline is suppressed. Do not add a click handler
  that only navigates — let the anchor do it so middle-click and "open in new
  tab" keep working.
- `circular` icon-only buttons need an `aria-label`.
- Focus is shown only for keyboard focus (`:focus-visible`), so pointer
  clicks don't leave a ring behind.
