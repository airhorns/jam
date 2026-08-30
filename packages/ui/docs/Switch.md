# Switch

An on/off control for a setting that takes effect immediately, drawn as a
track with a thumb that slides between its two ends. Renders a real
`<button role="switch">`. Use `Checkbox` for values that are only committed
when a form is submitted.

## Usage

```tsx
import { Switch, Label, XStack } from "@jam/ui";

<XStack gap="$3" alignItems="center">
  <Switch id="wifi" defaultChecked>
    <Switch.Thumb />
  </Switch>
  <Label htmlFor="wifi">Wi-Fi</Label>
</XStack>
```

Controlled:

```tsx
const [on, setOn] = useControllableState<boolean>("on", { defaultValue: false });

<Switch checked={on} onCheckedChange={setOn} size="$5">
  <Switch.Thumb />
</Switch>
```

`Switch.Thumb` is a child rather than built in, so it can be restyled or
replaced without an `unstyled` escape hatch.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `checked` | `boolean` | — | Controlled state. |
| `defaultChecked` | `boolean` | `false` | Initial state when uncontrolled. |
| `onCheckedChange` | `(checked: boolean) => void` | — | Called with the new state on every toggle. |
| `disabled` | `boolean` | `false` | Sets the real `disabled` attribute and applies `disabledStyle`. |
| `size` | size token or number | `"$true"` | Track height, width, thumb size and travel. |
| `unstyled` | `boolean` | `false` | Drop the default look. |

Uncontrolled state lives in the fact database under the switch's component id.

## Parts

`Switch.Thumb` — the sliding knob. Reads `checked` and `size` from the Switch,
translates itself by exactly one track height when on, and carries
`data-state`. Accepts every style prop plus `unstyled`.

`Switch.Frame` — the styled track button, for composing your own root.

`Switch.Apply` — provides `size` to every Switch beneath it.

## Variants

- `size` — a size token or a number. The track is 65% of the size token tall
  and twice that wide (tamagui's ratios), so `$true` (44) gives a 58×29 track
  with a 23px thumb. The thumb's travel is always one track height, so any
  size stays symmetric.
- `checkedState` — the on look, set by the Switch from its own state rather
  than by hand.
- `unstyled` — strips the track's background, border, radius and sizing.

## Theming

The track uses the `Switch` component theme (`light_Switch`): `$background`
and `$borderColor` when off, `$color8` when on (`$color9` on hover). The thumb
asks for the `SwitchThumb` component theme by name and fills with its
`$background`, which is the inverse of the track in both light and dark, so
the thumb reads clearly at both ends of the track. `theme="accent"` on the
Switch recolours the pair together.

## Accessibility

- `role="switch"` with `aria-checked`, plus `data-state`
  (`checked` / `unchecked`) on both the track and the thumb.
- A native `<button type="button">`: Space and Enter toggle, and it is in the
  tab order without a `tabIndex`.
- ArrowRight turns it on and ArrowLeft turns it off, matching platform
  switches; both call `preventDefault`.
- Focus shows a 2px `$outlineColor` outline via `focusVisibleStyle`.
- `disabled` sets the real attribute, so clicks and keys do nothing and the
  control leaves the tab order.
