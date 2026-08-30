import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { electricSync } from "@electric-sql/pglite-sync";
import { db, $, _ } from "../db";
import { remember, replace, forget, claim, whenever, scoped, transaction } from "../primitives";
import { sync, compileFilter, OUTBOX_TABLE, SHAPES_TABLE, type SyncHandle, type SyncOptions } from "../sync";
import { JAM_FACTS_SQL, factKey } from "../server";
import type { JamPGlite } from "../pglite";
import { FakeElectric } from "./helpers/fake-electric";

const P1 = "project:p1";
const P2 = "project:p2";

async function waitFor(predicate: () => boolean, what = "condition", timeout = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function has(...terms: Parameters<typeof factKey>[0]) {
  return db.facts.has(factKey(terms));
}

function status(kind: string) {
  return db.query(["sync", kind, $.v]).map((b) => b.v);
}

async function createPg(): Promise<JamPGlite & PGlite> {
  return PGlite.create({ dataDir: "memory://", extensions: { live, sync: electricSync() } });
}

/** Drop everything sync() creates so each test starts from an empty client database. */
async function resetClient(pg: PGlite) {
  const tables = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'jam_%'`,
  );
  for (const { table_name } of tables.rows) await pg.exec(`DROP TABLE IF EXISTS "${table_name}" CASCADE`);
  const metadata = await pg.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'electric' AND table_name = 'subscriptions_metadata'`);
  if (metadata.rows.length) await pg.exec(`DELETE FROM electric.subscriptions_metadata`);
}

describe("compileFilter", () => {
  it("compiles scope and literal pattern positions into a where clause over jam_facts columns", () => {
    expect(compileFilter()).toMatchObject({ where: "", params: [] });
    expect(compileFilter({ scope: P1 })).toMatchObject({ where: "scope = $1", params: [P1] });
    expect(compileFilter({ pattern: ["issue", _, "project"] })).toMatchObject({
      where: "t0 = $1 AND t2 = $2",
      params: ['"issue"', '"project"'],
    });
    expect(compileFilter({ scope: "", pattern: ["issue", 1, $.col] })).toMatchObject({
      where: "scope = $1 AND t0 = $2 AND t1 = $3",
      params: ["", '"issue"', "1"],
    });
  });

  it("rejects literals past the third term", () => {
    expect(() => compileFilter({ pattern: [_, _, _, "x"] })).toThrow("first 3 terms");
  });

  it("derives stable, distinct table names", () => {
    const a = compileFilter({ scope: P1 });
    expect(a.id).toMatch(/^jam_shape_[a-z0-9]+$/);
    expect(compileFilter({ scope: P1 }).id).toBe(a.id);
    expect(compileFilter({ scope: P2 }).id).not.toBe(a.id);
    expect(compileFilter({ scope: P1, pattern: ["issue"] }).id).not.toBe(a.id);
  });

  it("matches facts client-side the same way", () => {
    const f = compileFilter({ scope: P1, pattern: ["issue", _, "title"] });
    expect(f.matches(["issue", 1, "title", "A"], P1)).toBe(true);
    expect(f.matches(["issue", 1, "title", "A"], P2)).toBe(false);
    expect(f.matches(["issue", 1, "status", "A"], P1)).toBe(false);
    expect(compileFilter().matches(["anything"], "")).toBe(true);
  });
});

