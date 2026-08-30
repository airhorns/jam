# Slot and asChild

`asChild` lets a component hand its behaviour to an element you supply
instead of rendering its own: `<Dialog.Trigger asChild><Button>…</Button></Dialog.Trigger>`
renders just the Button, carrying the trigger's attributes, classes and
handlers. `Slot` is the standalone component that does this merge; compound
parts use it internally, and you can use it to build your own `asChild`
props.

## Usage

```tsx
import { Popover, Button, Slot } from "@jam/ui";

// Built-in: any part with an `asChild` prop.
<Popover.Trigger asChild>
  <Button variant="outlined">Filters</Button>
</Popover.Trigger>

// Standalone: merge props onto an arbitrary element.
<Slot role="link" tabIndex={0} onClick={go} className="nav-link">
  <span>Home</span>
</Slot>

// In your own component:
function CopyButton({ asChild, text, ...rest }) {
  return h(asChild ? Slot : Button, { ...rest, onClick: () => navigator.clipboard.writeText(text) });
}
```

## Merge rules

With exactly one element child, the child is rendered with:

- **Classes** — the slot's generated and passed classes appended to the
  child's own, so both sets of styles apply.
- **Handlers** — when both define the same `on*` prop, the child's runs
  first, then the slot's.
- **Everything else** — the child's own props win; slot props fill in only
  where the child has none. That includes `style`, `id`, `data-*` and
  `aria-*`.

Style props on a styled component with `asChild` still become classes, so
`<Popover.Trigger asChild size="$2">` sizes nothing unless the child reads
`size` itself — put size and variant props on the child.

With zero, several, or a text-only child there is nothing to merge onto, so
`Slot` falls back to rendering a `<span>` around its children with the props
applied.

## What compound parts add

Parts that support `asChild` (`Dialog.Trigger`/`Close`, `AlertDialog`
equivalents, `Popover.Trigger`/`Anchor`/`Close`, `Tooltip.Trigger`,
`Select.Trigger`, `Toast.Action`/`Close`, `Form.Trigger`, `Group.Item`…)
skip their default `Button` chrome and pass only behaviour: `role`, `aria-*`,
`data-state`, `data-layer-trigger`, `id` and the click/key handlers. The
child therefore needs to be something that can hold focus and receive
clicks — a `Button`, an anchor, or an element with `tabIndex`.
