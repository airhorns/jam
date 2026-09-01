# @jam/ui status

Baseline inventory taken before the quality pass (2026-08-29), kept here so the
"after" can be compared against it.

## Baseline findings

**Components.** 34 files, ~45 exported components. Almost all are pure
`styled()` shells:

- Only three event handlers exist in the whole package (`Checkbox`, `Switch`,
  `RadioGroup.Item` onClick). Every `Trigger`, `Close`, `Item`, `Tab` is inert.
- `open` / `value` are decorative on `Dialog`, `AlertDialog`, `Popover`,
  `Select`, `Tooltip`, `Tabs`, `Accordion` — content always renders, so the
  absolutely-positioned overlays are permanently visible.
- No keyboard support anywhere; `role="checkbox|switch|slider"` divs are not
  focusable.
- Props declared in types but not destructured leak onto DOM nodes
  (`Select` open/onOpenChange, `Tooltip` delayDuration, `ToggleGroup` value…).
- Dead code: `Progress` computes `percent` and never uses it; `Spinner` injects
  keyframes nothing references; `Portal` drops its children on the web;
  `Image.objectFit` variants are empty objects; `Slider` ignores value/step.
- Hardcoded colors/shadows/z-indexes bypass tokens and themes.
- No default tokens/themes ship — every consumer defines a palette from scratch.

**Style system.** Theme refs (`$background`) resolve to literal values at render
time, so switching theme re-hashes every class; no sub-tree theming. Media props
(`$gtSm`) are evaluated in JS via `matchMedia` facts rather than emitted as
`@media` rules (`injectMediaRule` is dead code). No `::placeholder` support.
Boolean variants must be passed as the strings `"true"`/`"false"`.

**Core.** `mount()` only tracks the root component; nested components execute
inside the untracked effect, so a `when()` read in a child component does not
re-render when the fact changes.

**QA.** Unit tests call components as plain functions and assert on the returned
VNode's `tag` / that `props.class` is defined / that sub-components exist. No
DOM rendering, no CSS inspection, no events. No visual catalog, no browser
tests for the library. CI does not exercise the library beyond `vitest run`.

## After the style-system pass

See [STYLE-SYSTEM.md](./STYLE-SYSTEM.md) for how the system now works.

**Style system.** Ported from tamagui v4: default tokens/fonts/media/animations
(`defaultConfig`), 390 generated themes (`createDefaultThemes`: light/dark ×
colour × component), themes as CSS variables behind `t_<name>` class chains so
switching theme changes one class, `<Theme>` / `theme` / `themeInverse`
sub-tree theming, component themes (`light_Button`) picked up by `name`.
Variants support spreads, typed catch-alls, functional variants with tamagui's
`extras`, nested variant defaults, `defaultVariants`, `unstyled`, and
`mergeVariants` on extension. `createStyledContext` propagates props between
compound parts. Pseudo (`hover/press/focus/focusVisible/focusWithin/disabled/
placeholder`) and media props emit real CSS rules. Fonts follow tamagui's
`createFont` fill semantics; `SizableText`/`Paragraph`/`Heading`/`H1–H6` and
`Button` (`Frame`/`Text`/`Icon`/`Apply`) match tamagui's composition.

**Core.** Component expansion is tracked, so `when()` in nested components
re-renders; `createContext`/`useContext`, `useComponentId`, `useCleanup`,
`Portal`; `mount`'s disposer runs every cleanup and removes the tree's facts.

**QA.** DOM tests through `@jam/ui/testing` (`render`, `css`, `mediaCss`,
events, `resetUI`) — 212 unit tests across 13 files. `examples/catalog` renders
every component in both themes; Playwright smoke and leak sweeps in CI, `pnpm shots` for
visual review.

## After the component pass

Every component now has real behaviour, tokenised styling, a DOM test file and
a `docs/<Component>.md` (usage, props, parts, keyboard, theming, accessibility).

**Behaviour helpers** (`state.ts`, `layers.ts`, `floating.ts`,
`components/roving-focus.ts`): `useControllableState` (forgotten on unmount,
setter inert afterwards), `useStableId`, `useDismissableLayer` (Escape/outside-press
dismissal, focus trap, autofocus and focus restore, scroll lock; closed by
`useCleanup` when its component unmounts), `repositionLayer`/`floatingStyle` (placement
against an anchor, flipping and shifting to stay in the viewport),
`rovingFocus`/`rovingTabIndex` for arrow-key groups. Overlays portal to the mount root and
sit at `zIndex` 100000 (toasts 100001).