describe("sync (standalone)", () => {
  let pg: JamPGlite & PGlite;
  const handles: SyncHandle[] = [];

  async function start(options: Partial<SyncOptions> = {}) {
    const handle = await sync({ pg, echoTimeout: 200, retryDelay: 20, ...options });
    handles.push(handle);
    return handle;
  }

  async function seed(rows: Array<[Parameters<typeof factKey>[0], string]>) {
    await pg.exec(JAM_FACTS_SQL);
    for (const [fact, scope] of rows) await pg.query(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(fact), scope]);
  }

  async function serverRows() {
    const { rows } = await pg.query<{ key: string; scope: string }>(`SELECT key, scope FROM jam_facts ORDER BY key`);
    return rows.map((r) => [r.key, r.scope]);
  }

  beforeAll(async () => {
    pg = await createPg();
  });
  afterAll(async () => {
    await pg.close();
  });
  beforeEach(async () => {
    db.clear();
    await resetClient(pg);
  });
  afterEach(async () => {
    while (handles.length) await handles.pop()!.dispose();
  });

  it("loads only the subscribed scope and reports status facts", async () => {
    await seed([
      [["issue", 1, "title", "One"], P1],
      [["issue", 2, "title", "Two"], P2],
      [["project", "p1", "name", "P1"], ""],
    ]);
    const s = await start();
    expect(status("status")).toEqual(["standalone"]);
    const sub = s.subscribe({ scope: P1 });
    expect(db.query(["sync", "shape", sub.id, "ready", $.r]).map((b) => b.r)).toEqual([false]);
    await sub.ready;
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(has("issue", 2, "title", "Two")).toBe(false);
    expect(has("project", "p1", "name", "P1")).toBe(false);
    expect(db.scopeOf("issue", 1, "title", "One")).toBe(P1);
    expect(db.query(["sync", "shape", sub.id, "ready", $.r]).map((b) => b.r)).toEqual([true]);
    expect(status("pending")).toEqual([0]);
  });

  it("filters by pattern literals, optionally combined with scope", async () => {
    await seed([
      [["issue", 1, "title", "One"], P1],
      [["issue", 1, "status", "todo"], P1],
      [["comment", 9, "body", "hi"], P1],
      [["issue", 3, "title", "Three"], P2],
    ]);
    const s = await start();
    await s.subscribe({ pattern: ["issue", _, "title"] }).ready;
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(has("issue", 3, "title", "Three")).toBe(true);
    expect(has("issue", 1, "status", "todo")).toBe(false);
    expect(has("comment", 9, "body", "hi")).toBe(false);

    await s.subscribe({ scope: P1, pattern: ["comment"] }).ready;
    expect(has("comment", 9, "body", "hi")).toBe(true);
    expect(has("issue", 1, "status", "todo")).toBe(false);
  });

  it("mirrors rows inserted, rescoped and deleted behind its back", async () => {
    await seed([]);
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    await pg.query(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", 1, "title", "One"]), P1]);
    await waitFor(() => has("issue", 1, "title", "One"), "insert to arrive");
    expect(db.scopeOf("issue", 1, "title", "One")).toBe(P1);

    await pg.query(`UPDATE jam_facts SET scope = $2 WHERE key = $1`, [factKey(["issue", 1, "title", "One"]), P2]);
    await waitFor(() => !has("issue", 1, "title", "One"), "rescoped row to leave the subscription");

    await pg.query(`UPDATE jam_facts SET scope = $2 WHERE key = $1`, [factKey(["issue", 1, "title", "One"]), P1]);
    await waitFor(() => has("issue", 1, "title", "One"), "row to come back");
    await pg.query(`DELETE FROM jam_facts WHERE key = $1`, [factKey(["issue", 1, "title", "One"])]);
    await waitFor(() => !has("issue", 1, "title", "One"), "delete to arrive");
  });

  it("stores local remember/replace/forget with their scope and settles pending back to zero", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    scoped(P1, () => {
      remember("issue", 1, "title", "One");
      remember("issue", 1, "status", "todo");
    });
    remember("project", "p1", "name", "P1");
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "pending to settle");
    expect(await serverRows()).toEqual([
      [factKey(["issue", 1, "status", "todo"]), P1],
      [factKey(["issue", 1, "title", "One"]), P1],
      [factKey(["project", "p1", "name", "P1"]), ""],
    ]);

    replace("issue", 1, "title", "Uno");
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "replace to settle");
    expect((await serverRows()).map((r) => r[0])).toContain(factKey(["issue", 1, "title", "Uno"]));
    expect((await serverRows()).map((r) => r[0])).not.toContain(factKey(["issue", 1, "title", "One"]));
    expect(db.scopeOf("issue", 1, "title", "Uno")).toBe(P1);
    expect(has("issue", 1, "title", "Uno")).toBe(true);

    forget("issue", 1, "status", "todo");
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "forget to settle");
    expect((await serverRows()).map((r) => r[0])).not.toContain(factKey(["issue", 1, "status", "todo"]));
    await settle(300);
    expect(has("issue", 1, "title", "Uno")).toBe(true);
    expect(has("issue", 1, "status", "todo")).toBe(false);
    expect((await pg.query(`SELECT count(*)::int AS n FROM ${OUTBOX_TABLE}`)).rows).toEqual([{ n: 0 }]);
  });

  it("never stores excluded or derived facts", async () => {
    const s = await start();
    await s.subscribe().ready;
    remember("dom", "x", "tag", "div");
    const stop = whenever([["issue", $.id, "title", $.t]], (matches) => {
      for (const { id } of matches) claim("issue", id as number, "derived", true);
    });
    remember("issue", 1, "title", "One");
    await waitFor(() => has("issue", 1, "derived", true), "claim to run");
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "pending to settle");
    expect(await serverRows()).toEqual([[factKey(["issue", 1, "title", "One"]), ""]]);
    stop();
    expect(has("issue", 1, "derived", true)).toBe(false);
    await s.flush();
    expect(await serverRows()).toEqual([[factKey(["issue", 1, "title", "One"]), ""]]);
  });

  it("refcounts identical subscriptions and drops facts only with the last one", async () => {
    await seed([[["issue", 1, "title", "One"], P1]]);
    const s = await start();
    const a = s.subscribe({ scope: P1 });
    const b = s.subscribe({ scope: P1 });
    expect(b.id).toBe(a.id);
    await Promise.all([a.ready, b.ready]);
    await a.dispose();
    expect(has("issue", 1, "title", "One")).toBe(true);
    await b.dispose();
    expect(has("issue", 1, "title", "One")).toBe(false);
    await settle();
    expect((await serverRows()).length).toBe(1);
    expect((await pg.query(`SELECT count(*)::int AS n FROM ${OUTBOX_TABLE}`)).rows).toEqual([{ n: 0 }]);
  });

  it("keeps a fact held by another overlapping subscription", async () => {
    await seed([
      [["issue", 1, "title", "One"], P1],
      [["issue", 1, "status", "todo"], P1],
    ]);
    const s = await start();
    const byScope = s.subscribe({ scope: P1 });
    const byPattern = s.subscribe({ pattern: ["issue", _, "title"] });
    await Promise.all([byScope.ready, byPattern.ready]);
    await byScope.dispose();
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(has("issue", 1, "status", "todo")).toBe(false);
  });

  it("leaves locally remembered facts outside every subscription alone", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    scoped(P2, () => remember("issue", 2, "title", "Two"));
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "pending to settle");
    await settle(300);
    expect(has("issue", 2, "title", "Two")).toBe(true);
    expect(await serverRows()).toEqual([[factKey(["issue", 2, "title", "Two"]), P2]]);
  });

  it("restores facts from the local table on a fresh sync()", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    scoped(P1, () => remember("issue", 1, "title", "One"));
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "pending to settle");
    await handles.pop()!.dispose();
    db.clear();

    const again = await start();
    await again.subscribe({ scope: P1 }).ready;
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(db.scopeOf("issue", 1, "title", "One")).toBe(P1);
  });

  it("stores every fact of a transaction", async () => {
    const s = await start();
    await s.subscribe().ready;
    transaction(() => {
      for (let i = 0; i < 20; i++) remember("issue", i, "title", `#${i}`);
    });
    await s.flush();
    expect((await serverRows()).length).toBe(20);
    await waitFor(() => status("pending")[0] === 0, "pending to settle");
    expect(db.query(["issue", $.i, "title", $.t]).length).toBe(20);
  });

  it("refuses to forget a shape that is still subscribed", async () => {
    const s = await start();
    const sub = s.subscribe({ scope: P1 });
    await sub.ready;
    await expect(s.forgetShape({ scope: P1 })).rejects.toThrow("still subscribed");
    await sub.dispose();
    await s.forgetShape({ scope: P1 });
  });
});

