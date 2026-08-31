import { beforeEach, describe, expect, it } from "vitest";
import { db, remember, replace, transaction, type QueryClause } from "@jam/core";
import { filterStateFromParams, filterStateToParams, issueClauses, orderedIssueClauses, type FilterState } from "../filter-state";
import type { Issue } from "../types";

describe("filterStateFromParams", () => {
  it("defaults to newest first with no filters", () => {
    expect(filterStateFromParams(new URLSearchParams(""))).toEqual({
      orderBy: "created",
      orderDirection: "desc",
      status: [],
      priority: [],
      query: undefined,
    });
  });

  it("splits comma-separated and repeated values", () => {
    const state = filterStateFromParams(new URLSearchParams("status=todo,In_Progress&status=done&priority=high&query=login"));
    expect(state.status).toEqual(["todo", "in_progress", "done"]);
    expect(state.priority).toEqual(["high"]);
    expect(state.query).toBe("login");
  });

  it("ignores an unknown orderBy column", () => {
    expect(filterStateFromParams(new URLSearchParams("orderBy=drop%20table")).orderBy).toBe("created");
  });
});

describe("filterStateToParams", () => {
  it("omits defaults and round-trips the rest", () => {
    const params = filterStateToParams({ orderBy: "modified", orderDirection: "desc", status: ["todo"], priority: [], query: "x" });
    expect(params.toString()).toBe("orderBy=modified&status=todo&query=x");
    expect(filterStateFromParams(params)).toMatchObject({ orderBy: "modified", status: ["todo"], query: "x" });
  });

  it("only touches the keys it is given", () => {
    const params = filterStateToParams({ status: [] }, new URLSearchParams("status=done&orderBy=title"));
    expect(params.toString()).toBe("orderBy=title");
  });
});

const ISSUES: (Partial<Issue> & { id: string })[] = [
  { id: "a", title: "Login bug", description: "Cannot sign in", status: "todo", priority: "high", created: "2026-01-03" },
  { id: "b", title: "Dark mode", description: "Theme switcher", status: "done", priority: "low", created: "2026-01-01" },
  { id: "c", title: "Crash on login", description: "", status: "todo", priority: "urgent", created: "2026-01-02" },
];

const base: FilterState = { orderBy: "created", orderDirection: "desc", status: [], priority: [] };

function ids(clauses: QueryClause[]): string[] {
  return db.query(...clauses).map((row) => String(row.id));
}

beforeEach(() => {
  db.clear();
  transaction(() => {
    for (const { id, ...columns } of ISSUES) {
      for (const [column, value] of Object.entries(columns)) remember("issue", id, column, value);
      remember("issue", id, "project", "web");
    }
    remember("issue", "z", "project", "mobile");
    remember("issue", "z", "title", "Login on mobile");
    remember("issue", "z", "description", "");
    remember("issue", "z", "status", "todo");
    remember("issue", "z", "created", "2026-01-04");
  });
});

describe("issueClauses", () => {
  it("keeps every issue of the project when no filter is set", () => {
    expect(ids(issueClauses("web", base)).sort()).toEqual(["a", "b", "c"]);
  });

  it("matches status and priority membership", () => {
    expect(ids(issueClauses("web", { ...base, status: ["todo"] })).sort()).toEqual(["a", "c"]);
    expect(ids(issueClauses("web", { ...base, status: ["todo", "done"], priority: ["urgent", "low"] })).sort()).toEqual(["b", "c"]);
    expect(ids(issueClauses("web", { ...base, status: ["todo"], priority: ["urgent"] }))).toEqual(["c"]);
  });

  it("searches title and description case-insensitively", () => {
    expect(ids(issueClauses("web", { ...base, query: "LOGIN" })).sort()).toEqual(["a", "c"]);
    expect(ids(issueClauses("web", { ...base, query: "sign in" }))).toEqual(["a"]);
    expect(ids(issueClauses("web", { ...base, query: "   " }))).toHaveLength(3);
  });
});

describe("orderedIssueClauses", () => {
  it("orders by the chosen column in either direction", () => {
    expect(ids(orderedIssueClauses("web", base))).toEqual(["a", "c", "b"]);
    expect(ids(orderedIssueClauses("web", { ...base, orderDirection: "asc" }))).toEqual(["b", "c", "a"]);
    expect(ids(orderedIssueClauses("web", { ...base, orderBy: "title", orderDirection: "asc" }))).toEqual(["c", "b", "a"]);
  });

  it("breaks ties by id so windows stay stable", () => {
    for (const id of ["a", "b", "c"]) replace("issue", id, "status", "todo");
    expect(ids(orderedIssueClauses("web", { ...base, orderBy: "status", orderDirection: "asc" }))).toEqual(["a", "b", "c"]);
    expect(ids(orderedIssueClauses("web", { ...base, orderBy: "status", orderDirection: "desc" }))).toEqual(["a", "b", "c"]);
  });
});
