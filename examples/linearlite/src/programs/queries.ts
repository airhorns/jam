// Queries — turns the current route into syncTable bindings. Rows land as
// ["issue", id, col, val] / ["comment", id, col, val] facts and ordering as
// ["query", name, "row", index, id]; components only ever read facts.

import { $, replace, syncTable, whenever, type JamPGlite, type SyncedTable } from "@jam/core";
import { filterStateToSql } from "../filter-state";
import { LOCAL_STATE_COLUMNS, StatusValues } from "../types";
import { parseRoute, type Route } from "./router";

export const ROW_HEIGHT = 36;
export const LIST_CHUNK = 50;
export const LIST_WINDOW = LIST_CHUNK * 2;
export const BOARD_PAGE = 50;
const WRITE_DEBOUNCE = 300;

/** The window of rows to keep in facts for a list scrolled to `scrollTop`: the visible chunk plus one on each side. */
export function windowFor(scrollTop: number): { offset: number; limit: number } {
  const firstVisible = Math.floor(Math.max(0, scrollTop) / ROW_HEIGHT);
  const offset = Math.max(0, Math.floor(firstVisible / LIST_CHUNK) * LIST_CHUNK - LIST_CHUNK);
  return { offset, limit: LIST_WINDOW };
}

type IssueBindingOptions = Parameters<typeof syncTable>[1];

function issueBinding(pg: JamPGlite, options: Omit<IssueBindingOptions, "table">): SyncedTable {
  return syncTable(pg, { table: "issue", readonly: LOCAL_STATE_COLUMNS, writeDebounce: WRITE_DEBOUNCE, ...options });
}

function bindingsFor(pg: JamPGlite, route: Route): { list?: SyncedTable; all: SyncedTable[] } {
  switch (route.page) {
    case "list":
    case "search": {
      const { sql, params } = filterStateToSql(route.filter);
      const list = issueBinding(pg, { query: sql, params, offset: 0, limit: LIST_WINDOW, name: "list" });
      return { list, all: [list] };
    }
    case "board": {
      const columns = StatusValues.map((status) => {
        const filter = { ...route.filter, status: [status], orderBy: "kanbanorder", orderDirection: "asc" as const };
        const { sql, params } = filterStateToSql(filter);
        return issueBinding(pg, { query: sql, params, offset: 0, limit: BOARD_PAGE, name: `board:${status}` });
      });
      return { all: columns };
    }
    case "issue": {
      const detail = issueBinding(pg, {
        query: `SELECT * FROM issue WHERE id = $1 AND deleted = false`,
        params: [route.issueId],
        name: "detail",
      });
      const comments = syncTable(pg, {
        table: "comment",
        query: `SELECT * FROM comment WHERE issue_id = $1 AND deleted = false ORDER BY created ASC, id ASC`,
        params: [route.issueId],
        name: "comments",
        readonly: LOCAL_STATE_COLUMNS,
      });
      return { all: [detail, comments] };
    }
  }
}

export function startQueries(pg: JamPGlite): () => Promise<void> {
  const stats = syncTable(pg, {
    table: "stats",
    query: `SELECT 'issues' AS id, count(*)::int AS total FROM issue WHERE deleted = false`,
    writable: false,
  });

  let current: SyncedTable[] = [];
  let list: SyncedTable | undefined;
  let listOffset = 0;
  let generation = 0;

  // New bindings become ready before the old ones are disposed, so rows shared
  // between them never leave the fact database.
  async function switchTo(route: Route) {
    const gen = ++generation;
    const next = bindingsFor(pg, route);
    await Promise.all(next.all.map((b) => b.ready.catch(() => {})));
    if (gen !== generation) {
      await Promise.all(next.all.map((b) => b.dispose()));
      return;
    }
    const previous = current;
    current = next.all;
    list = next.list;
    listOffset = 0;
    // The list container is keyed by URL, so a route change lands on a fresh, unscrolled element.
    if (list) replace("ui", "list", "scrollTop", 0);
    await Promise.all(previous.map((b) => b.dispose()));
  }

  const stopRoute = whenever([["route", "url", $.url]], ([match]) => {
    if (match) void switchTo(parseRoute(String(match.url)));
  });

  const stopScroll = whenever([["ui", "list", "scrollTop", $.y]], ([match]) => {
    if (!list) return;
    const { offset, limit } = windowFor(Number(match?.y ?? 0));
    if (offset === listOffset) return;
    listOffset = offset;
    void list.refresh({ offset, limit });
  });

  return async () => {
    stopRoute();
    stopScroll();
    generation++;
    await Promise.all([stats, ...current].map((b) => b.dispose()));
  };
}
