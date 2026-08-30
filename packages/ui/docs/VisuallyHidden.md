# VisuallyHidden

Content for screen readers only. Unlike `display: none` or
`visibility: hidden`, the element stays in the accessibility tree and in the
tab order — it is simply clipped to a 1×1 box off the visual flow. Use it for
the text an icon-only button needs, for a heading that structures a region
visually implied by design, or for a "skip to content" link that appears only
on focus.

## Usage

```tsx
import { VisuallyHidden, Button } from "@jam/ui";

<Button>
  <Button.Icon>×</Button.Icon>
  <VisuallyHidden>Close dialog</VisuallyHidden>
</Button>

<VisuallyHidden tag="h2">Search results</VisuallyHidden>
```

A skip link that shows itself when focused:

```tsx
<VisuallyHidden tag="a" href="#main" focusStyle={{ position: "relative", width: "auto" }}>
  Skip to content
</VisuallyHidden>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `preserveDimensions` | `boolean` | `false` | Keeps the element's layout box, hiding only its pixels — for reserving space. |
| `visible` | `boolean` | `false` | Shows the content after all, so one component can toggle between hidden and shown. |
| `tag` | `string` | `"span"` | The element to render: `"h2"`, `"a"`, `"legend"`… |

It is a `Text` underneath, so every text and style prop works.

## Parts

None.

## Variants

- The default is `position: absolute`, `width: 1`, `height: 1`, `margin: -1`,
  `padding: 0`, `border-width: 0`, `overflow: hidden`,
  `white-space: nowrap`, `z-index: -10000`, `opacity: 0.00000001` and
  `pointer-events: none`. The 1×1-with-negative-margin approach is what
  screen readers reliably still announce; `clip`/`clip-path` are not part of
  the style prop surface here.
- `preserveDimensions` — back to `position: relative` with `auto` dimensions,
  keeping the content invisible but the box intact.
- `visible` — a full reset: relative, auto-sized, `opacity: 1`, `overflow:
  visible`, `pointer-events: auto`, `z-index: 1`.

## Theming

Reads no theme keys. When `visible` is on, it inherits the surrounding theme's
text colour like any `Text`.

## Accessibility

- The whole point: the text *is* announced. Keep it short and specific
  ("Close dialog", not "Click here to close this dialog").
- Because the element stays in the tab order, do not put focusable content
  inside a permanently hidden one — a keyboard user would tab into something
  they cannot see. The skip-link pattern above solves this by becoming visible
  on focus.
- Do not use it to hide content from sighted users that they need. It is for
  supplementing the visual design, not for holding a second version of the UI.
- Prefer `aria-label` for a simple control name; `VisuallyHidden` is for real
  content (headings, table captions, live-region text) that benefits from being
  in the DOM.
