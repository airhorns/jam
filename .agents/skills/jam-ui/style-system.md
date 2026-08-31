# @jam/ui style system

`@jam/ui` is a port of tamagui's web style system onto Jam's fact database. This
document describes how the pieces fit together; component-level docs live in
`components/<Component>.md` beside it.

## Setup

```ts
import { createJamUI, defaultConfig } from "@jam/ui";

createJamUI(defaultConfig);
```

`createJamUI` registers tokens, themes, media queries, fonts and animations,
sets the default font, and applies the default theme (`light`) as classes on
`<html>` (`themeClassTarget: "html" | "body" | false`). Spread `defaultConfig`
to override pieces:

```ts
createJamUI({
  ...defaultConfig,
  defaultTheme: "dark",
  themes: createDefaultThemes({ accent: { light: [...], dark: [...] } }),
});
```

`defaultConfig` mirrors tamagui's `@tamagui/config/v4`: size/space/radius/
zIndex/color tokens (`$0`–`$20`, `$true`, `$-1`…, `$0.25`…), `body` and
`heading` fonts built from `createSystemFont`, `defaultMedia` breakpoints
(`$xxxs`…`$xxl` min-width, `$max-sm`… max-width, `$height-md`/`$max-height-md`,
`$hoverable`, `$touchable`), and CSS transition presets for
`animation="quick" | "bouncy" | "lazy" | …`.

## Tokens

Tokens live in the fact DB as `["token", category, key, value]` and are read
through a cached snapshot (`getToken`, `getTokens`, `resolveTokenValue`).
Style props resolve `$` refs by category: `padding="$4"` looks in `space`,
`width="$4"` in `size`, `borderRadius="$4"` in `radius`, `backgroundColor="$red9"`
in `color` (see `tokenCategoryMap` in `style-props.ts`). An unknown token falls
through to theme resolution, then to the literal string.

## Themes

Themes are built with `createDefaultThemes()` (tamagui v5's palettes and
templates): `light`, `dark`, colour children (`light_blue`, `dark_red`, …),
`accent`, and component themes (`light_Button`, `light_blue_Card`,
`dark_Input`, …). Theme facts `["theme", name, key, value]` are the source of
truth; `addTheme`/`updateTheme` change them at runtime.

Themes render as CSS variables. Each theme gets a rule
`.t_<name> { --background: …; --color: …; }` in `<style id="jam-ui-themes">`,
and an element carrying a theme gets the whole ancestor chain as classes:
`t_light t_light_blue t_light_blue_Button`. Style props that reference the
theme emit `var(--background)`, so switching theme (`setTheme("dark")`) changes
one class on `<html>` and no atomic classes are rehashed.

- `<Theme name="blue">` scopes a sub-theme to a subtree; `<Theme inverse>` swaps
  light/dark. Resolution walks up the parent chain (`resolveThemeName`), so
  `name="red"` inside `light_blue_Button` resolves to `light_red`.
- Every styled component accepts `theme` and `themeInverse` props with the same
  semantics.
- A styled component with a `name` picks up its component theme automatically:
  `Button` inside `light_blue` renders with `t_light_blue_Button` classes.
  Component themes never nest: a `Button` inside `light_Card` resolves to
  `light_Button`, and `theme="red"` inside `light_blue_Button` to `light_red`.
- Colour scales follow the scheme: `$blue9` is the light blue in `light` and
  the dark blue in `dark`. For a colour that must stay fixed across schemes use
  the scheme-suffixed scale (`$blue9Light`, `$blue9Dark`), or `theme="blue"`
  with `$color9` when the tint should track the theme.
- `useThemeName()` / `useTheme()` read the theme in effect for the current
  component; `resolveThemeValue("$background")` returns the concrete colour.

## `styled()`

```ts
const Frame = styled("button", {
  name: "Button",              // is_Button class + component theme lookup
  tag: "button",               // default tag; `tag` prop overrides
  isText: true,                // apply the default font
  context: ButtonContext,      // createStyledContext values act as prop defaults
  defaultProps: { display: "flex", gap: "$2" },
  variants: {
    size: { "...size": getButtonSized, ":number": (v) => ({ height: v }) },
    variant: { outlined: { borderColor: "$borderColor" } },
    unstyled: { false: { backgroundColor: "$background" } },
  },
  defaultVariants: { unstyled: false },
});
```

Style resolution order, later layers winning:

1. `defaultProps` (component and its parents, merged on extension)
2. variants, in declaration order; nested variant keys inside a variant result
   act as defaults for other variants (`unstyled: { false: { size: "$true" } }`)
3. style props from the styled context (`createStyledContext`), so
   `<Button size="$6">` sizes its `Button.Text` and `Button.Icon`
4. inline props

