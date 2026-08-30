// Electric mode, simulated: the client migrations run with triggers enabled and
// "Electric" writes are transactions with `electric.syncing = true`, exactly what
// pglite-sync does when it applies a shape. The app's data layer (route → syncTable
// bindings → facts → mutations → SQL → write path) is driven end to end.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { live, type PGliteWithLive } from "@electric-sql/pglite/live";
import { $, db, replace } from "@jam/core";
import { changeSetSchema } from "../changes";
import { migrate } from "../migrations";
import { addComment, createIssue, deleteIssue, moveIssue, updateIssue } from "../mutations";
import { startQueries } from "../programs/queries";
import { collectChanges, pushChanges, startWritePath } from "../sync";

let pg: PGlite & PGliteWithLive;
let stopQueries: () => Promise<void>;

const ISSUE_A = "11111111-1111-4111-8111-111111111111";
const ISSUE_B = "22222222-2222-4222-8222-222222222222";

async function waitFor(check: () => boolean, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function waitForRow<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[],
  check: (row: T | undefined) => boolean,
  timeout = 5000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const row = (await pg.query<T>(sql, params as any[])).rows[0];
    if (check(row)) return row;
    if (Date.now() > deadline) throw new Error(`waitForRow timed out: ${sql}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const fact = (entity: string, id: string, col: string) => db.query([entity, id, col, $.v])[0]?.v;
const listIds = () =>
  db
    .query(["query", "list", "row", $.i, $.id])
    .sort((a, b) => Number(a.i) - Number(b.i))
    .map((m) => m.id);

/** What pglite-sync does when a shape delivers a transaction. */
async function electricWrite(statements: string[]): Promise<void> {
  await pg.transaction(async (tx) => {
    await tx.exec(`SET LOCAL electric.syncing = true`);
    for (const statement of statements) await tx.exec(statement);
  });
}

beforeAll(async () => {
  pg = (await PGlite.create({ dataDir: "memory://", extensions: { live } })) as PGlite & PGliteWithLive;
  await migrate(pg);
  await pg.exec(`ALTER TABLE issue ENABLE TRIGGER ALL; ALTER TABLE comment ENABLE TRIGGER ALL;`);
  await electricWrite([
    `INSERT INTO issue (id, title, description, priority, status, created, modified, kanbanorder, username)
     VALUES ('${ISSUE_A}', 'Fix login', 'Users cannot log in', 'high', 'todo', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'a0', 'alice'),
            ('${ISSUE_B}', 'Write docs', 'Document the API', 'low', 'backlog', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', 'a1', 'bob')`,
  ]);
  db.clear();
  stopQueries = startQueries(pg);
});

afterAll(async () => {
  await stopQueries();
  await pg.close();
});

