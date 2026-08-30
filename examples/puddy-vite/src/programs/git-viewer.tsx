// Git Viewer - optional IDE-style status module for the current worktree.
//
// Polls the local Vite git-state endpoint, writes compact git facts into Jam's
// database, and injects a dense clickable status view into the connection bar.

import { h } from "@jam/core/jsx";
import { program } from "@jam/core";
import { Button, Text, XStack, YStack } from "@jam/ui";

interface GitFile {
  path: string;
  index: string;
  workingTree: string;
  kind: string;
}

interface GitCommit {
  hash: string;
  subject: string;
}

interface GitState {
  branch: string;
  upstream: string;
  head: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  files: GitFile[];
  commits: GitCommit[];
  lastCommit: string;
  updatedAt: string;
}

const POLL_MS = 5000;

function formatSummary(state: GitState) {
  if (!state.dirty) return "clean";
  const parts = [
    state.staged > 0 ? `${state.staged} staged` : "",
    state.unstaged > 0 ? `${state.unstaged} modified` : "",
    state.untracked > 0 ? `${state.untracked} untracked` : "",
  ].filter(Boolean);
  return parts.join(", ") || "dirty";
}

export const dispose = program("puddy-vite/git-viewer", ({
  $,
  _,
  db,
  forget,
  remember,
  replace,
  transaction,
  when,
  whenever,
  injectVdom,
}) => {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function forgetInjectedGitViewer() {
    for (const fact of Array.from(db.facts.values())) {
      const entity = fact[0];
      const isGitViewerNode =
        typeof entity === "string" && entity.startsWith("connection-bar:1000");
      const isGitViewerChild =
        fact[0] === "connection-bar" && fact[1] === "child" && fact[2] === 1000;

      if (isGitViewerNode || isGitViewerChild) {
        forget(...fact);
      }
    }
  }

  replace("git", "viewer", "open", false);
  replace("git", "status", "available", false);
  forgetInjectedGitViewer();

  async function refreshGitState() {
    try {
      const response = await fetch("/__puddy/git-state", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`git state request failed: ${response.status}`);
      }
      const state = (await response.json()) as GitState;
      const summary = formatSummary(state);

      transaction(() => {
        replace("git", "status", "available", true);
        replace("git", "status", "branch", state.branch);
        replace("git", "status", "upstream", state.upstream);
        replace("git", "status", "head", state.head);
        replace("git", "status", "ahead", state.ahead);
        replace("git", "status", "behind", state.behind);
        replace("git", "status", "dirty", state.dirty);
        replace("git", "status", "summary", summary);
        replace("git", "status", "lastCommit", state.lastCommit);
        replace("git", "status", "updatedAt", state.updatedAt);
        forget("git", "file", _, _, _, _);
        forget("git", "commit", _, _, _);
        for (const file of state.files.slice(0, 12)) {
          remember("git", "file", file.path, file.kind, file.index, file.workingTree);
        }
        for (const commit of state.commits.slice(0, 6)) {
          remember("git", "commit", commit.hash, commit.subject, state.upstream);
        }
      });
    } catch (error) {
      transaction(() => {
        replace("git", "status", "available", false);
        replace(
          "git",
          "status",
          "error",
          error instanceof Error ? error.message : String(error),
        );
      });
    }
  }

  function scheduleRefresh() {
    if (disposed) return;
    timer = setTimeout(() => {
      void refreshGitState().finally(scheduleRefresh);
    }, POLL_MS);
  }

  void refreshGitState().finally(scheduleRefresh);
  window.addEventListener("focus", refreshGitState);

  const uiDispose = whenever(
    [
      ["git", "status", "available", true],
      ["git", "status", "branch", $.branch],
      ["git", "status", "ahead", $.ahead],
      ["git", "status", "behind", $.behind],
      ["git", "status", "dirty", $.dirty],
      ["git", "status", "summary", $.summary],
      ["git", "status", "upstream", $.upstream],
      ["git", "status", "head", $.head],
      ["git", "status", "lastCommit", $.lastCommit],
      ["git", "status", "updatedAt", $.updatedAt],
      ["git", "viewer", "open", $.open],
    ],
    (matches) => {
      const state = matches[0];
      if (!state) return;

      const open = state.open === true;
      const dirty = state.dirty === true;
      const files = when(["git", "file", $.path, $.kind, $.index, $.workingTree]);
      const commits = when(["git", "commit", $.hash, $.subject, $.upstreamForCommit]);
      const branch = state.branch as string;
      const ahead = state.ahead as number;
      const behind = state.behind as number;
      const summary = state.summary as string;

      forgetInjectedGitViewer();
      injectVdom(
        "connection-bar",
        1000,
        <XStack class="git-viewer" data-testid="git-viewer" gap="$space.2">
          <Button
            class={`git-viewer-trigger ${dirty ? "git-viewer-dirty" : "git-viewer-clean"}`}
            data-testid="git-viewer-trigger"
            size="1"
            variant="ghost"
            title="Show git state"
            onClick={() => replace("git", "viewer", "open", !open)}
          >
            <Text class="git-viewer-branch">{branch}</Text>
            <Text class="git-viewer-pill">{dirty ? "dirty" : "clean"}</Text>
            <Text class="git-viewer-count">{`+${ahead}`}</Text>
          </Button>

          {open ? (
            <YStack class="git-viewer-panel" data-testid="git-viewer-panel" gap="$space.3">
              <XStack justifyContent="space-between" gap="$space.4">
                <YStack gap="$space.1">
                  <Text class="git-viewer-label">Branch</Text>
                  <Text class="git-viewer-value">{branch}</Text>
                </YStack>
                <YStack gap="$space.1" alignItems="flex-end">
                  <Text class="git-viewer-label">Ahead / behind</Text>
                  <Text class="git-viewer-value">{`+${ahead} / -${behind}`}</Text>
                </YStack>
              </XStack>

              <YStack gap="$space.1">
                <Text class="git-viewer-label">Base</Text>
                <Text class="git-viewer-value">{state.upstream as string}</Text>
              </YStack>

              <YStack gap="$space.1">
                <Text class="git-viewer-label">Working tree</Text>
                <Text class="git-viewer-value">{summary}</Text>
              </YStack>

              <YStack gap="$space.1">
                <Text class="git-viewer-label">Last commit</Text>
                <Text class="git-viewer-value">{state.lastCommit as string}</Text>
              </YStack>

              {commits.length > 0 ? (
                <YStack gap="$space.1">
                  <Text class="git-viewer-label">Ahead commits</Text>
                  {commits.map((commit) => (
                    <Text class="git-viewer-row" key={`git-commit-${commit.hash}`}>
                      {`${commit.hash} ${commit.subject}`}
                    </Text>
                  ))}
                </YStack>
              ) : null}

              <YStack gap="$space.1">
                <Text class="git-viewer-label">Changed files</Text>
                {files.length > 0 ? files.map((file) => (
                  <Text class="git-viewer-row" key={`git-file-${file.path}`}>
                    {`${file.kind} ${file.path}`}
                  </Text>
                )) : (
                  <Text class="git-viewer-row">Clean working tree</Text>
                )}
              </YStack>

              <Text class="git-viewer-meta">{`HEAD ${state.head} / ${state.updatedAt}`}</Text>
            </YStack>
          ) : null}
        </XStack>,
      );
    },
  );

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener("focus", refreshGitState);
    forgetInjectedGitViewer();
    uiDispose();
  };
});