**Components.** `Dialog`/`AlertDialog`/`Sheet` are modal layers; `Popover`,
`Tooltip` and `Select` are anchored floating layers; `Toast` has a declarative
form and an imperative `toastController` with a `Toast.Viewport`. `Checkbox`,
`Switch`, `RadioGroup`, `ToggleGroup`, `Slider`, `Tabs` and `Accordion` are
keyboard-operable with the ARIA roles/states of their tamagui counterparts.
`Form` is a real `form` with a submit `Trigger`; `Input`/`TextArea`,
`Label`, `Progress`, `Spinner`, `Avatar`, `Image`, `Card`, `ListItem`,
`Group`, `Separator`, `ScrollView` and the shapes take their sizes from the
tokens. `asChild` (via `Slot`) is supported on every trigger/close part.

**Style system additions.** `enterStyle` plays as a keyframe animation from
the given values; `animateOnly` restricts a transition to listed props
(floating layers use `["opacity", "transform"]` so their position never
animates). Shorthand style props (`padding`, `margin`, `borderWidth`,
`borderColor`, `borderStyle`, `borderRadius`, `inset`, the axis variants)
expand to longhands before styles merge, so precedence between a shorthand and
a longhand is decided by layer order, never by stylesheet injection order.
Component themes never nest: a `Button` inside `light_Card` resolves to
`light_Button`. `StyledComponent<P>` lets `P` override a style prop's type
(`Sheet`'s numeric `position`).

**Core.** SVG elements are created in the SVG namespace (children of
`foreignObject` return to HTML); attributes that back a DOM property
(`value`, `checked`, …) are kept across reconciles so hidden form inputs keep
their value.

**QA.** 409 unit tests across 40 files in `packages/ui`, 79 in
`packages/core`. The catalog has a demo page per component with "shot
recipes" (click/hover/focus before capture) so open overlays are
screenshotted; `pnpm test:e2e` renders every demo and performs every recipe,
`pnpm shots` writes light and dark screenshots for review.

## After the example UIs

Eighteen tamagui/Bento-style screens (`examples/catalog/src/demos/examples/`)
were rebuilt on `@jam/ui` by parallel builders whose job was to report every
place the library got in the way. What they surfaced, and what changed:

**Core.** A component's `id` prop is an ordinary prop, not its entity id (two
`<Field id="email">` instances no longer collide). `defaultValue`/
`defaultChecked` are applied as properties, and camelCase attributes are
lowercased before the stale-attribute sweep so they survive it. Removing a
keyed child now removes its node before repositioning siblings, so surviving
rows keep their DOM nodes (and don't replay `enterStyle`).

**Style system.** Pseudo rules carry a fixed precedence (`placeholder` <
`hover` < `active` < `focus` < `disabled`), and media rules sit above them
all, independent of injection order. A wrapper that defaults to
`unstyled: true` keeps the styles declared alongside it. Text nested in text
inherits `white-space` so an `ellipsis` parent still truncates. Children with
a `name` but no component theme inherit the surrounding component theme
(`Tooltip` text is readable again).

**Themes.** Component themes follow tamagui v5 (`Button`/`Switch` surface2,
`Input`/`TextArea`/`Progress`/`Slider` surface1, `SliderActive` surface3,
`Tooltip`/`SwitchThumb` accent) plus `Checkbox`/`RadioGroupItem` surface2 and
`ProgressIndicator` accent so unchecked controls and progress bars are visible
in dark. `$outlineColor` sits far enough from the base background (light step
7, dark step 8 at 60% alpha) for a ≈3:1 focus ring in both schemes, and the
`animation` prop's `transition` excludes `outline-*` so the ring appears at
once instead of fading in.

**Components.** `Popover` gained `hoverable` (grace-period hover menus whose
trigger click keeps them open), `disableFocus` and `dismissOnFocusOutside`
(on by default for non-modal popovers and `Select`, so tabbing past an open
layer closes it as Radix does); its trigger's `aria-haspopup` and content's
`role` can be overridden for menus. `Tabs.Content forceMount`
renders inactive panels visible with `data-state="inactive"` as upstream does;
`Accordion.Indicator` is a `1em` SVG chevron; `ListItem` has a
`focusVisibleStyle` and no UA button border.

**QA.** Every example has light/dark shots and recipes that open its
overlays; `pnpm test:e2e` covers them with a 180 s budget for the whole-catalog
sweeps. A second round of cheap QA agents then read every shot, exercised the
interactions and resized to 420 px; the library fixes above came out of that
round, and the examples now wrap or scroll horizontally at phone widths.

**Known constraints.**

- `$backgroundActive` equals `$background` and `$borderColor` in the base
  light theme equals the `Button` background, as in tamagui's v4 templates.
- Plain `Card` and `Avatar` fallbacks share the page background in the
  default theme; use `bordered`/`elevate` or a sub-theme on flat surfaces.
- `styled(Base, { name })` looks up a component theme by the new name only.
- `$accentBackground`/`$accentColor` are the *opposite* palette's edge colours
  (mid-grey in `dark`), exactly as in tamagui v5; use `theme="accent"` with
  `$background`/`$color` for an accent surface.
- There is no `Input` adornment slot, grid style props, or `Table`/`Chip`
  component; the examples compose these from stacks.
- Dark shadows are pure black and `bordered` frames use `$borderColor`
  (≈1.2:1 against the surface in dark), as in tamagui v5; muted `$color10`
  text and light `theme="red"` button text sit just above 4:1.

## After the reliability round

Three independent oracles now check the library rather than its own tests:

**Lifecycle.** `useCleanup` in `@jam/core` runs a component's teardown when
its id leaves the expansion, so `useControllableState` forgets its fact on
unmount and its setter goes inert, layers and timers are released, and the
catalog's `leaks.spec.ts` mounts and unmounts every demo in every group and
fails on leftover facts, layers, a stuck scroll lock or pending timers.

**Conformance.** `src/conformance/__tests__/` holds one suite per interactive
component ported from the Radix primitives and the WAI-ARIA APG, each `it`
citing its source. What it changed: triggers only point `aria-controls` at
content that exists; `Dialog` omits `aria-labelledby`/`aria-describedby`
without a Title/Description and merges a caller's `aria-describedby`;
`AlertDialog` is always modal, ignores outside presses and focuses Cancel;
closing a nested popover no longer closes its parent; composite widgets take
`dir` and `loop`, ignore keys from focusables nested inside an item, and
carry `data-disabled=""` (the Radix spelling) on every disabled part;
`Checkbox`, `Switch`, `RadioGroup` and `Slider` mirror into hidden inputs and
restore their initial value on form reset through `useFormReset`; `Slider`
gained Shift/Page stepping, `inverted`, `minStepsBetweenThumbs`,
`aria-disabled` and per-part data attributes; `RadioGroup` and `Checkbox`
swallow Enter; `Select` labels groups, takes `required` and drops the stale
`aria-activedescendant`; `Tooltip` ignores the focus a click causes and touch
hovers, keeps a caller's `aria-describedby`, closes other tooltips when it
opens and skips its delay shortly after another closed; `Toast` closes on
Escape, focuses its viewport on F8, pauses every toast in a viewport together
and resumes with the remaining time.

Deliberate divergences are `it.skip`s whose title carries the reason:
`ToggleGroup` keeps tamagui's `role="group"` + `aria-pressed` instead of
Radix's radiogroup/toolbar roles; the open trigger of a single,
non-collapsible `Accordion` is not `aria-disabled` because the style system
would dim it; `Toast` is its own live region and has no swipe-to-dismiss;
`Tooltip` content is never hoverable.

**Real browsers.** `examples/catalog/e2e/behaviour.spec.ts` covers what
happy-dom cannot: placement flips and shifts, Tab trapping, wheel scroll
locking, slider and sheet drags, select typeahead and real tooltip/toast
timers. The smoke and leak sweeps run per demo group so a failure names the
group instead of timing out the whole catalog.

**QA.** A third round of cheap agents worked every demo of the eighteen
example screens in both schemes and at 390/768 px with keyboard, pointer and
`__catalog.show` round-trips. The one library finding: an inactive
`Tabs.Content forceMount` panel was a Tab stop, so tabbing out of a pager
focused an off-screen panel and Chromium scrolled the `overflow: hidden`
track to it, permanently desynchronising the pager from its tabs; inactive
panels are now `tabIndex={-1}` and `rovingFocus`/`rovingItems` are exported
for hand-rolled composites. The rest were example bugs (a success state that
replayed on click, a search box wired to nothing, an overlay's open flag held
in persistent demo state, hand-rolled tablists, grids and `role="menu"`
popovers without arrow keys) and are fixed in the examples. The examples'
menus are `Popover`s with menu roles and roving focus; there is still no
`Menu` primitive. Review of that round added a third `reset` element to
`useControllableState` so `RadioGroup` and `Select` form-reset back to "no
selection" (reported as `""`), a `data-handles-escape` marker so Escape on a focused `Toast` no
longer also closes the dialog under it, `aria-labelledby` on `Select.Group`
only when it has a `Select.Label`, and scrollbar-width compensation in the
body scroll lock so opening a modal doesn't shift the page.

## After the real-app round

Two example applications were ported wholesale onto the library —
`examples/obsidian-clone` and `examples/linearlite` — with their hand-written
CSS deleted, and every rough edge the ports hit was fixed in the library or
core rather than worked around in the app.

**Menu.** `Menu` is a new primitive (Trigger, Content, Item, CheckboxItem,
RadioGroup/RadioItem, ItemIndicator, Group, Label, Separator, Arrow) following
the APG menu button pattern and Radix `DropdownMenu`'s keyboard, typeahead and
pointer behaviour, with a 29-test conformance suite. The examples' hand-rolled
`role="menu"` popovers are gone.

**Style system.** Defaulted variants apply before the ones a caller sets, so
`pressTheme` on a `ListItem` beats the `unstyled: false` defaults declared
after it (tamagui applies explicit variants in definition order, which the
port hit as a row that took `pressTheme` but kept `cursor: default`). Every
component suppresses Chrome's focus ring with `outline-style: none` rather
than `outline-width: 0`, which Chrome ignores for its `outline-style: auto`
ring. A `numberOfLines` clamp sets `white-space: normal` so a clamped
subtitle wraps instead of truncating on its first line.

**Components.** `ListItem.Frame` rendered as a `button` or `a` keeps its
native role instead of `role="listitem"`. `Select` no longer needs its items
to be direct VNode descendants: the content stays mounted (hidden) while
closed and items register themselves as they render, publishing the option
list as a fact after the pass when it differs from the first-render guess, so
`Select.Value` and typeahead see items produced by any component. The theme
fact moved from the `ui` entity to `jam-ui` so it cannot collide with an
application's own `ui` facts.

**Core.** The renderer remembers which attributes it set on each element and
sweeps only those, so an attribute or inline style an event handler sets
imperatively (`data-dragging`, a transform during a drag) survives the next
reconcile.

**Conformance.** Suites now also cover `Form`, `Input`/`TextArea`, `Label`,
`Avatar`, `Progress` and `ScrollView`, which fixed `TextArea` dropping its
`defaultValue`, `Progress` emitting `NaN%` for a non-positive `max`, and added
`getValueLabel` plus indicator `data-value`/`data-max`.

**QA.** Cheap agents then worked both apps as a user would — every route in
both schemes and at 390/768/1024/1280 px, keyboard-only, and with the fact
log open. Their findings split three ways. *Library:* `<Button tag="a">`
rendered with `type="button"` and a browser underline, so link-buttons and
`ListItem` link rows carried `textDecorationLine="none"` everywhere; both
now suppress it (tamagui's `reset.css` does the same), the `type` is dropped
for non-button tags, and `ListItem` rows rendered as `button`/`a` get the
pointer cursor. Stacks shrank below their content like ordinary `div`s, so
every fixed-width sidebar, list row and card in the apps carried
`flexShrink={0}`; `Stack` now has React Native's `flex-shrink: 0` /
`flex-basis: auto` and only `ScrollView` shrinks (`flex-shrink: 1`), which
also un-squashed the catalog's Sheet and Tab-bar lists. `Anchor` exists.
`Button.md` documents `theme="blue_accent"` as the coloured CTA, `Slot.md`
that an `asChild` child which is your own component must spread the props it
receives, `Portal.md` that click-away logic should test
`closest("[data-layer], [data-layer-trigger]")` rather than `contains`.
*App bugs worth recording:* linearlite duplicated the overlays' Escape and
click-away handling in its own document listeners, so Escape in a menu inside
the new-issue dialog closed both — the app handlers are gone and the overlays
report through `onOpenChange`; the obsidian seed notes were stamped with
`Date.now()` so a fresh vault said "edited just now". *Deliberately left:*
sidebar collapse on phones, a roving-focus note list and pglite's two
`ErrnoError` page errors on boot.

**Core observation.** A keystroke in the obsidian editor re-expands the whole
tree, ~30 ms with two notes and ~84 ms with forty-two, because any fact
change reruns the single `expandTree` reaction. Nothing in the apps is slow
enough to block on it yet, but it is the ceiling on how large a `@jam/ui` app
can get before renders need to be scoped to the components whose facts
changed.

## After the legibility round

The question this round answered: can an agent read a Jam UI and operate it
without selectors, screenshots or new fact writes? Yes — from what is
already there.

**describeUI().** `@jam/core` reads the VDOM facts the renderer emits (tags,
attributes, text, children) plus the component structure of the mount and
produces an accessibility outline: one node per element with a role, its
accessible name computed the way name-from-content and `aria-labelledby`
compute it, its ARIA/DOM state (`expanded`, `checked`, `value`, `href`,
`level`…), the semantic component that starts there and, in parentheses,
the state keys `drive()` can set with their current values. Unnamed
containers collapse into their parents; `styled()` frames are
`presentational`, so component chains name only function components
(`<IssueRow/ListItemFrame>`, not `<IssueRow/ListItemFrame/ListItem/YStack>`);
children of buttons, images and other children-presentational roles are
dropped, though a misplaced control inside one still surfaces; hidden
subtrees are omitted; portals appear at the root. A component's parts
belong to it even when the page wrote them as its children, so a compound
whose root renders no element of its own (Dialog, Menu, Tooltip, Popover)
starts at its first part and its state appears there — `button "New issue"
… (Dialog open=false)` on the trigger — and `describeUI({ root })` on its id
covers the trigger and the portalled content alike. A drivable component
that renders nothing at all (a Sheet or Toast opened by the program) is
listed as `hidden … (Sheet open=false)` so its state stays readable and
settable. `outlineUI()` is the same tree as text, and a LinearLite list page
comes out at ~60 lines in `interactive` mode.

**drive() / press().** `drive(id, key, value)` finds the nearest component
around an entity id that registered a driver for `key` and calls it, so the
component's own `onChange` runs — controlled or not, and an owner that
declines to change is honoured, exactly as if the user had done it. Native
inputs receive the value with `input`/`change` events. `press(id)` dispatches
`pointerdown`, `mousedown`, focus, `pointerup`, `mouseup` and `click` on the
element in the browser's order (triggers that open on pointerdown open;
tooltips that guard focus against a press stay closed) and falls back to the
`onClick` handler fact when no DOM node exists. Both assert a transient,
non-durable `["drive", …]` fact while their effects happen so a fact log
shows what caused a change; nothing is stored and there is no idle cost. The
effects run outside any action, so each handler's writes render before the
next event, as they do between the events of a user's own input. Ids are
accepted with or without the outline's `#`. `useControllableState`
registers a driver by default, and Slider, Select and the multi-value
Accordion/ToggleGroup register their own, so every stateful `@jam/ui`
component is drivable; a 112-test conformance suite proves it per component
(uncontrolled, controlled, declining owner, from any descendant element,
via `press` on the trigger, and every interactive node named).

**What the consumers found.** `@jam/ui/playwright` (`find`, `pressNode`,
`driveNode`, `outline`) let LinearLite's and the notes app's e2e ceremonies
run the way an agent runs them, and the meta-agent gained `describeUI`,
`drive` and `press` tools. The catalog's `legibility.spec.ts` sweeps every
demo asserting each control has a name; it found the Input, Checkbox,
Switch, RadioGroup and Select demos rendering unlabelled controls (now
labelled) and Checkbox's check glyph naming every checked box "✓" (now
`aria-hidden`). The apps' outlines showed LinearLite's dialog owner
declining `open=true` (its `onOpenChange` only handled closing), avatars
carrying `aria-label` on a `div` (now `role="img"`) and the notes list
naming each note by its whole card text (now by title). Combobox triggers
report the value they show; `data-state` is no longer reported since ARIA
already carries the state it mirrors.

