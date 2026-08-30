import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { db, $, _ } from "../db";
import { replace, remember, forget, transaction, whenever } from "../primitives";
import { syncTable, diffRows, rowsToMap, toTerm, type SyncedTable } from "../tables";
import type { JamPGlite } from "../pglite";

let pg: JamPGlite;
const bindings: SyncedTable[] = [];

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Wait for the writer's microtask flush and PGlite's live-query refresh to settle. */
async function settle(ms = 60) {
  await new Promise((r) => setTimeout(r, ms));
}

async function bind(options: Parameters<typeof syncTable>[1]) {
  const binding = syncTable(pg, options);
  bindings.push(binding);
  await binding.ready;
  return binding;
}

function facts(entity: string, id?: string | number) {
  const rows = id === undefined ? db.query([entity, $.id, $.col, $.val]) : db.query([entity, id, $.col, $.val]);
  return rows.map((b) => (id === undefined ? [b.id, b.col, b.val] : [b.col, b.val])).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function sql<T = Record<string, unknown>>(query: string, params?: unknown[]) {
  return (await pg.query<T>(query, params as any[])).rows;
}

beforeAll(async () => {
  pg = await PGlite.create({ dataDir: "memory://", extensions: { live } });
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`
    DROP TABLE IF EXISTS todo;
    CREATE TABLE todo (
      id TEXT PRIMARY KEY,
      title TEXT,
      done BOOLEAN NOT NULL DEFAULT false,
      priority INT,
      due TIMESTAMPTZ,
      meta JSONB,
      synced BOOLEAN GENERATED ALWAYS AS (priority IS NOT NULL) STORED
    );
    INSERT INTO todo (id, title, done, priority) VALUES
      ('a', 'Buy milk', false, 1),
      ('b', 'Walk dog', true, 2);
  `);
  db.clear();
});

afterEach(async () => {
  while (bindings.length) await bindings.pop()!.dispose();
});

describe("helpers", () => {
  it("toTerm serializes SQL values into terms", () => {
    expect(toTerm(null)).toBeNull();
    expect(toTerm(undefined)).toBeNull();
    expect(toTerm("x")).toBe("x");
    expect(toTerm(3)).toBe(3);
    expect(toTerm(true)).toBe(true);
    expect(toTerm(10n)).toBe(10);
    expect(toTerm(new Date("2024-01-02T03:04:05.000Z"))).toBe("2024-01-02T03:04:05.000Z");
    expect(toTerm({ a: [1] })).toBe('{"a":[1]}');
  });

  it("diffRows reports changed cells, cleared cells, and removed rows", () => {
    const prev = rowsToMap([{ id: 1, t: "a", n: 1 }, { id: 2, t: "b", n: null }], "id");
    const next = rowsToMap([{ id: 1, t: "a", n: null }, { id: 3, t: "c", n: 3 }], "id");
    const diff = diffRows(prev, next);
    expect(diff.sets.sort()).toEqual([[3, "n", 3], [3, "t", "c"]]);
    expect(diff.clears.sort()).toEqual([[1, "n"], [2, "t"]]);
  });
});

