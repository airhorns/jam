# Jam malleability customization report

Date: 2026-04-13
Repo: `airhorns/jam`

## Executive summary

This report summarizes a customization study on Jam's example apps. The goal was to test the practical version of the "malleable software" hypothesis: can a reasonably small set of state and rendering primitives support meaningful end-user customization, from cosmetic tweaks to invasive data-model changes?

The study used three committed base examples in the repo:

- `examples/counter`
- `examples/folk-todo`
- `examples/puddy-vite`

It also adds and commits two new base examples that are good future customization targets:

- `examples/obsidian-clone`
- `examples/trello-clone`

In total, 24 customizations were implemented in isolated worktrees by subagents:

- 8 for `counter`
- 8 for `folk-todo`
- 8 for `puddy-vite`

The main conclusion is that Jam is already very good at additive customization when the app is fact-centered:

- presentation customizations are straightforward
- small and medium data-shape extensions are usually straightforward
- many invasive feature changes are feasible without framework rewrites

The main friction points were not usually in Jam's core state model. They were mostly in:

- persisted-schema evolution when new joins require new facts
- ordered collections and reordering patterns
- repetitive form/input plumbing
- test-harness drift, especially in `puddy-vite`

## Verified worktree/bootstrap workflow

This is the reliable workflow for experimentation in this repo:

```bash
cd /home/airhorns/code/jam

git worktree add /home/airhorns/code/jam-wt-<name> -b hermes/<name> HEAD
cd /home/airhorns/code/jam-wt-<name>
corepack pnpm install --ignore-scripts
cd examples/<app>
corepack pnpm exec vite --host 127.0.0.1 --port <port>
curl -I http://127.0.0.1:<port>
```

Important environment note: `pnpm` is not directly on PATH in this environment, so `corepack pnpm ...` is the reliable form.

## The two new base examples

### `examples/obsidian-clone`

This app is a strong base example for malleability experiments involving:

- multi-pane document interfaces
- note metadata and organization
- backlinks and link-aware navigation
- derived sidebars and inspectors
- workspace/panel personalization

Why it matters:

- It has a richer information architecture than `counter`.
- It has more user-facing presentation surfaces than `folk-todo`.
- It stresses link-derived views and note-centric data projections that feel realistic for end users.

### `examples/trello-clone`

This app is a strong base example for malleability experiments involving:

- medium-complexity board/task state
- ordering and card movement
- metadata-heavy cards
- inspector/detail panels
- alternate board views and workflow automation

Why it matters:

- It stresses ordered collections and movement between containers.
- It is a natural target for labels, due dates, WIP rules, sorting, swimlanes, and derived workflow views.
- It sits between `folk-todo` and `puddy-vite` in interaction complexity.

## What was implemented in worktrees

### Counter customizations

1. Title + theme personalization
2. Configurable step size + increment/decrement
3. History + undo
4. Goal target + progress meter
5. Milestone celebrations/badges
6. Named multi-counter dashboard
7. Preset/templates
8. Daily reset + streak tracking

### Folk Todo customizations

1. Theme/layout personalization
2. Due dates
3. Priorities
4. Tags/categories + filtering
5. Search + status filters
6. Subtasks/checklists
7. Recurring tasks
8. Manual ordering/reordering

### Puddy customizations

1. Transcript noise filters
2. Pinned/favorite sessions
3. Transcript search/filtering
4. Theme + density personalization
5. Prompt templates / quick actions
6. Session tags/color labels
7. Cost budget alerts
8. Transcript export/archive

## Patterns that worked well

### 1. Additive facts are the sweet spot

The easiest successful extension pattern was:

1. introduce a new fact or small fact family
2. query it with `when(...)`
3. render it directly
4. mutate it with `remember(...)`, `replace(...)`, and `forget(...)`

This made features like these feel very natural:

- priorities
- due dates
- tags
- pinned sessions
- budgets
- session labels
- theme/density preferences
- quick UI filters

Jam's model is strongest when the new feature can be expressed as "more facts about the same entities".

