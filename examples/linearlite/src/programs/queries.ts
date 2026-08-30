// Queries — derived views over the facts in memory. The route picks which
// views to derive; each is a whenever() over the entity facts it needs that
// claims ["query", name, "row", index, id] plus total/offset/limit/ready meta,
// so components only ever read facts. Only the current project's facts are in
// memory (see subscriptions.ts), which keeps these passes small.

import { $, claim, compileFilter, replace, whenever, type Bindings } from "@jam/core";
import { filterIssues, sortIssues, type FilterState } from "../filter-state";
import { projectScope } from "../projects";
import { StatusValues, type Comment, type Issue } from "../types";
import { parseRoute, type Route } from "./router";

export const ROW_HEIGHT = 36;
export const LIST_CHUNK = 50;
export const LIST_WINDOW = LIST_CHUNK * 2;
export const BOARD_PAGE = 50;

/** The window of rows to keep in facts for a list scrolled to `scrollTop`: the visible chunk plus one on each side. */
export function windowFor(scrollTop: number): { offset: number; limit: number } {
  const firstVisible = Math.floor(Math.max(0, scrollTop) / ROW_HEIGHT);
  const offset = Math.max(0, Math.floor(firstVisible / LIST_CHUNK) * LIST_CHUNK - LIST_CHUNK);
  return { offset, limit: LIST_WINDOW };
}

export type Entity<T> = Partial<T> & { id: string };

/** Group [entity, id, column, value] bindings into one record per id. */
export function collect<T>(rows: Bindings[]): Entity<T>[] {
  const records = new Map<string, Entity<T>>();
  for (const { id, col, val } of rows) {
    const key = String(id);
    const record = records.get(key) ?? ({ id: key } as Entity<T>);
    (record as { [column: string]: unknown })[String(col)] = val;
    records.set(key, record);
  }
  return [...records.values()];
}

const ISSUE = ["issue", $.id, $.col, $.val] as const;
const COMMENT = ["comment", $.id, $.col, $.val] as const;

function emitRows(name: string, ids: string[], total: number, offset = 0, limit = ids.length): void {
  claim("query", name, "total", total);
  claim("query", name, "offset", offset);
  claim("query", name, "limit", limit);
  ids.forEach((id, index) => claim("query", name, "row", index, id));
}

function startList(projectId: string, filter: FilterState): () => void {
  return whenever([[...ISSUE], ["ui", "list", "scrollTop", $.y]], (matches) => {
    const issues = collect<Issue>(matches).filter((issue) => issue.project === projectId);
    const ordered = sortIssues(filterIssues(issues, filter), filter);
    const { offset, limit } = windowFor(Number(matches[0]?.y ?? 0));
    const ids = ordered.slice(offset, offset + limit).map((issue) => issue.id);
    emitRows("list", ids, ordered.length, offset, limit);
  });
}

function startBoard(projectId: string, filter: FilterState): () => void {
  return whenever([[...ISSUE]], (matches) => {
    const issues = collect<Issue>(matches).filter((issue) => issue.project === projectId);
    for (const status of StatusValues) {
      const column = { ...filter, status: [status], orderBy: "kanbanorder", orderDirection: "asc" as const };
      const ordered = sortIssues(filterIssues(issues, column), column);
      emitRows(`board:${status}`, ordered.slice(0, BOARD_PAGE).map((issue) => issue.id), ordered.length, 0, BOARD_PAGE);
    }
  });
}

function startDetail(projectId: string, issueId: string): () => void {
  const stopDetail = whenever([["issue", issueId, "project", $.project]], ([match]) => {
    const present = match?.project === projectId;
    emitRows("detail", present ? [issueId] : [], present ? 1 : 0);
  });
  const stopComments = whenever([[...COMMENT]], (matches) => {
    const comments = collect<Comment>(matches)
      .filter((comment) => comment.issue === issueId)
      .sort((a, b) => String(a.created ?? "").localeCompare(String(b.created ?? "")) || a.id.localeCompare(b.id));
    emitRows("comments", comments.map((comment) => comment.id), comments.length);
  });
  return () => {
    stopDetail();
    stopComments();
  };
}

/** Every view on a page reports ready once the project's subscription has delivered its initial facts. */
function startReadiness(projectId: string, names: string[]): () => void {
  const shape = compileFilter({ scope: projectScope(projectId) }).id;
  return whenever([["sync", "shape", shape, "ready", $.ready]], ([match]) => {
    for (const name of names) claim("query", name, "ready", match?.ready === true);
  });
}

function startStats(projectId: string): () => void {
  return whenever([["issue", $.id, "project", projectId]], (matches) => {
    claim("stats", "issues", "total", matches.length);
  });
}

function startPage(route: Route): () => void {
  const { projectId } = route;
  if (!projectId) return () => {};
  const stops = [startStats(projectId)];
  switch (route.page) {
    case "list":
    case "search":
      // The list container is keyed by URL, so a route change lands on a fresh, unscrolled element.
      replace("ui", "list", "scrollTop", 0);
      stops.push(startList(projectId, route.filter), startReadiness(projectId, ["list"]));
      break;
    case "board":
      stops.push(
        startBoard(projectId, route.filter),
        startReadiness(projectId, StatusValues.map((status) => `board:${status}`)),
      );
      break;
    case "issue":
      stops.push(startDetail(projectId, route.issueId!), startReadiness(projectId, ["detail", "comments"]));
      break;
  }
  return () => stops.forEach((stop) => stop());
}

export function startQueries(): () => void {
  let stopPage = () => {};
  const stopRoute = whenever([["route", "url", $.url]], ([match]) => {
    stopPage();
    stopPage = match ? startPage(parseRoute(String(match.url))) : () => {};
  });
  return () => {
    stopPage();
    stopRoute();
  };
}