describe("syncTable read side", () => {
  it("mirrors the initial rows as facts", async () => {
    await bind({ table: "todo" });
    expect(facts("todo", "a")).toEqual([["done", false], ["priority", 1], ["synced", true], ["title", "Buy milk"]]);
    expect(facts("todo", "b")).toEqual([["done", true], ["priority", 2], ["synced", true], ["title", "Walk dog"]]);
  });

  it("follows INSERT, UPDATE, and DELETE executed directly on the table", async () => {
    await bind({ table: "todo" });
    await pg.query(`INSERT INTO todo (id, title) VALUES ('c', 'New')`);
    await settle();
    expect(facts("todo", "c")).toEqual([["done", false], ["synced", false], ["title", "New"]]);

    await pg.query(`UPDATE todo SET title = 'Renamed', priority = NULL WHERE id = 'a'`);
    await settle();
    expect(facts("todo", "a")).toEqual([["done", false], ["synced", false], ["title", "Renamed"]]);

    await pg.query(`DELETE FROM todo WHERE id = 'b'`);
    await settle();
    expect(facts("todo", "b")).toEqual([]);
  });

  it("follows writes made inside a transaction the way Electric applies them", async () => {
    await bind({ table: "todo" });
    await pg.transaction(async (tx) => {
      await tx.exec(`SET LOCAL electric.syncing = true`);
      await tx.query(`INSERT INTO todo (id, title, done) VALUES ('z', 'Remote', true) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`);
      await tx.query(`UPDATE todo SET done = true WHERE id = 'a'`);
    });
    await settle();
    expect(facts("todo", "z")).toEqual([["done", true], ["synced", false], ["title", "Remote"]]);
    expect(db.query(["todo", "a", "done", $.d])).toEqual([{ d: true }]);
  });

  it("serializes dates and JSON, and treats NULL as absence", async () => {
    await pg.query(`UPDATE todo SET due = '2024-05-06T07:08:09Z', meta = '{"tags":["x"]}' WHERE id = 'a'`);
    await bind({ table: "todo" });
    expect(db.query(["todo", "a", "due", $.v])).toEqual([{ v: "2024-05-06T07:08:09.000Z" }]);
    expect(db.query(["todo", "a", "meta", $.v])).toEqual([{ v: '{"tags":["x"]}' }]);
    expect(db.query(["todo", "a", "due", $.v]).length).toBe(1);
    expect(db.query(["todo", "b", "due", $.v])).toEqual([]);
  });

  it("uses a custom entity name and key column", async () => {
    await pg.exec(`CREATE TABLE person (email TEXT PRIMARY KEY, name TEXT); INSERT INTO person VALUES ('x@y.z', 'X')`);
    const binding = await bind({ table: "person", key: "email", entity: "user" });
    expect(db.query(["user", "x@y.z", "name", $.n])).toEqual([{ n: "X" }]);
    replace("user", "x@y.z", "name", "Y");
    await settle();
    expect(await sql(`SELECT name FROM person`)).toEqual([{ name: "Y" }]);
    await binding.dispose();
    bindings.splice(bindings.indexOf(binding), 1);
    await pg.exec(`DROP TABLE person`);
  });

  it("drops a row from facts when an update moves it out of the filter", async () => {
    await bind({ table: "todo", query: `SELECT * FROM todo WHERE done = false` });
    expect(facts("todo", "a").length).toBeGreaterThan(0);
    expect(facts("todo", "b")).toEqual([]);
    await pg.query(`UPDATE todo SET done = true WHERE id = 'a'`);
    await settle();
    expect(facts("todo", "a")).toEqual([]);
  });

  it("emits ordering and meta facts for a windowed query and moves the window on refresh", async () => {
    await pg.query(`INSERT INTO todo (id, title) VALUES ('c', 'C'), ('d', 'D'), ('e', 'E')`);
    const list = await bind({
      table: "todo",
      query: `SELECT * FROM todo ORDER BY id`,
      offset: 0,
      limit: 2,
      name: "list",
    });
    expect(db.query(["query", "list", "row", $.i, $.id]).sort((x, y) => Number(x.i) - Number(y.i))).toEqual([
      { i: 0, id: "a" },
      { i: 1, id: "b" },
    ]);
    expect(db.query(["query", "list", "total", $.n])).toEqual([{ n: 5 }]);
    expect(db.query(["query", "list", "offset", $.n])).toEqual([{ n: 0 }]);
    expect(db.query(["query", "list", "limit", $.n])).toEqual([{ n: 2 }]);
    expect(db.query(["query", "list", "ready", true])).toEqual([{}]);
    expect(facts("todo", "c")).toEqual([]);

    await list.refresh({ offset: 2, limit: 2 });
    await settle();
    expect(db.query(["query", "list", "row", $.i, $.id]).sort((x, y) => Number(x.i) - Number(y.i))).toEqual([
      { i: 2, id: "c" },
      { i: 3, id: "d" },
    ]);
    expect(db.query(["query", "list", "offset", $.n])).toEqual([{ n: 2 }]);
    expect(facts("todo", "a")).toEqual([]);
    expect(facts("todo", "c").length).toBeGreaterThan(0);
  });

  it("updates the total when rows are added outside the window", async () => {
    await bind({ table: "todo", query: `SELECT * FROM todo ORDER BY id`, offset: 0, limit: 1, name: "list" });
    await pg.query(`INSERT INTO todo (id, title) VALUES ('zz', 'Z')`);
    await settle(120);
    expect(db.query(["query", "list", "total", $.n])).toEqual([{ n: 3 }]);
  });

  it("refcounts cells shared by two bindings on the same entity", async () => {
    const all = await bind({ table: "todo" });
    const detail = await bind({ table: "todo", query: `SELECT * FROM todo WHERE id = 'a'`, name: "detail" });
    expect(facts("todo", "a").length).toBe(4);
    await detail.dispose();
    bindings.splice(bindings.indexOf(detail), 1);
    expect(facts("todo", "a").length).toBe(4);
    expect(db.query(["query", "detail", $.k, $.v])).toEqual([]);
    await all.dispose();
    bindings.splice(bindings.indexOf(all), 1);
    expect(facts("todo")).toEqual([]);
  });

  it("keeps a row held by a second binding when it leaves the first binding's window", async () => {
    await bind({ table: "todo", query: `SELECT * FROM todo WHERE id = 'a'` });
    const list = await bind({ table: "todo", query: `SELECT * FROM todo ORDER BY id`, offset: 0, limit: 1, name: "list" });
    await list.refresh({ offset: 1, limit: 1 });
    await settle();
    expect(db.query(["query", "list", "row", $.i, $.id])).toEqual([{ i: 1, id: "b" }]);
    expect(facts("todo", "a").length).toBe(4);
  });

  it("hands a query name over to a newer binding so the old one can be disposed afterwards", async () => {
    await pg.query(`INSERT INTO todo (id, title) VALUES ('c', 'C')`);
    const old = await bind({ table: "todo", query: `SELECT * FROM todo ORDER BY id`, offset: 0, limit: 3, name: "list" });
    const next = await bind({ table: "todo", query: `SELECT * FROM todo WHERE done = false ORDER BY id`, name: "list" });
    expect(db.query(["query", "list", "row", $.i, $.id]).sort((x, y) => Number(x.i) - Number(y.i))).toEqual([
      { i: 0, id: "a" },
      { i: 1, id: "c" },
    ]);
    expect(db.query(["query", "list", "limit", $.n])).toEqual([]);

    await old.dispose();
    bindings.splice(bindings.indexOf(old), 1);
    expect(db.query(["query", "list", "row", $.i, $.id]).sort((x, y) => Number(x.i) - Number(y.i))).toEqual([
      { i: 0, id: "a" },
      { i: 1, id: "c" },
    ]);
    expect(db.query(["query", "list", "total", $.n])).toEqual([{ n: 2 }]);
    expect(facts("todo", "a").length).toBe(4);
    expect(facts("todo", "b")).toEqual([]);

    await pg.query(`UPDATE todo SET done = false WHERE id = 'b'`);
    await settle();
    expect(db.query(["query", "list", "row", $.i, $.id]).length).toBe(3);

    await next.dispose();
    bindings.splice(bindings.indexOf(next), 1);
    expect(db.query(["query", "list", $.k, $.v])).toEqual([]);
    expect(facts("todo")).toEqual([]);
  });

  it("reports rows without the key column through onError", async () => {
    const onError = vi.fn();
    await bind({ table: "todo", query: `SELECT title FROM todo`, onError });
    expect(onError).toHaveBeenCalled();
    expect(facts("todo")).toEqual([]);
  });
});