### 2. Presentation-level personalization works very well

Theme, density, layout, badges, warnings, filters, and inspector refinements were generally low-friction.

That is a strong sign for the malleability claim, because many real user customizations are not brand-new apps; they are alternate views over existing shared state.

### 3. Invasive functionality is feasible when the domain model is explicit

Several larger changes worked without major architectural pain:

- single counter -> multi-counter dashboard
- todo list -> recurring tasks + subtasks + ordering
- chat UI -> budget alerts + archive/export + session metadata overlays

This suggests that Jam is not limited to small visual tweaks. It can support meaningful app evolution if the state is explicit and queryable.

### 4. Persistence is valuable when already present

When an example already used `persist(...)`, customization state often became durable with very little extra code. This was particularly useful for:

- personalization preferences
- pinned/favorite state
- added metadata such as labels or budgets

## Main friction points

### 1. Schema evolution against persisted data

This was the most important recurring pain point.

Problem pattern:

- an existing app already has persisted entities
- a new feature adds a required fact to a join
- older persisted entities do not have that fact
- those entities silently disappear from the UI until migrated or backfilled

This happened repeatedly with features like:

- due dates
- priorities
- labels
- other added metadata fields

Jam is expressive enough to solve this, but the repo currently lacks a polished first-class migration/defaulting pattern.

### 2. Ordered collections are possible but manual

History views, task ordering, archives, and dashboard lists all worked, but only after explicitly modeling order or position facts.

There is no high-level convenience layer for:

- append to ordered list
- move item before/after another item
- stable reordering semantics
- derived ordered projections

The model is flexible enough to do this, but it is more manual than it should be.

### 3. Input/form plumbing is repetitive

Controlled-like interactions for:

- text search
- dates
- goals
- budget inputs
- filter controls
- naming/renaming

all worked, but the code is repetitive and low-level. Jam's data primitives are fine here; the gap is ergonomic UI plumbing.

### 4. Test harness quality lags behind the model in richer apps

This was most visible in `puddy-vite`.

Common issues:

- stale browser-helper expectations on `window.__db`
- Playwright configs attaching to the wrong already-running app
- unrelated typing issues in `src/testing/cassette.ts`
- legacy assumptions in browser tests that no longer match current runtime shape

In several cases, the feature itself was easier to build than to prove through the existing end-to-end harness.

This is not a condemnation of Jam's core model. It is a sign that the surrounding example-app QA scaffolding needs maintenance.

## App-by-app findings

### `examples/counter`

#### Strengths

- Lowest conceptual overhead
- Very easy to modify
- Excellent for quickly testing new data and UI primitives
- Good for validating persistence, goals, streaks, presets, and dashboard-like extensions

#### Weaknesses

- Too simple to stress multi-entity extension patterns by itself
- Can overstate ergonomics because there are few joins and little cross-surface coordination

#### Best role

Use it as the "hello world for malleability" and for validating new primitives before trying them in richer examples.

### `examples/folk-todo`

#### Strengths

- Best all-around realism/complexity tradeoff
- Good coverage of:
  - list rendering
  - derived state
  - filtering
  - metadata extension
  - recurring behavior
  - substructures like subtasks
- Existing external-program pattern already demonstrates the Jam idea well

#### Weaknesses

- Persisted-data migration friction shows up quickly
- Reordering and checklist semantics require more explicit modeling than ideal

#### Best role

Use it as the primary benchmark for realistic end-user customization of a small productivity app.

### `examples/puddy-vite`

#### Strengths

- Richest interaction model in the repo
- Very good stress test for:
  - overlay views
  - filtering noisy state
  - per-session metadata
  - budgeting and status overlays
  - archive/export flows
  - personalization of dense interfaces

#### Weaknesses

- Verification story is currently weaker than the implementation story
- Legacy browser test helpers need cleanup
- Harness drift creates false negatives

#### Best role

Use it as the "complex app malleability" benchmark, but invest in repairing its test infrastructure before treating it as the canonical proof point.

## Recommended new primary benchmark set