describe("linearlite data layer in Electric mode", () => {
  it("mirrors synced rows into facts, ordered newest first", async () => {
    replace("route", "url", "/");
    await waitFor(() => listIds().length === 2);
    expect(listIds()).toEqual([ISSUE_B, ISSUE_A]);
    expect(fact("issue", ISSUE_A, "title")).toBe("Fix login");
    expect(fact("issue", ISSUE_A, "synced")).toBe(true);
    expect(fact("issue", ISSUE_A, "created")).toBe("2026-01-01T00:00:00.000Z");
    expect(fact("issue", ISSUE_A, "description")).toBeUndefined();
    expect(db.query(["stats", "issues", "total", $.n])).toEqual([{ n: 2 }]);
    expect(await collectChanges(pg)).toEqual({ issues: [], comments: [] });
  });

  it("writes a local edit through the triggers and flags the row unsynced", async () => {
    updateIssue(ISSUE_A, { title: "Fix login flow" });
    expect(fact("issue", ISSUE_A, "title")).toBe("Fix login flow");

    const row = await waitForRow<{ title: string; modified_columns: string[]; synced: boolean }>(
      `SELECT title, modified_columns, synced FROM issue WHERE id = $1`,
      [ISSUE_A],
      (r) => r?.title === "Fix login flow",
    );
    expect(row.synced).toBe(false);
    expect(row.modified_columns.sort()).toEqual(["modified", "title"]);
    await waitFor(() => fact("issue", ISSUE_A, "synced") === false);
    expect(fact("issue", ISSUE_A, "title")).toBe("Fix login flow");
  });

  it("ships the change set to the write server and marks it sent", async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const changes = await pushChanges(pg, { applyChangesUrl: "http://write/apply-changes", fetch: fetchStub });

    expect(changes.issues.map((i) => i.id)).toEqual([ISSUE_A]);
    expect(changes.issues[0]).toMatchObject({ title: "Fix login flow", new: false, deleted: false });
    expect(changes.issues[0].modified_columns?.sort()).toEqual(["modified", "title"]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://write/apply-changes");
    expect(() => changeSetSchema.parse(JSON.parse(init.body as string))).not.toThrow();

    const row = (await pg.query<{ sent_to_server: boolean; synced: boolean }>(
      `SELECT sent_to_server, synced FROM issue WHERE id = $1`,
      [ISSUE_A],
    )).rows[0];
    expect(row).toEqual({ sent_to_server: true, synced: false });
    expect(await collectChanges(pg)).toEqual({ issues: [], comments: [] });
  });

  it("marks the row synced again when the server echoes the change back", async () => {
    const modified = fact("issue", ISSUE_A, "modified");
    await electricWrite([`UPDATE issue SET title = 'Fix login flow', modified = '${modified}' WHERE id = '${ISSUE_A}'`]);
    await waitFor(() => fact("issue", ISSUE_A, "synced") === true);
    const row = (await pg.query<{ modified_columns: string[]; backup: unknown }>(
      `SELECT modified_columns, backup FROM issue WHERE id = $1`,
      [ISSUE_A],
    )).rows[0];
    expect(row).toEqual({ modified_columns: [], backup: null });
  });

  it("does not let a stale server value clobber a newer local edit", async () => {
    updateIssue(ISSUE_A, { priority: "urgent" });
    await waitForRow(`SELECT priority FROM issue WHERE id = $1`, [ISSUE_A], (r) => r?.priority === "urgent");
    await electricWrite([`UPDATE issue SET priority = 'low', modified = '2026-01-03T00:00:00Z' WHERE id = '${ISSUE_A}'`]);
    await new Promise((r) => setTimeout(r, 150));
    expect((await pg.query<{ priority: string }>(`SELECT priority FROM issue WHERE id = $1`, [ISSUE_A])).rows[0].priority).toBe(
      "urgent",
    );
    expect(fact("issue", ISSUE_A, "priority")).toBe("urgent");
  });

  it("inserts a new issue at the top of the list", async () => {
    const id = await createIssue(pg, { title: "Brand new", priority: "medium" });
    expect(fact("issue", id, "status")).toBe("backlog");
    const row = await waitForRow<{ new: boolean; synced: boolean; kanbanorder: string; modified_columns: string[] }>(
      `SELECT new, synced, kanbanorder, modified_columns FROM issue WHERE id = $1`,
      [id],
      (r) => r !== undefined,
    );
    expect(row.new).toBe(true);
    expect(row.synced).toBe(false);
    expect(row.kanbanorder > "a1").toBe(true);
    expect(row.modified_columns).toContain("title");
    await waitFor(() => listIds()[0] === id);
    expect(fact("issue", id, "synced")).toBe(false);
    expect(db.query(["stats", "issues", "total", $.n])).toEqual([{ n: 3 }]);
    const changes = await collectChanges(pg);
    expect(changes.issues.find((i) => i.id === id)).toMatchObject({ title: "Brand new", new: true });
  });

  it("loads the detail and comments when routing to an issue, and adds a comment", async () => {
    replace("route", "url", `/issue/${ISSUE_A}`);
    await waitFor(() => fact("issue", ISSUE_A, "description") === "Users cannot log in");
    expect(db.query(["query", "list", "row", $.i, $.id])).toEqual([]);
    expect(db.query(["query", "comments", "ready", true])).toEqual([{}]);

    const commentId = addComment(ISSUE_A, "On it.");
    await waitFor(() => db.query(["query", "comments", "row", 0, commentId]).length === 1);
    const row = (await pg.query<{ body: string; issue_id: string; new: boolean }>(
      `SELECT body, issue_id, new FROM comment WHERE id = $1`,
      [commentId],
    )).rows[0];
    expect(row).toEqual({ body: "On it.", issue_id: ISSUE_A, new: true });
    expect(fact("comment", commentId, "synced")).toBe(false);
    expect((await collectChanges(pg)).comments.map((c) => c.id)).toEqual([commentId]);
  });

  it("moves an issue between board columns with a fractional index", async () => {
    replace("route", "url", "/board");
    await waitFor(() => db.query(["query", "board:todo", "row", $.i, ISSUE_A]).length === 1);
    expect(db.query(["query", "board:backlog", "row", $.i, $.id]).length).toBe(2);

    moveIssue(ISSUE_A, "backlog", undefined, ISSUE_B);
    expect(fact("issue", ISSUE_A, "status")).toBe("backlog");
    const row = await waitForRow<{ status: string; kanbanorder: string }>(
      `SELECT status, kanbanorder FROM issue WHERE id = $1`,
      [ISSUE_A],
      (r) => r?.status === "backlog",
    );
    expect(row.kanbanorder < "a1").toBe(true);
    await waitFor(() => db.query(["query", "board:backlog", "row", 0, ISSUE_A]).length === 1);
    expect(db.query(["query", "board:todo", "row", $.i, $.id])).toEqual([]);
  });

  it("soft-deletes an issue and drops it from every view", async () => {
    deleteIssue(ISSUE_B);
    const row = await waitForRow<{ deleted: boolean; synced: boolean }>(
      `SELECT deleted, synced FROM issue WHERE id = $1`,
      [ISSUE_B],
      (r) => r?.deleted === true,
    );
    expect(row.synced).toBe(false);
    await waitFor(() => db.query(["query", "board:backlog", "row", $.i, ISSUE_B]).length === 0);
    expect(db.query(["issue", ISSUE_B, $.c, $.v])).toEqual([]);
    expect(db.query(["stats", "issues", "total", $.n])).toEqual([{ n: 2 }]);
    const changes = await collectChanges(pg);
    expect(changes.issues.find((i) => i.id === ISSUE_B)?.deleted).toBe(true);
  });

  it("applies a remote hard delete", async () => {
    await electricWrite([`DELETE FROM issue WHERE id = '${ISSUE_B}'`]);
    expect((await pg.query(`SELECT 1 FROM issue WHERE id = $1`, [ISSUE_B])).rows).toEqual([]);
  });

  it("retries a failed push until the write server accepts it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    updateIssue(ISSUE_A, { title: "Retry me" });
    const stop = startWritePath(pg, { applyChangesUrl: "http://write/apply-changes", fetch: fetchStub, retryDelay: 20 });
    try {
      await waitForRow<{ sent_to_server: boolean }>(
        `SELECT sent_to_server FROM issue WHERE id = $1`,
        [ISSUE_A],
        (r) => r?.sent_to_server === true,
      );
      expect(fetchStub.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(errorSpy).toHaveBeenCalledWith("[linearlite] write path failed", expect.any(Error));
      expect(await collectChanges(pg)).toEqual({ issues: [], comments: [] });
    } finally {
      await stop();
      errorSpy.mockRestore();
    }
  });
});
