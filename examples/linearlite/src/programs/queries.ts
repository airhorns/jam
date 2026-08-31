// Queries — derived views over the facts in memory. The route picks which
// views to derive; each is a whenever() over an engine query that filters,
// sorts, windows or counts the entity facts it needs, and claims
// ["query", name, "row", index, id] plus total/offset/limit/ready meta, so
// components only ever read facts. Only the current project's facts are in
// memory (see subscriptions.ts), which keeps the maintained queries small.

import { $, claim, compileFilter, count, db, limit, offset, orderBy, reaction, replace, when, whenever, type Bindings } from "@jam/core";
import { issueClauses, orderedIssueClauses, type FilterState } from "../filter-state";
import { projectScope } from "../projects";
import { StatusValues } from "../types";
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

function claimRows(name: string, rows: Bindings[], from: number, size: number): void {
  claim("query", name, "offset", from);
  claim("query", name, "limit", size);
  rows.forEach((row, index) => claim("query", name, "row", index, String(row.id)));
}

function claimTotal(name: string, rows: Bindings[]): void {
  claim("query", name, "total", Number(rows[0]?.n ?? 0));
}

/**
 * Run `start` with the value of `read` now and again whenever it changes, disposing
 * the previous run first. Rules started later still belong to the owner active now.
 */
function rederive<T>(read: () => T, equals: (a: T, b: T) => boolean, start: (value: T) => () => void): () => void {
  const ownerId = db.getCurrentOwnerId();
  let stop = () => {};
  const stopReaction = reaction(
    read,
    (value) => {
      stop();
      stop = db.withOwnerScope(ownerId, () => start(value));
    },
    { fireImmediately: true, equals },
  );
  return () => {
    stopReaction();
    stop();
  };
}

function startList(projectId: string, filter: FilterState): () => void {
  const stopTotal = whenever([...issueClauses(projectId, filter), count($.n)], (rows) => claimTotal("list", rows));
  const stopWindow = rederive(
    () => windowFor(Number(when(["ui", "list", "scrollTop", $.y])[0]?.y ?? 0)),
    (a, b) => a.offset === b.offset && a.limit === b.limit,
    (window) =>
      whenever([...orderedIssueClauses(projectId, filter), offset(window.offset), limit(window.limit)], (rows) =>
        claimRows("list", rows, window.offset, window.limit),
      ),
  );
  return () => {
    stopTotal();
    stopWindow();
  };
}

function startBoard(projectId: string, filter: FilterState): () => void {
  const stops = StatusValues.flatMap((status) => {
    const name = `board:${status}`;
    const column: FilterState = { ...filter, status: [status], orderBy: "kanbanorder", orderDirection: "asc" };
    return [
      whenever([...issueClauses(projectId, column), count($.n)], (rows) => claimTotal(name, rows)),
      whenever([...orderedIssueClauses(projectId, column), limit(BOARD_PAGE)], (rows) => claimRows(name, rows, 0, BOARD_PAGE)),
    ];
  });
  return () => stops.forEach((stop) => stop());
}

function startDetail(projectId: string, issueId: string): () => void {
  const stopDetail = whenever([["issue", issueId, "project", projectId]], (rows) => {
    claim("query", "detail", "total", rows.length);
    claimRows("detail", rows.length > 0 ? [{ id: issueId }] : [], 0, rows.length);
  });
  const stopComments = whenever(
    [["comment", $.id, "issue", issueId], ["comment", $.id, "created", $.created], orderBy($.created), orderBy($.id)],
    (rows) => {
      claim("query", "comments", "total", rows.length);
      claimRows("comments", rows, 0, rows.length);
    },
  );
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
  return whenever([["issue", $.id, "project", projectId], count($.n)], (rows) => {
    claim("stats", "issues", "total", Number(rows[0]?.n ?? 0));
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