I recommend the repo explicitly treat these as the main progression of Jam malleability examples:

1. `examples/counter`
   - minimal state and view extension benchmark
2. `examples/folk-todo`
   - realistic small productivity-app benchmark
3. `examples/trello-clone`
   - medium-complexity ordering/workflow benchmark
4. `examples/obsidian-clone`
   - knowledge-work / multi-pane / graph-derived-view benchmark
5. `examples/puddy-vite`
   - complex interactive app benchmark

That set covers:

- simple scalar state
- list/task state
- ordered board state
- linked-document state
- dense streaming/session state

which is a much better test surface than a minimal smoke-test trio alone.

## Concrete suggestions for Jam itself

### 1. Add typed entity/schema helpers

Most successful extensions still involved hand-written joins and hand-written fact conventions.

A good next step would be a small helper layer for declaring entity-like shapes, for example:

- todo has `title`, `done`, `priority`, `dueDate`
- session has `status`, `favorite`, `label`, `budget`
- note has `title`, `body`, `updatedAt`

Goals:

- reduce brittle join changes
- make schema evolution easier to reason about
- centralize defaulting and validation

### 2. Add first-class migration/defaulting patterns

Needed capabilities:

- ensure missing fields get defaults without losing old entities from joins
- run app startup migrations safely after `persist()` restore
- make extension programs able to supply defaults without a lot of boilerplate

This was the most obvious product gap exposed by the experiments.

### 3. Add ordered-collection utilities

This could be modest but high-value. Examples:

- append item with next order
- swap neighbors atomically
- move item before/after another item
- stable sorting helpers

This would simplify:

- task ordering
- card ordering
- archives/history
- multi-panel list UIs

### 4. Add form/input helpers

A tiny layer for common controlled-like patterns would remove a lot of repetitive plumbing for:

- text inputs
- numeric inputs
- date inputs
- toggle groups
- chips/filters

Jam does not need a whole alternate component model here; even a few helpers would materially improve ergonomics.

### 5. Add derived/computed selector helpers

The current pattern often becomes:

- `when(...)`
- cast values
- sort/filter/map in plain JS

That works, but gets verbose.

A small helper layer for common derived selector patterns would make the code shorter and safer.

### 6. Stabilize example-app browser testing conventions

Specifically:

- standardize what gets exposed on `window.__db`
- provide one blessed browser-seeding/test-helper API
- use fixed non-conflicting Playwright port patterns
- disable accidental `reuseExistingServer` where it causes false attachment to unrelated apps

This is one of the highest-leverage non-runtime improvements available.

## Suggestions for the example repo itself

### 1. Document the worktree workflow explicitly

The worktree pattern used in this study worked very well and should be documented in repo docs for future experimentation.

### 2. Add a small customization benchmark matrix to docs

For each example app, document likely extension categories:

- presentation
- metadata/data shape
- filtering/search
- ordering/workflow
- persistence/migration
- export/integration

### 3. Promote `obsidian-clone` and `trello-clone` as official benchmarks

These should not just sit as examples. They fill important gaps in the repo's current benchmark surface.

### 4. Repair `puddy-vite` test harness drift

This is the single most important repo-maintenance suggestion from the study.

Without this, complex-app customization results will keep being undercut by test friction unrelated to the underlying implementation quality.

## Conclusion

The study supports the practical core of the Jam malleability hypothesis.

The strongest evidence is not that Jam can render a to-do list differently. It is that a shared fact model made it possible to add and verify many kinds of end-user customization across multiple domains:

- counters and habits
- task management
- linked notes
- kanban workflow
- chat/session tooling

The main limitations were mostly ergonomic and infrastructural, not conceptual.

In other words:

- the state model is already strong
- the missing pieces are schema-evolution support, ordering helpers, form ergonomics, and a more reliable browser test harness

If those are improved, Jam's claim to support genuinely malleable end-user software will be substantially stronger.

## Assets

Screenshots for the two new base examples have been moved under:

- `docs/reports/assets/obsidian-clone.png`
- `docs/reports/assets/trello-clone.png`
