# Example UIs

Composite screens built only from `@jam/ui` components, modelled on tamagui's
Bento and demo screens. They exist to exercise the library the way an app
would, so anything awkward to build here is a library bug worth fixing in
`packages/ui`, not something to work around in the example.

## Conventions

- One file per example exporting an `ExampleDemos` (name, one-line
  description, demos), registered in `../../registry.ts`. Each `demos[]` entry is one self-contained
  variant; give interactive states a `shot` recipe (`click`/`hover`/`focus` by
  `data-testid`, plus `wait` ms) so `pnpm shots` captures them.
- Import `h` from `@jam/core/jsx` in every file. Components are plain
  functions that re-run whenever a fact they read changes; there are no hooks
  or lifecycle. Keep demo state in the fact DB with `useDemoState(key, initial)`
  (strings, numbers, booleans; JSON-encode anything richer) and namespace keys
  by example, e.g. `"store.cart"`.
- DOM ids are global addresses. Derive them with `useStableId()` from
  `@jam/ui` (or a prefix prop) so two copies of a screen can coexist.
- Icons come from `./icons.ts` (Lucide, `<SearchIcon size={16} />`); frames
  from `./shared.tsx` (`PhoneFrame` for mobile shells, `Page` for desktop).
- Prefer tokens (`$space.3`, `$color11`, `$radius.4`, `size="$3"`) and theme
  names (`theme="accent"`, `theme="blue"`) over literal values, so every
  example works in both light and dark.

## Checking your work

The catalog dev server must be running (`pnpm dev`, or an existing one on
`CATALOG_PORT`). Then:

```sh
pnpm exec tsc --noEmit -p .
SHOTS="Store" CATALOG_PORT=5176 pnpm shots      # shots/Store.<theme>.png + one per recipe
CATALOG_PORT=5176 pnpm test:e2e                 # every example renders, no console errors
```

Open the PNGs and look at them. For ad-hoc probing, `window.__catalog.show(
name, theme, demoIndex)` swaps the visible demo without a reload.
