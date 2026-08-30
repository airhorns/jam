import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { $, compileFilter, db, replace, scoped, transaction, when } from "@jam/core";
import { queryMeta, queryRows } from "../facts";
import { projectScope } from "../projects";
import { LIST_CHUNK, LIST_WINDOW, ROW_HEIGHT, startQueries } from "../programs/queries";
import type { Issue } from "../types";

const WEB = "web";
const MOBILE = "mobile";

function seedIssue(project: string, n: number, patch: Partial<Issue> = {}): string {
  const id = `${project}-${String(n).padStart(4, "0")}`;
  const issue: Issue = {
    id,
    project,
    title: `Issue ${n}`,
    description: "",
    priority: "none",
    status: "todo",
    created: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    modified: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    kanbanorder: String(n).padStart(4, "0"),
    username: "seed",
    ...patch,
  };
  scoped(projectScope(project), () => {
    for (const [column, value] of Object.entries(issue)) if (column !== "id") replace("issue", id, column, value);
  });
  return id;
}

function seedComment(project: string, issue: string, id: string, created: string): void {
  scoped(projectScope(project), () => {
    replace("comment", id, "issue", issue);
    replace("comment", id, "body", `comment ${id}`);
    replace("comment", id, "created", created);
  });
}

const markReady = (project: string, ready = true) =>
  replace("sync", "shape", compileFilter({ scope: projectScope(project) }).id, "ready", ready);

let stop: () => void;

beforeEach(() => {
  db.clear();
  stop = startQueries();
});

afterEach(() => {
  stop();
  db.clear();
});

describe("list", () => {
  it("shows only the current project's issues, newest first", () => {
    transaction(() => {
      seedIssue(WEB, 1);
      seedIssue(WEB, 2);
      seedIssue(MOBILE, 3);
      replace("route", "url", `/${WEB}`);
    });
    expect(queryRows("list")).toEqual(["web-0002", "web-0001"]);
    expect(queryMeta("list")).toMatchObject({ total: 2, offset: 0, limit: LIST_WINDOW, ready: false });
    expect(when(["stats", "issues", "total", $.n])[0]?.n).toBe(2);
  });

  it("reports ready once the project's subscription is", () => {
    replace("route", "url", `/${WEB}`);
    expect(queryMeta("list").ready).toBe(false);
    markReady(WEB);
    expect(queryMeta("list").ready).toBe(true);
    markReady(MOBILE);
    replace("route", "url", `/${MOBILE}`);
    expect(queryMeta("list").ready).toBe(true);
  });

  it("applies the route's filter and sort", () => {
    transaction(() => {
      seedIssue(WEB, 1, { status: "done", title: "Alpha" });
      seedIssue(WEB, 2, { status: "todo", title: "Beta", priority: "high" });
      seedIssue(WEB, 3, { status: "todo", title: "Gamma" });
    });
    replace("route", "url", `/${WEB}?status=todo&orderBy=title&orderDirection=asc`);
    expect(queryRows("list")).toEqual(["web-0002", "web-0003"]);
    replace("route", "url", `/${WEB}?priority=high`);
    expect(queryRows("list")).toEqual(["web-0002"]);
    replace("route", "url", `/${WEB}/search?query=GAMMA`);
    expect(queryRows("list")).toEqual(["web-0003"]);
  });

  it("windows the rows by scroll position and re-derives on edits", () => {
    transaction(() => {
      for (let n = 1; n <= 260; n++) seedIssue(WEB, n);
    });
    replace("route", "url", `/${WEB}?orderBy=created&orderDirection=asc`);
    expect(queryRows("list")).toHaveLength(LIST_WINDOW);
    expect(queryRows("list")[0]).toBe("web-0001");

    replace("ui", "list", "scrollTop", ROW_HEIGHT * LIST_CHUNK * 3);
    const meta = queryMeta("list");
    expect(meta.offset).toBe(LIST_CHUNK * 2);
    expect(meta.total).toBe(260);
    expect(queryRows("list")[0]).toBe(`web-${String(LIST_CHUNK * 2 + 1).padStart(4, "0")}`);

    replace("issue", "web-0101", "status", "done");
    replace("route", "url", `/${WEB}?status=done`);
    expect(queryRows("list")).toEqual(["web-0101"]);
    expect(queryMeta("list").offset).toBe(0);
  });

  it("drops its facts when the route leaves the list", () => {
    seedIssue(WEB, 1);
    replace("route", "url", `/${WEB}`);
    expect(queryRows("list")).toEqual(["web-0001"]);
    replace("route", "url", `/${WEB}/board`);
    expect(when(["query", "list", $.k, $.v])).toEqual([]);
    expect(when(["query", "list", "row", $.i, $.id])).toEqual([]);
  });
});

describe("board", () => {
  it("fills a column per status ordered by kanbanorder", () => {
    transaction(() => {
      seedIssue(WEB, 1, { status: "todo", kanbanorder: "b" });
      seedIssue(WEB, 2, { status: "todo", kanbanorder: "a" });
      seedIssue(WEB, 3, { status: "done" });
      seedIssue(MOBILE, 4, { status: "todo" });
    });
    replace("route", "url", `/${WEB}/board`);
    expect(queryRows("board:todo")).toEqual(["web-0002", "web-0001"]);
    expect(queryRows("board:done")).toEqual(["web-0003"]);
    expect(queryRows("board:backlog")).toEqual([]);
    expect(queryMeta("board:todo")).toMatchObject({ total: 2, ready: false });
    markReady(WEB);
    expect(queryMeta("board:backlog").ready).toBe(true);
  });
});

describe("issue detail", () => {
  it("exposes the issue and its comments in creation order", () => {
    transaction(() => {
      seedIssue(WEB, 1);
      seedIssue(WEB, 2);
      seedComment(WEB, "web-0001", "c2", "2026-02-01T00:00:00Z");
      seedComment(WEB, "web-0001", "c1", "2026-01-01T00:00:00Z");
      seedComment(WEB, "web-0002", "c3", "2026-01-01T00:00:00Z");
    });
    replace("route", "url", `/${WEB}/issue/web-0001`);
    expect(queryRows("detail")).toEqual(["web-0001"]);
    expect(queryMeta("detail").total).toBe(1);
    expect(queryRows("comments")).toEqual(["c1", "c2"]);
    seedComment(WEB, "web-0001", "c0", "2025-01-01T00:00:00Z");
    expect(queryRows("comments")).toEqual(["c0", "c1", "c2"]);
  });

  it("treats an issue from another project as missing", () => {
    seedIssue(MOBILE, 1);
    replace("route", "url", `/${WEB}/issue/mobile-0001`);
    expect(queryRows("detail")).toEqual([]);
    expect(queryMeta("detail").total).toBe(0);
  });
});
