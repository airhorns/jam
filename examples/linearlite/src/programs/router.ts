// Router — the current URL is a single fact, ["route", "url", "/board?status=todo"].
// Components parse it with currentRoute(); programs react to it with whenever().

import { $, replace, when } from "@jam/core";
import { filterStateFromParams, type FilterState } from "../filter-state";

export type Page = "list" | "search" | "board" | "issue";

export interface Route {
  url: string;
  page: Page;
  path: string;
  params: URLSearchParams;
  issueId?: string;
  filter: FilterState;
}

export function parseRoute(url: string): Route {
  const parsed = new URL(url, "http://localhost");
  const path = parsed.pathname;
  const params = parsed.searchParams;
  const issue = path.match(/^\/issue\/([^/]+)$/);
  const page: Page = issue ? "issue" : path === "/board" ? "board" : path === "/search" ? "search" : "list";
  return { url, page, path, params, issueId: issue?.[1], filter: filterStateFromParams(params) };
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
  return () => window.removeEventListener("popstate", onPopState);
}
