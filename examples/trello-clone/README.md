# trello-clone

A small Jam example app inspired by Trello-style kanban boards.

## What it demonstrates

- explicit board / column / card facts in the Jam database
- multi-column task layout
- card creation and movement between columns
- detail inspector pattern
- unit and Playwright coverage

## Scripts

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm test         # vitest
corepack pnpm test:e2e     # playwright
corepack pnpm typecheck
corepack pnpm build
```

## Why this is a useful base example

This app is a good target for malleable-software experiments because non-technical users often want to customize:

- task metadata such as labels, due dates, and assignees
- card sorting, filtering, and board views
- workflow rules and automation
- alternate presentation modes for boards and inspectors

It is a strong medium-complexity example for testing data-shape changes and functional extensions.
