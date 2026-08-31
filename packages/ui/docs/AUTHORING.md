# Authoring @jam/ui components

Every component in `src/components/` follows the same shape so the library
stays consistent. `Button.ts` and `Text.ts` are the reference implementations.
Read `STYLE-SYSTEM.md` first.

## Structure

- One file per component family (`Card.ts` exports `Card` with
  `Card.Header`/`Card.Footer`/`Card.Background`).
- Compound components are built with `Object.assign(Root, { Part, ... })`,
  never `(X as any).Part = ...`. Export a `<Name>Props` type.
- Component `name`s match tamagui's (`Card`, `CardHeader`, `Input`,
  `SwitchThumb`…) so the `is_<Name>` classes and component themes
  (`light_Button`, `light_Input`, `light_SwitchThumb`…) line up.
- Stateful parts share state through `createStyledContext` (for style props
  like `size`) or `createContext` from `@jam/core` (for behaviour like
  `open`/`onOpenChange`). Store uncontrolled state with `useControllableState`
  from `../state`; it is forgotten when the component unmounts and its setter
  is a no-op afterwards, so a late blur, image error or timer cannot resurrect it.
- Anything else keyed by the component id — hover/dismiss timers, entries in a
  module-level `Map`, a registered layer — must be released with `useCleanup`
  from `@jam/core`. The catalog's `leaks.spec.ts` mounts and unmounts every
  demo and fails on leftover facts, layers, a stuck scroll lock or pending timers.
- Interactive elements render real `<button>`/`<input>` elements so keyboard
  and focus work for free; use `role`/`aria-*` for anything else. Disabled
  parts carry `data-disabled=""` (the empty string, as Radix does) next to the
  real attribute; `rovingFocus` skips items that have it.
- Form controls with a `name` mirror their value into a visually hidden
  `<input>` and spread `useFormReset(() => reset(""))` from `../form` onto
  it, where `reset` is the third element of `useControllableState`, so a
  `<form>` reset returns to `defaultValue`; with no default it clears the
  value and reports `""` to `onChange`, as the DOM does for an unselected
  radio group or select.
- Composite widgets take `dir?: "ltr" | "rtl"`, render it as the `dir`
  attribute and pass it to `rovingFocus` so ArrowLeft/ArrowRight follow the
  reading direction. `rovingFocus`/`rovingItems` are also exported from
  `@jam/ui` for composites built outside the library (menus, dot pagers).
- Anything rendered but not currently selected (a `forceMount` panel, an
  inactive page) gets `tabIndex={-1}` so only the active part is a Tab stop.
- Overlays register with `useDismissableLayer` (`../layers`) and position with
  `../floating`; content goes through `Portal` from `@jam/core`. Something that
  handles Escape itself without being a layer (a toast) marks its element
  `data-handles-escape` so the key doesn't also dismiss the topmost layer.

## Styling rules

- No literal pixel sizes or colours. Sizes come from tokens through a `size`
  variant (`"...size"` spread with `getButtonSized`/`getFontSized`/
  `getSpaceSized`-style helpers in `../variants`; add a helper there when a
  new shape is needed). Colours are theme refs (`$background`, `$color`,
  `$borderColor`, `$backgroundHover`, `$color10`…) or colour tokens.
- Default look lives under `unstyled: { false: { … } }` with
  `defaultVariants: { unstyled: false }`, so `unstyled` strips it; use
  `defaultProps` only for structural CSS (display, position, box-sizing).
- Shadows via `elevation`/`elevate` from `themeableVariants`, never
  hard-coded `boxShadow`. Radii via `$true`/`$4` radius tokens or
  `borderRadius: 100000` for circles.
- Pseudo states use `hoverStyle`/`pressStyle`/`focusVisibleStyle`/
  `disabledStyle`; disabled elements get the real `disabled` attribute.
- Suppress a focus ring with `outlineStyle: "none"`, never `outlineWidth: 0`
  (Chrome paints its `outline-style: auto` ring regardless of the width).
- Transitions via `animation="quick"` etc., not literal `transition` strings.
- Rendering runs inside a tracked MobX derivation, so never write facts from
  a component body. Work that must happen after the DOM is committed (focus,
  measuring, publishing what children registered) goes in a `queueMicrotask`
  scheduled from render, guarded by a check that the component is still
  mounted; `layers.ts` and `Select`'s option registry are the pattern.

## Per-component checklist

1. **Implementation** in `src/components/<Name>.ts` following the rules above.
2. **Tests** in `src/components/__tests__/<group>.test.ts` with
   `// @vitest-environment happy-dom`, using `render`, `css`, `click`,
   `keydown`, `type` from `../../testing`. Cover: tag/role/aria, default
   size resolves to token values, each variant, theme refs become
   `var(--…)`, and every behaviour (toggle, keyboard, dismiss, controlled vs
   uncontrolled, callbacks).
3. **Docs** in `docs/<Name>.md` following the template below.
4. **Catalog demo** in `examples/catalog/src/demos/<Name>.tsx`: one demo per
   variant group plus one interactive demo with `data-testid`s. Run
   `CATALOG_PORT=5176 pnpm shots <Name>` from `examples/catalog` and look at
   both PNGs in `shots/` — fix anything that looks off before moving on.
5. **Conformance** in `src/conformance/__tests__/<Name>.conformance.test.ts`:
   behaviour ported from the matching Radix primitive and the WAI-ARIA APG
   pattern, one `it` per rule with the source cited. A deliberate divergence
   is an `it.skip` whose title ends with the reason, so the gap stays visible.
6. `pnpm exec vitest run` and `pnpm typecheck` pass in `packages/ui`,
   `pnpm typecheck` passes in `examples/catalog`.

## Doc template (`docs/<Name>.md`)

```markdown
# Name

One-paragraph description and when to use it.

## Usage

```tsx
import { Name } from "@jam/ui";

<Name size="$4">…</Name>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |

## Parts

`Name.Part` — what it renders and which props it accepts.

## Variants

`size`, `variant`, … with what each does.

## Theming

Which theme keys it reads (`$background`, `$borderColor`…), the component
theme it uses (`light_Name`), and how `theme="…"` affects it.

## Accessibility

Roles, keyboard interactions, focus behaviour.
```
