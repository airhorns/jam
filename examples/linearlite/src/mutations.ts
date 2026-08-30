// Mutations — plain functions that write facts. The syncTable writer turns
// them into SQL; in Electric mode the table triggers then queue them for the
// write server. Nothing here talks to the database directly except to look up
// a kanban position for a brand new issue.

import { $, _, forget, replace, transaction, when } from "@jam/core";
import type { PGliteInterface } from "@electric-sql/pglite";
import { generateKeyBetween } from "fractional-indexing";
import { USERNAME, type PriorityValue, type StatusValue } from "./types";

export type IssuePatch = Partial<{
  title: string;
  description: string;
  priority: PriorityValue;
  status: StatusValue;
  kanbanorder: string;
}>;

const now = () => new Date().toISOString();

export function updateIssue(id: string, patch: IssuePatch): void {
  transaction(() => {
    for (const [column, value] of Object.entries(patch)) {
      if (value !== undefined) replace("issue", id, column, value);
    }
    replace("issue", id, "modified", now());
  });
}

export interface NewIssue {
  title: string;
  description?: string;
  priority?: PriorityValue;
  status?: StatusValue;
}

export async function createIssue(pg: PGliteInterface, issue: NewIssue): Promise<string> {
  const last = await pg.query<{ kanbanorder: string }>(`SELECT kanbanorder FROM issue ORDER BY kanbanorder DESC LIMIT 1`);
  const kanbanorder = generateKeyBetween(last.rows[0]?.kanbanorder ?? null, null);
  const id = crypto.randomUUID();
  const timestamp = now();
  transaction(() => {
    replace("issue", id, "title", issue.title);
    replace("issue", id, "description", issue.description ?? "");
    replace("issue", id, "priority", issue.priority ?? "none");
    replace("issue", id, "status", issue.status ?? "backlog");
    replace("issue", id, "kanbanorder", kanbanorder);
    replace("issue", id, "username", USERNAME);
    replace("issue", id, "created", timestamp);
    replace("issue", id, "modified", timestamp);
  });
  return id;
}

export function deleteIssue(id: string): void {
  forget("issue", id, _, _);
}

function kanbanorderOf(id: string | undefined): string | null {
  if (!id) return null;
  const match = when(["issue", id, "kanbanorder", $.order])[0];
  return typeof match?.order === "string" ? match.order : null;
}

/** Place an issue between two neighbours in a board column; either neighbour may be absent. */
export function moveIssue(id: string, status: StatusValue, beforeId?: string, afterId?: string): void {
  const before = kanbanorderOf(beforeId);
  const after = kanbanorderOf(afterId);
  let kanbanorder: string;
  try {
    kanbanorder = generateKeyBetween(before, after);
  } catch {
    kanbanorder = generateKeyBetween(before, null);
  }
  updateIssue(id, { status, kanbanorder });
}

export function addComment(issueId: string, body: string): string {
  const id = crypto.randomUUID();
  const timestamp = now();
  transaction(() => {
    replace("comment", id, "issue_id", issueId);
    replace("comment", id, "body", body);
    replace("comment", id, "username", USERNAME);
    replace("comment", id, "created", timestamp);
    replace("comment", id, "modified", timestamp);
  });
  return id;
}