Variant specs: exact keys, `true`/`false`, spreads `"...size" | "...space" |
"...radius" | "...color" | "...zIndex" | "...fontSize"` (match any token in
that category, given as `$4` or `4`; numbers are passed literally), typed
catch-alls `":number" | ":string" | ":boolean"`, or a bare function for the
whole variant. Functions receive `(value, { props, tokens, theme, themeValues,
font, fontName })`. `variants.ts` exports the helpers tamagui components use:
`getButtonSized`, `getFontSized`, `getSizedElevation`, `getElevation`,
`themeableVariants` (`circular`, `elevate`, `elevation`, `bordered`,
`transparent`, `chromeless`, `fullscreen`), `tokenValue`, `stepToken`.

Style props also accept:

- pseudo groups: `hoverStyle`, `pressStyle`, `focusStyle`,
  `focusVisibleStyle`, `focusWithinStyle`, `disabledStyle`, `placeholderStyle`.
  `disabledStyle` matches both `:disabled` and `[aria-disabled="true"]`.
  Their rules are prefixed with `:root` by priority (hover 2, press 3, focus
  4, disabled 5) so `pressStyle` beats `hoverStyle` while both apply, whatever
  order their classes were injected in. `exitStyle` is accepted but does
  nothing: elements leave the DOM synchronously.
- media props: `$sm={{ padding: "$4" }}` emits an `@media` rule whose
  selector repeats `:root` above every pseudo priority and by the query's
  position in the media config, so later (larger min-width) queries win
  regardless of injection order.
- shorthands (`p`, `px`, `bg`, `br`, `ai`, `jc`, …) from `shorthandMap`.
  `padding`, `margin`, `borderWidth`, `borderColor`, `borderStyle`,
  `borderRadius`, `inset` and the `Horizontal`/`Vertical` variants expand to
  longhands (`expansionMap`) as each layer merges, so `borderWidth: 0` in
  `defaultProps` and `borderBottomWidth: 1` in a variant compose
  deterministically. A multi-value string such as `"0 auto"` is not
  supported; set the sides individually.
- transform pieces `x y scale rotate …` composed into `transform`, and
  `shadowColor/Offset/Radius/Opacity` composed into `box-shadow`.
- numbers are pixels except for the unitless properties (`flex`, `opacity`,
  `zIndex`, `fontWeight`, `scale`, …), so `lineHeight: 1.3` is `1.3px` as in
  React Native; pass `"1.3"` for a unitless line height.
- variant names that are also DOM state attributes (`disabled`, `checked`,
  `open`, `hidden`, `readOnly`, `required`, `selected`) are forwarded to the
  element as well as applied as variants; pick a different name
  (`highlighted`) when the attribute is unwanted.
- `animation="quick"` → `transition: all <preset>`; `animateOnly={["opacity",
  "transform"]}` limits it to those properties.
- `enterStyle={{ opacity: 0, y: -4 }}` with an `animation` plays a keyframe
  animation from those values to the resolved styles when the element mounts.
- `asChild` merges the resolved class and passthrough props onto the single
  child element instead of rendering a wrapper (see [Slot](./components/Slot.md)).

Every declaration becomes its own atomic class `_<abbrev>[-pseudo|-m]-<hash>`
in `<style id="jam-ui-styles">`, deduped per declaration.

## Fonts

`createFont(name, { family, size, lineHeight, weight, letterSpacing })` fills
sparse tables carry-forward like tamagui. `fontFamily="$heading"` picks the
font; `fontSize="$4"` etc. read from the font in effect. `SizableText`'s `size`
variant (`getFontSized`) sets fontSize/lineHeight/fontWeight/letterSpacing
together.

## Text and Button composition

`Text` → `SizableText` (font `size` variant, `unstyled`) → `Paragraph` (`<p>`)
→ `Heading` → `H1`–`H6`. `Button` is `Button.Frame` + `Button.Text` +
`Button.Icon` joined by `ButtonContext`; string children are wrapped in
`Button.Text` (adjacent strings coalesce into one element) and
`size/color/fontFamily/…` on the Button flow to the text via the context.
`Button.Apply` provides those values to a subtree of unstyled buttons.

## Testing

`@jam/ui/testing` (requires `// @vitest-environment happy-dom`):

- `render(vnode)` mounts into a fresh container; only one tree can be mounted
  at a time, so calling it again unmounts the previous one.
- `css(el, pseudo?)` returns the declarations injected for an element's
  classes (`css(button, ":hover")`), `mediaCss(el, query)` for media rules,
  `computed(el)` for the cascade. Both add the shorthand (`padding`,
  `border-radius`, …) when all of its longhands agree.
- `resetUI()` clears the fact DB, token/theme/font caches, injected styles,
  media listeners and DOM; call it in `beforeEach` before `createJamUI(...)`.
- `click/keydown/keyup/type/focus/blur/pointerEnter/pointerLeave/tick`.

The catalog (`examples/catalog`) runs on `defaultConfig`; `pnpm shots`
screenshots every demo in both themes. Set `CATALOG_PORT` when 5175 is taken
by another dev server (`reuseExistingServer` would otherwise attach to it).
