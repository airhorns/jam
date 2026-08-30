import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { $, _, db, when } from "@jam/core";
import { readEntity } from "../facts";
import { addComment, createIssue, createProject, deleteIssue, moveIssue, updateIssue } from "../mutations";
import { listProjects, projectScope } from "../projects";
import type { Comment, Issue } from "../types";

beforeEach(() => db.clear());
afterEach(() => db.clear());

describe("createIssue", () => {
  it("writes every column into the project's scope", () => {
    const id = createIssue("web", { title: "Login bug", priority: "high" });
    const issue = readEntity<Issue>("issue", id)!;
    expect(issue).toMatchObject({ project: "web", title: "Login bug", priority: "high", status: "backlog", description: "" });
    for (const { col } of when(["issue", id, $.col, $.val])) {
      expect(db.scopeOf("issue", id, col, issue[col as keyof Issue]!)).toBe(projectScope("web"));
    }
  });

  it("places new issues after the project's last kanban position", () => {
    const first = createIssue("web", { title: "one" });
    const other = createIssue("mobile", { title: "elsewhere" });
    const second = createIssue("web", { title: "two" });
    const order = (id: string) => readEntity<Issue>("issue", id)!.kanbanorder!;
    expect(order(second) > order(first)).toBe(true);
    expect(order(other)).toBe(order(first));
  });
});

describe("updateIssue", () => {
  it("keeps edits in the issue's scope and bumps modified", () => {
    const id = createIssue("web", { title: "before" });
    const before = readEntity<Issue>("issue", id)!.modified!;
    updateIssue(id, { title: "after", status: "done" });
    const issue = readEntity<Issue>("issue", id)!;
    expect(issue).toMatchObject({ title: "after", status: "done" });
    expect(issue.modified! >= before).toBe(true);
    expect(db.scopeOf("issue", id, "title", "after")).toBe(projectScope("web"));
    expect(when(["issue", id, "title", $.t])).toHaveLength(1);
  });
});

describe("moveIssue", () => {
  it("orders an issue between its neighbours", () => {
    const a = createIssue("web", { title: "a" });
    const b = createIssue("web", { title: "b" });
    const c = createIssue("web", { title: "c" });
    moveIssue(c, "todo", a, b);
    const order = (id: string) => readEntity<Issue>("issue", id)!.kanbanorder!;
    expect(order(a) < order(c) && order(c) < order(b)).toBe(true);
    expect(readEntity<Issue>("issue", c)!.status).toBe("todo");
  });
});

describe("addComment", () => {
  it("scopes the comment with its issue", () => {
    const issue = createIssue("mobile", { title: "x" });
    const id = addComment(issue, "hello");
    expect(readEntity<Comment>("comment", id)).toMatchObject({ issue, body: "hello", username: "you" });
    expect(db.scopeOf("comment", id, "body", "hello")).toBe(projectScope("mobile"));
  });

  it("refuses when the issue is not in memory", () => {
    expect(() => addComment("missing", "hello")).toThrow(/not loaded/);
  });
});

describe("deleteIssue", () => {
  it("removes the issue and its comments", () => {
    const issue = createIssue("web", { title: "x" });
    const other = createIssue("web", { title: "y" });
    addComment(issue, "one");
    const keep = addComment(other, "two");
    deleteIssue(issue);
    expect(when(["issue", issue, _, _])).toEqual([]);
    expect(when(["comment", $.id, "issue", issue])).toEqual([]);
    expect(readEntity<Comment>("comment", keep)?.body).toBe("two");
  });
});

describe("createProject", () => {
  it("derives a readable unique id", () => {
    const first = createProject("Web App");
    const second = createProject("Web App!");
    expect(first).toBe("web-app");
    expect(second).toBe("web-app-2");
    expect(listProjects().map((p) => p.id)).toEqual([first, second]);
    expect(db.scopeOf("project", first, "name", "Web App")).toBe("");
    expect(listProjects()[0]).toMatchObject({ name: "Web App", key: "WEB" });
  });
});