describe("syncTable write side", () => {
  it("writes replace() as an UPDATE", async () => {
    await bind({ table: "todo" });
    replace("todo", "a", "title", "Buy oat milk");
    await settle();
    expect(await sql(`SELECT title FROM todo WHERE id = 'a'`)).toEqual([{ title: "Buy oat milk" }]);
    expect(db.query(["todo", "a", "title", $.t])).toEqual([{ t: "Buy oat milk" }]);
  });

  it("batches several replace() calls in one transaction into one round trip", async () => {
    await bind({ table: "todo" });
    const spy = vi.spyOn(pg, "transaction");
    transaction(() => {
      replace("todo", "a", "title", "T");
      replace("todo", "a", "done", true);
      replace("todo", "b", "priority", 9);
    });
    await settle();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(await sql(`SELECT title, done FROM todo WHERE id = 'a'`)).toEqual([{ title: "T", done: true }]);
    expect(await sql(`SELECT priority FROM todo WHERE id = 'b'`)).toEqual([{ priority: 9 }]);
  });

  it("inserts a row when facts appear for a new id", async () => {
    await bind({ table: "todo" });
    transaction(() => {
      remember("todo", "n", "title", "Brand new");
      remember("todo", "n", "priority", 3);
    });
    await settle();
    expect(await sql(`SELECT title, priority, done FROM todo WHERE id = 'n'`)).toEqual([{ title: "Brand new", priority: 3, done: false }]);
    expect(facts("todo", "n")).toEqual([["done", false], ["priority", 3], ["synced", true], ["title", "Brand new"]]);
  });

  it("deletes the row when every fact for the id is retracted", async () => {
    await bind({ table: "todo" });
    forget("todo", "b", _, _);
    await settle();
    expect(await sql(`SELECT id FROM todo WHERE id = 'b'`)).toEqual([]);
    expect(facts("todo", "b")).toEqual([]);
  });

  it("still deletes the row when another binding re-mirrors it before the debounced write runs", async () => {
    await bind({ table: "todo", query: `SELECT * FROM todo WHERE id = 'b'`, writeDebounce: 50 });
    forget("todo", "b", _, _);
    // A new query over the same rows lands while the DELETE is still queued.
    await bind({ table: "todo", name: "all" });
    expect(facts("todo", "b")).toEqual([]);
    expect(facts("todo", "a").length).toBeGreaterThan(0);
    await settle(150);
    expect(await sql(`SELECT id FROM todo WHERE id = 'b'`)).toEqual([]);
    expect(facts("todo", "b")).toEqual([]);
    expect(db.query(["query", "all", "row", $.i, "b"])).toEqual([]);
  });

  it("treats a row retracted and re-asserted in one transaction as an update, not a delete", async () => {
    await bind({ table: "todo", readonly: ["synced"] });
    transaction(() => {
      forget("todo", "b", _, _);
      replace("todo", "b", "title", "Walk cat");
      replace("todo", "b", "done", false);
      replace("todo", "b", "priority", 5);
    });
    await settle();
    expect(await sql(`SELECT title, done, priority FROM todo WHERE id = 'b'`)).toEqual([
      { title: "Walk cat", done: false, priority: 5 },
    ]);
  });

  it("deletes the row even when the last fact retracted is a readonly column", async () => {
    await bind({ table: "todo", readonly: ["synced"] });
    transaction(() => {
      forget("todo", "b", "title", _);
      forget("todo", "b", "done", _);
      forget("todo", "b", "priority", _);
      forget("todo", "b", "synced", _);
    });
    await settle();
    expect(await sql(`SELECT id FROM todo WHERE id = 'b'`)).toEqual([]);
  });

  it("sets a column to NULL when a single attribute is retracted", async () => {
    await bind({ table: "todo" });
    forget("todo", "a", "priority", 1);
    await settle();
    expect(await sql(`SELECT priority FROM todo WHERE id = 'a'`)).toEqual([{ priority: null }]);
  });

  it("never writes readonly columns", async () => {
    const onError = vi.fn();
    await bind({ table: "todo", readonly: ["synced"], onError });
    replace("todo", "a", "synced", false);
    replace("todo", "a", "title", "Still fine");
    await settle();
    expect(onError).not.toHaveBeenCalled();
    expect(await sql(`SELECT title, synced FROM todo WHERE id = 'a'`)).toEqual([{ title: "Still fine", synced: true }]);
  });

  it("does not echo its own mirrored facts back as SQL", async () => {
    await bind({ table: "todo" });
    const spy = vi.spyOn(pg, "transaction");
    await pg.query(`UPDATE todo SET title = 'From SQL' WHERE id = 'a'`);
    await settle();
    expect(db.query(["todo", "a", "title", $.t])).toEqual([{ t: "From SQL" }]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("writes facts derived by a rule from synced facts", async () => {
    await bind({ table: "todo" });
    const stop = whenever([["todo", $.id, "done", true]], (matches) => {
      for (const { id } of matches) db.replace("todo", id, "priority", 0);
    });
    await settle();
    expect(await sql(`SELECT priority FROM todo WHERE id = 'b'`)).toEqual([{ priority: 0 }]);
    await pg.query(`UPDATE todo SET done = true WHERE id = 'a'`);
    await settle();
    expect(await sql(`SELECT priority FROM todo WHERE id = 'a'`)).toEqual([{ priority: 0 }]);
    stop();
  });

  it("keeps the local value when a conflicting live result arrives while a write is pending", async () => {
    await bind({ table: "todo", writeDebounce: 200 });
    replace("todo", "a", "title", "typing…");
    await pg.query(`UPDATE todo SET title = 'remote' WHERE id = 'a'`);
    await settle();
    expect(db.query(["todo", "a", "title", $.t])).toEqual([{ t: "typing…" }]);
    await settle(300);
    expect(await sql(`SELECT title FROM todo WHERE id = 'a'`)).toEqual([{ title: "typing…" }]);
    expect(db.query(["todo", "a", "title", $.t])).toEqual([{ t: "typing…" }]);
  });

  it("debounces writes when writeDebounce is set", async () => {
    await bind({ table: "todo", writeDebounce: 50 });
    const spy = vi.spyOn(pg, "transaction");
    replace("todo", "a", "title", "1");
    await settle(10);
    replace("todo", "a", "title", "12");
    await settle(10);
    replace("todo", "a", "title", "123");
    await settle(120);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(await sql(`SELECT title FROM todo WHERE id = 'a'`)).toEqual([{ title: "123" }]);
  });

  it("reports SQL failures through onError and keeps working", async () => {
    const onError = vi.fn();
    await bind({ table: "todo", onError });
    replace("todo", "a", "no_such_column", 1);
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    replace("todo", "a", "title", "after error");
    await settle();
    expect(await sql(`SELECT title FROM todo WHERE id = 'a'`)).toEqual([{ title: "after error" }]);
  });

  it("does not write when writable is false", async () => {
    await bind({ table: "todo", writable: false });
    replace("todo", "a", "title", "local only");
    await settle();
    expect(await sql(`SELECT title FROM todo WHERE id = 'a'`)).toEqual([{ title: "Buy milk" }]);
  });

  it("rejects a second binding that maps the entity to a different table", async () => {
    await bind({ table: "todo" });
    expect(() => syncTable(pg, { table: "other", entity: "todo" })).toThrow(/already bound/);
  });

  it("flushes pending writes on dispose", async () => {
    const binding = await bind({ table: "todo", writeDebounce: 10000 });
    replace("todo", "a", "title", "flushed");
    await binding.dispose();
    bindings.splice(bindings.indexOf(binding), 1);
    expect(await sql(`SELECT title FROM todo WHERE id = 'a'`)).toEqual([{ title: "flushed" }]);
  });
});
