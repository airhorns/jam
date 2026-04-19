# HAR-90 land skill investigation

Date: 2026-04-19
Repo: `airhorns/jam`
Related ticket: `HAR-86`
Related PR: `https://github.com/airhorns/jam/pull/11`

## Summary

The HAR-86 agent did not fail because of the Jam UI implementation, tests, CI, PR metadata, or review feedback. It reached the merge phase after PR #11 had passing checks and an approval, then stopped because the orchestration contract required a repo-local land workflow at `.codex/skills/land/SKILL.md`.

That file does not exist in this repository checkout. There is no `.codex` directory, no `.agents/skills/land` directory, and no alternate repo-local land skill found under another name.

The most likely cause is a workflow/repository mismatch: the orchestration instructions referenced a `land` skill path that was not present in the Jam workspace or committed tree. The prior agent's blocker note was accurate for the workspace it had.

## Timeline From HAR-86

- 2026-04-19 20:56 UTC: PR #11 was opened from `harrymees/har-86-setup-storybook-component-tests-for-the-jamui-package`.
- 2026-04-19 20:59 UTC: GitHub CI Baseline checks were green for the PR head.
- 2026-04-19 21:04 UTC: PR #11 was approved.
- 2026-04-19 21:05 UTC: HAR-86 workpad recorded the merge blocker: required `.codex/skills/land/SKILL.md` was missing, and the workflow prohibited calling `gh pr merge` directly.
- 2026-04-19 21:17 UTC: PR #11 was merged as commit `4b0d211`.

## Repository Evidence

Root directory inspection shows `.agents` exists, but `.codex` does not:

```text
./.agents
```

Repo-local skill files in the current tree are:

```text
./.agents/skills/agent-browser/SKILL.md
./.agents/skills/jam-browser-validation/SKILL.md
./.agents/skills/jam-native/SKILL.md
./.agents/skills/jam-runtime-logs/SKILL.md
./.agents/skills/jam-ui-visual-review/SKILL.md
```

Targeted path checks all failed:

```text
missing .codex/skills/land/SKILL.md
missing .agents/skills/land/SKILL.md
missing .agents/skills/jam-land/SKILL.md
```

Broad repository search before this report was added for `land`, `landing`, `skills/land`, `land/SKILL`, and merge-workflow wording found no land skill. The only skill-related text match outside skill files was the Jam UI visual review skill reference in `packages/jamagui/TESTING.md` plus `skills-lock.json`.

`skills-lock.json` only locks the imported `agent-browser` skill:

```json
{
  "version": 1,
  "skills": {
    "agent-browser": {
      "source": "vercel-labs/agent-browser",
      "sourceType": "github",
      "computedHash": "fc173a14ecea820739ea971bf81eddbf94e12ce99312fb83e55342724316c5dd"
    }
  }
}
```

Git history for `.codex`, `.agents`, and `skills-lock.json` in this checkout shows only the HAR-86 skill additions and `agent-browser` lockfile entry. It does not show a prior land skill path.

## Conclusion

The land skill does not exist anywhere in the provided Jam repository copy. The HAR-86 agent looked for the required path during the `Merging` phase and correctly reported that it was missing.

The actionable fix is outside the HAR-86 implementation: either provide a repo-local `.codex/skills/land/SKILL.md` workflow that the orchestration contract can load, or change the orchestration contract to point at the actual landing mechanism available to agents.
