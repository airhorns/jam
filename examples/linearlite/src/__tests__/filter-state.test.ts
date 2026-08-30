import { describe, expect, it } from "vitest";
import { filterStateFromParams, filterStateToParams, filterStateToSql } from "../filter-state";

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

describe("filterStateToSql", () => {
  it("numbers placeholders across status, priority, and search", () => {
    const { sql, params } = filterStateToSql({
      orderBy: "modified",
      orderDirection: "asc",
      status: ["todo", "done"],
      priority: ["high"],
      query: "login bug",
    });
    expect(sql).toContain("status IN ($1, $2)");
    expect(sql).toContain("priority IN ($3)");
    expect(sql).toContain("plainto_tsquery('simple', $4)");
    expect(sql).toContain("deleted = false");
    expect(sql).toMatch(/ORDER BY modified ASC, id ASC$/);
    expect(params).toEqual(["todo", "done", "high", "login bug"]);
  });

  it("filters only soft-deleted rows when no filters are set", () => {
    const { sql, params } = filterStateToSql({ orderBy: "created", orderDirection: "desc", status: [], priority: [] });
    expect(sql).toContain("WHERE deleted = false ORDER BY created DESC, id ASC");
    expect(params).toEqual([]);
  });
});
