---
name: land
description: Land an approved Jam pull request from the Merging state using the local git remote and authenticated gh CLI.
allowed-tools: Bash(git:*), Bash(gh:*)
---

# Land

Use this skill when a Jam ticket is in `Merging`, or when asked to land an
approved Jam pull request. Use only the local repository checkout plus the
host-authenticated `gh` CLI for GitHub actions.

## Preconditions

1. Confirm the Linear issue is in `Merging`.
2. Identify the existing open PR for the issue. Do not open a replacement PR.
3. Confirm the PR is approved and has no unresolved requested changes.
4. Confirm required checks are green on the latest PR head.
5. Confirm there are no actionable top-level or inline PR comments left.
6. Confirm the working tree is clean.

Useful commands:

```bash
git status --short --branch
gh pr view <pr-number> --repo airhorns/jam --json state,reviewDecision,reviews,comments,statusCheckRollup,mergeStateStatus,headRefName,baseRefName,url
gh api repos/airhorns/jam/pulls/<pr-number>/comments --paginate
gh pr checks <pr-number> --repo airhorns/jam --watch=false
```

If any precondition fails, do not merge. Move the issue back to the appropriate
workflow state and record the blocker or requested rework in the ticket workpad.

## Land Loop

1. Sync refs:

```bash
git fetch origin main
```

2. Re-check PR state, review decision, merge state, inline comments, and checks.

3. Merge with the repository's normal merge-commit flow:

```bash
gh pr merge <pr-number> --repo airhorns/jam --merge --delete-branch
```

4. Verify the PR is merged and `origin/main` contains the merge:

```bash
gh pr view <pr-number> --repo airhorns/jam --json state,mergedAt,mergeCommit,url
git fetch origin main
git log --oneline -1 origin/main
```

5. Move the Linear issue to `Done` and update the workpad with the merge commit,
validation summary, and any residual notes.

## Guardrails

- Never use GitHub connector or MCP tools for GitHub actions in this repository.
- Never land a PR with failing or pending required checks.
- Never land a PR with unresolved requested changes or actionable review comments.
- Never create a replacement PR for rework; update the existing PR branch.
- If `gh pr merge` reports conflicts, missing permissions, branch protection, or
  another merge blocker, stop and record the exact blocker in the workpad.
