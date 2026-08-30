import { describe, expect, it } from "vitest";
import { filterIssues, filterStateFromParams, filterStateToParams, sortIssues } from "../filter-state";
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

const base = { orderBy: "created", orderDirection: "desc" as const, status: [], priority: [] };

describe("filterIssues", () => {
  it("keeps everything when no filter is set", () => {
    expect(filterIssues(ISSUES, base)).toHaveLength(3);
  });

  it("matches status and priority membership", () => {
    expect(filterIssues(ISSUES, { ...base, status: ["todo"] }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterIssues(ISSUES, { ...base, status: ["todo"], priority: ["urgent"] }).map((i) => i.id)).toEqual(["c"]);
  });

  it("searches title and description case-insensitively", () => {
    expect(filterIssues(ISSUES, { ...base, query: "LOGIN" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterIssues(ISSUES, { ...base, query: "sign in" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterIssues(ISSUES, { ...base, query: "   " })).toHaveLength(3);
  });
});

describe("sortIssues", () => {
  it("orders by the chosen column in either direction", () => {
    expect(sortIssues(ISSUES, { orderBy: "created", orderDirection: "desc" }).map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(sortIssues(ISSUES, { orderBy: "created", orderDirection: "asc" }).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(sortIssues(ISSUES, { orderBy: "title", orderDirection: "asc" }).map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks ties by id so windows stay stable", () => {
    const same = ISSUES.map((issue) => ({ ...issue, status: "todo" as const }));
    expect(sortIssues(same, { orderBy: "status", orderDirection: "asc" }).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(sortIssues(same, { orderBy: "status", orderDirection: "desc" }).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
