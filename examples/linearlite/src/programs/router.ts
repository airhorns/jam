// Router — the current URL is a single fact, ["route", "url", "/p1/board?status=todo"].
// Components parse it with currentRoute(); programs react to it with whenever().
// Every page lives under a project: /:projectId, /:projectId/board,
// /:projectId/search, /:projectId/issue/:issueId. "/" redirects to the first project.

import { $, replace, when, whenever } from "@jam/core";
import { filterStateFromParams, type FilterState } from "../filter-state";
import { listProjects, projectPath } from "../projects";

export type Page = "home" | "list" | "search" | "board" | "issue";

export interface Route {
  url: string;
  page: Page;
  /** Path without the query string; filter changes are applied on top of it. */
  path: string;
  params: URLSearchParams;
  projectId?: string;
  issueId?: string;
  filter: FilterState;
}

export function parseRoute(url: string): Route {
  const parsed = new URL(url, "http://localhost");
  const path = parsed.pathname;
  const params = parsed.searchParams;
  const filter = filterStateFromParams(params);
  const [projectPart, ...rest] = path.split("/").filter(Boolean);
  if (!projectPart) return { url, page: "home", path, params, filter };
  const projectId = decodeURIComponent(projectPart);
  const base = { url, path, params, projectId, filter };
  if (rest[0] === "issue" && rest[1]) return { ...base, page: "issue", issueId: decodeURIComponent(rest[1]) };
  if (rest[0] === "board") return { ...base, page: "board" };
  if (rest[0] === "search") return { ...base, page: "search" };
  return { ...base, page: "list" };
}

export function currentRoute(): Route {
  const url = when(["route", "url", $.url])[0]?.url;
  return parseRoute(typeof url === "string" ? url : "/");
}

function locationUrl(): string {
  return location.pathname + location.search;
}

export function navigate(url: string, { replace: replaceHistory = false }: { replace?: boolean } = {}): void {
  if (url === locationUrl()) return;
  if (replaceHistory) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  replace("route", "url", url);
}

export function startRouter(): () => void {
  replace("route", "url", locationUrl());
  const onPopState = () => replace("route", "url", locationUrl());
  window.addEventListener("popstate", onPopState);
  const stopHome = whenever([["route", "url", $.url], ["project", $.id, "created", $.created]], ([match]) => {
    if (!match || parseRoute(String(match.url)).page !== "home") return;
    const [first] = listProjects();
    if (first) queueMicrotask(() => navigate(projectPath(first.id), { replace: true }));
  });
  return () => {
    stopHome();
    window.removeEventListener("popstate", onPopState);
  };
}
