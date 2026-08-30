// Projects partition the facts: every issue and comment of a project lives in
// the `project:<id>` scope, so a client only syncs the project it is looking at.

import { $, when } from "@jam/core";
import { collect } from "./facts";
import type { Project } from "./types";

export { projectScope } from "./types";

export function projectPath(projectId: string, sub = ""): string {
  return `/${encodeURIComponent(projectId)}${sub}`;
}

/** Every known project, oldest first. */
export function listProjects(): Project[] {
  return collect<Project>(when(["project", $.id, $.col, $.val]))
    .filter((p): p is Project => typeof p.name === "string" && typeof p.created === "string")
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}