describe("sync (Electric)", () => {
  let client: JamPGlite & PGlite;
  let server: PGlite;
  let electric: FakeElectric;
  const handles: SyncHandle[] = [];

  async function start(options: Partial<SyncOptions> = {}) {
    const handle = await sync({
      pg: client,
      shapeUrl: electric.shapeUrl,
      writeUrl: electric.writeUrl,
      fetch: electric.fetch,
      echoTimeout: 300,
      retryDelay: 30,
      ...options,
    });
    handles.push(handle);
    return handle;
  }

  async function serverRows() {
    const { rows } = await server.query<{ key: string; scope: string }>(`SELECT key, scope FROM jam_facts ORDER BY key`);
    return rows.map((r) => [r.key, r.scope]);
  }

  const insert = (fact: Parameters<typeof factKey>[0], scope: string) =>
    electric.sql(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(fact), scope]);

  /** Record every add/delete of the given key so tests can assert a fact never flickered. */
  function trace(fact: Parameters<typeof factKey>[0]) {
    const key = factKey(fact);
    const events: string[] = [];
    const stop = db.observe((type, k) => {
      if (k === key) events.push(type);
    });
    return { events, stop };
  }

  beforeAll(async () => {
    client = await createPg();
    server = await PGlite.create({ dataDir: "memory://" });
  });
  afterAll(async () => {
    await client.close();
    await server.close();
  });
  beforeEach(async () => {
    db.clear();
    await resetClient(client);
    await server.exec(`DROP TABLE IF EXISTS jam_facts`);
    await server.exec(JAM_FACTS_SQL);
    electric = new FakeElectric(server);
  });
  afterEach(async () => {
    while (handles.length) await handles.pop()!.dispose();
  });

  it("streams the initial shape and flips status from syncing to live", async () => {
    await insert(["issue", 1, "title", "One"], P1);
    await insert(["issue", 2, "title", "Two"], P2);
    const s = await start();
    const sub = s.subscribe({ scope: P1 });
    expect(status("status")).toEqual(["syncing"]);
    await sub.ready;
    expect(status("status")).toEqual(["live"]);
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(has("issue", 2, "title", "Two")).toBe(false);
    expect(db.scopeOf("issue", 1, "title", "One")).toBe(P1);
    const registry = await client.query<{ ready: boolean }>(`SELECT ready FROM ${SHAPES_TABLE} WHERE table_name = $1`, [sub.id]);
    expect(registry.rows).toEqual([{ ready: true }]);
  });

  it("applies remote inserts, rescopes and deletes", async () => {
    const s = await start();
    await Promise.all([s.subscribe({ scope: P1 }).ready, s.subscribe({ scope: P2 }).ready]);
    await insert(["issue", 1, "title", "One"], P1);
    await waitFor(() => has("issue", 1, "title", "One"), "remote insert");

    const t = trace(["issue", 1, "title", "One"]);
    await electric.sql(`UPDATE jam_facts SET scope = $2 WHERE key = $1`, [factKey(["issue", 1, "title", "One"]), P2]);
    await waitFor(() => db.scopeOf("issue", 1, "title", "One") === P2, "rescope to P2");
    await settle();
    expect(t.events).toEqual([]);
    t.stop();

    await electric.sql(`DELETE FROM jam_facts WHERE key = $1`, [factKey(["issue", 1, "title", "One"])]);
    await waitFor(() => !has("issue", 1, "title", "One"), "remote delete");
  });

  it("pushes local writes through the outbox and absorbs the echo without flicker", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    const t = trace(["issue", 1, "title", "One"]);
    scoped(P1, () => remember("issue", 1, "title", "One"));
    await waitFor(() => electric.writes.length === 1, "POST to the write endpoint");
    expect(electric.writes[0]).toEqual({ changes: [{ op: "upsert", key: factKey(["issue", 1, "title", "One"]), scope: P1 }] });
    await waitFor(() => status("pending")[0] === 0, "ack");
    expect(await serverRows()).toEqual([[factKey(["issue", 1, "title", "One"]), P1]]);
    await settle(200);
    expect(t.events).toEqual(["add"]);
    expect((await client.query(`SELECT count(*)::int AS n FROM ${OUTBOX_TABLE}`)).rows).toEqual([{ n: 0 }]);

    forget("issue", 1, "title", "One");
    await waitFor(() => electric.writes.length === 2, "second POST");
    await waitFor(() => status("pending")[0] === 0, "delete ack");
    expect(await serverRows()).toEqual([]);
    await settle(200);
    expect(t.events).toEqual(["add", "delete"]);
    t.stop();
  });

  it("ships a transaction as one batch", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    transaction(() => {
      scoped(P1, () => {
        for (let i = 0; i < 20; i++) remember("issue", i, "title", `#${i}`);
      });
    });
    await waitFor(() => status("pending")[0] === 0 && electric.writes.length > 0, "ack");
    expect(electric.writes.length).toBe(1);
    expect((electric.writes[0] as { changes: unknown[] }).changes.length).toBe(20);
    expect((await serverRows()).length).toBe(20);
  });

  it("sends replace as a replace op so concurrent replaces converge", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    await insert(["issue", 1, "title", "One"], P1);
    await waitFor(() => has("issue", 1, "title", "One"), "initial row");
    await electric.sql(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", 1, "title", "Stale"]), P1]);
    await waitFor(() => has("issue", 1, "title", "Stale"), "second value");

    replace("issue", 1, "title", "Uno");
    await waitFor(() => electric.writes.length === 1, "POST");
    expect((electric.writes[0] as { changes: unknown[] }).changes).toEqual([
      { op: "delete", key: factKey(["issue", 1, "title", "One"]), scope: "" },
      { op: "delete", key: factKey(["issue", 1, "title", "Stale"]), scope: "" },
      { op: "replace", key: factKey(["issue", 1, "title", "Uno"]), scope: P1 },
    ]);
    await waitFor(() => status("pending")[0] === 0, "ack");
    expect(await serverRows()).toEqual([[factKey(["issue", 1, "title", "Uno"]), P1]]);
    await settle(400);
    expect(db.query(["issue", 1, "title", $.t]).map((b) => b.t)).toEqual(["Uno"]);
  });

  it("retries pushes after a 5xx and clears the error once they land", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    electric.failWritesWith = 503;
    scoped(P1, () => remember("issue", 1, "title", "One"));
    await waitFor(() => electric.writes.length >= 2, "retries");
    expect(status("error").length).toBe(1);
    expect(status("pending")).toEqual([1]);
    electric.failWritesWith = null;
    await waitFor(() => status("pending")[0] === 0, "eventual ack");
    expect(await serverRows()).toEqual([[factKey(["issue", 1, "title", "One"]), P1]]);
    expect(status("error")).toEqual([]);
    expect(has("issue", 1, "title", "One")).toBe(true);
  });

  it("dead-letters a batch the endpoint rejects instead of wedging the queue", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    electric.failWritesWith = 400;
    scoped(P1, () => remember("issue", 1, "title", "One"));
    await waitFor(() => status("pending")[0] === 0 && electric.writes.length === 1, "dead-letter");
    expect(status("error")[0]).toMatch(/400/);
    electric.failWritesWith = null;
    scoped(P1, () => remember("issue", 2, "title", "Two"));
    await waitFor(() => electric.writes.length === 2, "next batch");
    await waitFor(() => status("pending")[0] === 0, "ack");
    expect(await serverRows()).toEqual([[factKey(["issue", 2, "title", "Two"]), P1]]);
  });

  it("honours acknowledged outbox entries left over from a previous session", async () => {
    await insert(["issue", 1, "title", "One"], P1);
    await insert(["issue", 3, "title", "Gone"], P1);
    await client.exec(`
      CREATE TABLE ${OUTBOX_TABLE} (seq SERIAL PRIMARY KEY, key TEXT NOT NULL, op TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '', acked_at TIMESTAMPTZ);
    `);
    await client.query(`INSERT INTO ${OUTBOX_TABLE} (key, op, scope, acked_at) VALUES ($1, 'upsert', $2, now()), ($3, 'delete', '', now())`, [
      factKey(["issue", 2, "title", "Two"]),
      P1,
      factKey(["issue", 3, "title", "Gone"]),
    ]);
    const s = await start({ echoTimeout: 1500 });
    expect(has("issue", 2, "title", "Two")).toBe(true);
    expect(db.scopeOf("issue", 2, "title", "Two")).toBe(P1);
    const gone = trace(["issue", 3, "title", "Gone"]);
    await s.subscribe({ scope: P1 }).ready;
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(has("issue", 3, "title", "Gone")).toBe(false);
    await waitFor(() => has("issue", 3, "title", "Gone"), "echo timeout to re-evaluate the stale delete");
    expect(gone.events).toEqual(["add"]);
    gone.stop();
    await waitFor(() => has("issue", 2, "title", "Two") === false, "unechoed upsert to time out");
    expect((await client.query(`SELECT count(*)::int AS n FROM ${OUTBOX_TABLE}`)).rows).toEqual([{ n: 0 }]);
  });

  it("moves a fact between two subscribed scopes without dropping it", async () => {
    await insert(["issue", 1, "title", "One"], P1);
    const s = await start();
    await Promise.all([s.subscribe({ scope: P1 }).ready, s.subscribe({ scope: P2 }).ready]);
    const t = trace(["issue", 1, "title", "One"]);
    await electric.sql(`UPDATE jam_facts SET scope = $2 WHERE key = $1`, [factKey(["issue", 1, "title", "One"]), P2]);
    await waitFor(() => db.scopeOf("issue", 1, "title", "One") === P2, "scope move");
    await settle(200);
    expect(t.events).toEqual([]);
    t.stop();
  });

  it("refetches one shape on 409 without disturbing another", async () => {
    await insert(["issue", 1, "title", "One"], P1);
    await insert(["issue", 2, "title", "Two"], P2);
    const s = await start();
    await Promise.all([s.subscribe({ scope: P1 }).ready, s.subscribe({ scope: P2 }).ready]);
    const two = trace(["issue", 2, "title", "Two"]);
    const one = trace(["issue", 1, "title", "One"]);
    await server.query(`INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", 1, "status", "todo"]), P1]);
    electric.mustRefetch("scope = $1", [P1]);
    await waitFor(() => has("issue", 1, "status", "todo"), "refetched shape to include the new row");
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(one.events).toEqual([]);
    expect(two.events).toEqual([]);
    one.stop();
    two.stop();
  });

  it("clears a shape table that has rows but no registry entry", async () => {
    const { id } = compileFilter({ scope: P1 });
    await client.exec(`CREATE TABLE "${id}" (key TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT '')`);
    await client.query(`INSERT INTO "${id}" (key, scope) VALUES ($1, $2)`, [factKey(["issue", 9, "title", "Leftover"]), P1]);
    await insert(["issue", 1, "title", "One"], P1);
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    expect(has("issue", 1, "title", "One")).toBe(true);
    expect(has("issue", 9, "title", "Leftover")).toBe(false);
  });

  it("resumes a disposed subscription from its local table and offset", async () => {
    await insert(["issue", 1, "title", "One"], P1);
    const s = await start();
    const first = s.subscribe({ scope: P1 });
    await first.ready;
    await first.dispose();
    expect(has("issue", 1, "title", "One")).toBe(false);
    await insert(["issue", 1, "status", "todo"], P1);

    electric.requests.length = 0;
    const second = s.subscribe({ scope: P1 });
    await second.ready;
    expect(has("issue", 1, "title", "One")).toBe(true);
    await waitFor(() => has("issue", 1, "status", "todo"), "catch-up");
    expect(electric.requests.some((r) => r.includes("offset=-1"))).toBe(false);
    await second.dispose();

    await s.forgetShape({ scope: P1 });
    const tables = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [second.id]);
    expect(tables.rows).toEqual([]);
  });

  it("converges on the server when another client replaces the same attribute", async () => {
    const s = await start();
    await s.subscribe({ scope: P1 }).ready;
    await insert(["issue", 1, "title", "One"], P1);
    await waitFor(() => has("issue", 1, "title", "One"), "seed");
    replace("issue", 1, "title", "From A");
    await s.flush();
    await waitFor(() => status("pending")[0] === 0, "A acked");
    await electric.fetch(electric.writeUrl, {
      method: "POST",
      body: JSON.stringify({ changes: [{ op: "replace", key: factKey(["issue", 1, "title", "From B"]), scope: P1 }] }),
    });
    expect(await serverRows()).toEqual([[factKey(["issue", 1, "title", "From B"]), P1]]);
    await waitFor(() => db.query(["issue", 1, "title", $.t]).map((x) => x.t).join() === "From B", "convergence on the server value");
  });
});
