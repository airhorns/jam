# obsidian-clone

A small Jam example app inspired by Obsidian-style note taking.

## What it demonstrates

- multi-pane document UI
- note list + editor + inspector layout
- explicit note facts in the Jam database
- wikilinks, backlinks, outline extraction, and note stats
- unit and Playwright coverage

## Scripts

```bash
corepack pnpm install
corepack pnpm dev          # serves on http://localhost:5175
corepack pnpm test         # vitest
corepack pnpm test:e2e     # playwright
corepack pnpm typecheck
corepack pnpm build
```

## Why this is a useful base example

This app is a good target for malleable-software experiments because non-technical users often want to customize:

- note metadata and templates
- panel visibility and density
- backlinks, graph, and navigation aids
- organization rules such as tags or workspaces

The model is small enough to understand quickly, but rich enough to stress presentation, functionality, and data extensions.
