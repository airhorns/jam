# Jam UI Native Support

Jam Native renders the same VDOM facts that `@jam/ui` emits in native mode. The
JavaScript bridge calls `setNativeMode(true)`, so styled components emit resolved
style facts and native display names such as `Button`, `SwitchFrame`, and
`TabsTab` instead of browser CSS classes.

## Current Support

| Area | Native support |
| --- | --- |
| Layout | `Stack`, `XStack`, `YStack`, `ZStack`, `Group`, `XGroup`, `YGroup`, `ScrollView`, `Spacer`, and generic styled flex containers. Unknown styled containers use their resolved `flexDirection`, `gap`, `alignItems`, and frame/style facts. |
| Typography | `Text`, `SizableText`, `Paragraph`, `Heading`, `H1` through `H6`, `Label`, plus text-like subcomponents such as `ButtonText`, `DialogTitle`, `DialogDescription`, `SelectValue`, `SelectItemText`, `ToastTitle`, and `TooltipContent`. |
| Shapes | `Square`, `Circle`, `RadioGroupIndicator`, `SliderThumb`, `SwitchThumb`, `SheetHandle`, `PopoverArrow`, `SliderTrack`, and `SliderTrackActive`. |
| Forms | `Button`, `Input`, `TextArea`, `CheckboxFrame`, `SwitchFrame`, `SliderFrame`, `RadioItemFrame`, `ToggleGroupItem`, `FormTrigger`, `TabsTab`, `SelectTrigger`, and other button-like trigger/close/item tags. |
| Content | `Card`, `CardHeader`, `CardFooter`, `Avatar`, `Image`, `ListItem`, `Progress`, `Spinner`, `Separator`, and `VisuallyHidden`. |
| Overlays and composition | `Dialog`, `Sheet`, `Popover`, `Accordion`, `Tabs`, `Select`, `Toast`, `Tooltip`, and `Portal` degrade to native containers/triggers using their emitted style facts. They do not yet have platform modal/window semantics. |

## Known Gaps

- SwiftUI does not have direct equivalents for browser `position`, transforms,
  CSS percentages, or web-only pseudo states. The renderer approximates these
  through normal SwiftUI layout and style modifiers.
- `Dialog`, `Sheet`, `Popover`, `Toast`, and `Tooltip` render their styled
  content but are not yet promoted into native modal, sheet, popover, toast, or
  tooltip presentation APIs.
- The Linux development host used for this ticket does not have `swift`, `xcrun`,
  or `mise` installed in `PATH`, so Swift package compile validation must run on
  a macOS or Swift-enabled host.

## Validation Entry Points

```bash
corepack pnpm --dir packages/native build
swift test --package-path packages/native
swift build --package-path examples/counter-ios
swift build --package-path examples/spatial-counter
swift build --package-path examples/ui-catalog-native
```

On Linux without Swift, run the JavaScript bundle build and web catalog build:

```bash
corepack pnpm --dir packages/ui exec vitest run src/__tests__/native-mode.test.ts
corepack pnpm --dir packages/native build
corepack pnpm --dir examples/ui-catalog build
```

The `native-mode.test.ts` suite is the local Linux proof for the JavaScript side
of native rendering: it verifies catalog-level `@jam/ui` components emit native
display tags, resolved style facts, ARIA/value props, handler refs, and no web
class facts. GitHub CI runs the Swift package and native example builds on
macOS, where SwiftUI and JavaScriptCore are available.
