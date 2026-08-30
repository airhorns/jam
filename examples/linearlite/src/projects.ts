// Projects partition the facts: every issue and comment of a project lives in
// the `project:<id>` scope, so a client only syncs the project it is looking at.

import { $, when } from "@jam/core";
import type { Project } from "./types";

export { projectScope } from "./types";

export function projectPath(projectId: string, sub = ""): string {
  return `/${encodeURIComponent(projectId)}${sub}`;
}

/** Every known project, oldest first. */
export function listProjects(): Project[] {
  const projects = new Map<string, Partial<Project>>();
  for (const { id, col, val } of when(["project", $.id, $.col, $.val])) {
    const project = projects.get(String(id)) ?? { id: String(id) };
    (project as Record<string, unknown>)[String(col)] = val;
    projects.set(String(id), project);
  }
  return [...projects.values()]
    .filter((p): p is Project => typeof p.name === "string" && typeof p.created === "string")
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

export function readProject(projectId: string): Project | undefined {
  return listProjects().find((p) => p.id === projectId);
}