**QA.** Two agents then worked the apps with nothing but `outlineUI()`,
`press()` and `drive()` through a browser CLI — filtering, sorting, changing
status and priority, creating, editing, commenting on and deleting an issue,
switching project; creating, linking and editing notes — and every ceremony
succeeded from the outline alone, each state change confirmed by the next
read. What they could not do was the round's real yield. LinearLite's board
cards could only be moved by mouse (they now carry a status menu, and the
columns are named regions with real headings); the same selection then left
the menu open, because moving the card re-keyed the `Menu` and
`useControllableState` refused to tell a controlled owner about a change
from an unmounted instance (it now does — the change it is reporting may be
what re-keyed it). `press()` on a tooltip trigger opened the tooltip, since
`focus()` came before `pointerdown` and the whole sequence ran in one MobX
action, so the trigger's `close()` read a stale `open` (fixed as above).
`describeUI({ root })` given a component id — the id the outline prints for a
closed dialog — returned nothing once the dialog opened (it now describes the
component's elements, portalled ones included), and labelled a scoped root
with `<App>`, the outermost component begun above it (components begun
before the root now count as seen). `header` inside a column was a `banner`
landmark (now scoped to sectioning content, as HTML-AAM says). Both theme
toggles were named "Toggle theme" with no state (now "Dark theme"
`pressed=true/false`), and the notes inspector's cards had no names in
`interactive` mode (now labelled regions). Findings that were not bugs:
"theme persisted but notes did not" — the notes app has no persistence and
its default theme is dark; the agent had no before-measurement, so its first
press did work. Screenshots the agents took after acting are in
`scratch/qa/` (gitignored). Review of the PR then caught that a component's
parent was the component whose render *created* its vnode, so a
`Dialog.Trigger` a page wrote parented to the page and skipped the `Dialog`:
in an app the dialog's `open` sat on a stray `hidden` node instead of on its
trigger, and `root` on its id found nothing — while the conformance suite,
which writes the parts outside any component, saw the intended tree by
accident. Parents and element owners now follow the tree being expanded.

## Docs as a skill, rendered in the catalog

The per-component reference docs moved out of `packages/ui/docs/` into the
`jam-ui` skill (`.agents/skills/jam-ui/components/<Name>.md`, with
`style-system.md` beside them and `SKILL.md` carrying a generated index by
group), so an agent building on the library finds one skill and one file per
component, while `packages/ui/docs/` keeps the contributor-facing
`AUTHORING.md` and this file (plus a `components` symlink). Each doc opens with
frontmatter — `name`, `group`, `description` — that the catalog now reads
instead of the per-demo `group`/`description` strings it used to duplicate:
the registry attaches demos to docs by name and refuses to start when either
side is missing, which is how `Portal` and `Slot` gained demos (a banner
escaping a clipped card; a card as a `Popover.Trigger`, a standalone merge and
a hand-rolled `asChild`). The catalog renders the doc beneath a component's
demos through Jam components rather than `innerHTML` — headings, paragraphs,
`<pre>`, tables and lists via `marked`'s lexer — so the docs are themed like
the demos, legible to `describeUI()`, and relative links between skill files
navigate within the site — `style-system.md` is a page too, under "Guides",
so `Stacks.md`'s link up to it resolves. `docs.test.ts` in `packages/ui`
checks every doc's frontmatter, lead and Usage section, that every relative
link points at a file in the skill, and that the committed index in
`SKILL.md` matches `pnpm skill-index`; the catalog's `docs.spec.ts` checks
every page renders every section, code block and table of its file, that list
items keep their markers, and that the guide is reachable from the docs. The
site is built by the `Pages` workflow on every push to `main` and published at
https://harry.me/jam/; pull requests run the same production build, which is
what surfaced that `@jam/engine`'s top-level `await` needs an es2022 target.
The root URL is a homepage rendered from the repository README — its title and
lead as a hero over links into the components, the guide and the repo, then the
rest of the README through the same markdown renderer — and each page sets
`document.title` from its doc.
