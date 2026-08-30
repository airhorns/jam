// Recently viewed issues — local-only state that outlives the project
// subscription it points into, so it is persisted rather than synced.

import { $, _, forget, replace, transaction, when, whenever } from "@jam/core";

export const MAX_RECENT = 5;

export function recordRecent(id: string, projectId: string, title: string): void {
  transaction(() => {
    replace("recent", id, "viewedAt", Date.now());
    replace("recent", id, "project", projectId);
    replace("recent", id, "title", title);
    const older = when(["recent", $.id, "viewedAt", $.at])
      .filter((r) => r.id !== id)
      .sort((a, b) => Number(b.at) - Number(a.at));
    for (const stale of older.slice(MAX_RECENT - 1)) forget("recent", stale.id, _, _);
  });
}

export function forgetRecent(id: string): void {
  forget("recent", id, _, _);
}

/** Record an issue as recently viewed once its detail view has it; keeps the stored title fresh while it is open. */
export function startRecent(): () => void {
  return whenever(
    [
      ["query", "detail", "row", 0, $.id],
      ["issue", $.id, "project", $.project],
      ["issue", $.id, "title", $.title],
    ],
    ([match]) => {
      if (match) queueMicrotask(() => recordRecent(String(match.id), String(match.project), String(match.title)));
    },
  );
}
