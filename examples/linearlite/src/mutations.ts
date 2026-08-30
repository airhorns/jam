// Mutations — plain functions that write facts. Core's sync() stores them and
// ships them to the server; nothing here knows about a database. A new issue
// or comment is created inside scoped() so it lands in its project's
// partition; later edits inherit that scope from the entity.

import { $, _, forget, replace, scoped, transaction, when } from "@jam/core";
import { generateKeyBetween } from "fractional-indexing";
import { listProjects, projectScope } from "./projects";
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

function lastKanbanorder(projectId: string): string | null {
  let last: string | null = null;
  for (const { order } of when(["issue", $.id, "project", projectId], ["issue", $.id, "kanbanorder", $.order])) {
    if (typeof order === "string" && (last === null || order > last)) last = order;
  }
  return last;
}

export function createIssue(projectId: string, issue: NewIssue): string {
  const id = crypto.randomUUID();
  const timestamp = now();
  const kanbanorder = generateKeyBetween(lastKanbanorder(projectId), null);
  scoped(projectScope(projectId), () => {
    replace("issue", id, "project", projectId);
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
  transaction(() => {
    for (const { comment } of when(["comment", $.comment, "issue", id])) forget("comment", comment, _, _);
    forget("issue", id, _, _);
  });
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
  const projectId = when(["issue", issueId, "project", $.project])[0]?.project;
  if (typeof projectId !== "string") throw new Error(`addComment: issue ${issueId} is not loaded`);
  const id = crypto.randomUUID();
  const timestamp = now();
  scoped(projectScope(projectId), () => {
    replace("comment", id, "issue", issueId);
    replace("comment", id, "body", body);
    replace("comment", id, "username", USERNAME);
    replace("comment", id, "created", timestamp);
    replace("comment", id, "modified", timestamp);
  });
  return id;
}

export function projectIdFor(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const taken = new Set(listProjects().map((p) => p.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function createProject(name: string, key = name.slice(0, 3).toUpperCase()): string {
  const id = projectIdFor(name);
  transaction(() => {
    replace("project", id, "name", name);
    replace("project", id, "key", key);
    replace("project", id, "created", now());
  });
  return id;
}
