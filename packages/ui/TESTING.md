# @jam/ui testing

Three layers, cheapest first:

- **Package unit tests** (`pnpm --dir packages/ui test`, also `pnpm test:ui` at
  the root): one `src/components/__tests__/<Component>.test.ts` per component
  plus suites for the style system, tokens, themes, media and layers. They run
  under happy-dom with the helpers in `src/testing.ts` (`render`, `css`,
  `click`, `keydown`, `type`, `resetUI`) and cover tags/roles/aria, default and
  variant styles, and keyboard/pointer behaviour.
  `src/components/__tests__/rendering.test.tsx` mounts components through
  `@jam/core`'s real renderer under jsdom so VDOM emission, DOM patching,
  injected CSS and fact-database state are exercised together.
- **Catalog e2e** (`pnpm --dir examples/catalog test:e2e`, part of the root
  `pnpm test:e2e`): renders every demo of every component in both themes and
  performs each demo's shot recipe (click/hover/focus before capture), failing
  on console errors or missing elements.
- **Screenshots for review** (`pnpm --dir examples/catalog shots`, or
  `SHOTS="Button,Dialog" … shots` for a subset): writes light and dark PNGs to
  `examples/catalog/shots/` for a human or agent to look at. This is a review
  surface, not a pixel-regression suite.

The catalog dev server is `pnpm dev:ui` (or `pnpm --dir examples/catalog dev`);
`CATALOG_PORT` picks the port when several worktrees run at once. See
`docs/AUTHORING.md` for what a new component must ship with and
`.agents/skills/jam-ui-visual-review/SKILL.md` for the browser review workflow.
