import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { db, $, _ } from "../db";
import { whenever, replace, claim, remember } from "../primitives";
import { persist } from "../persist";
import type { JamPGlite } from "../pglite";

let pg: JamPGlite;
const disposers: Array<() => Promise<void>> = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rows(): Promise<Array<[string, unknown[]]>> {
  const res = await pg.query<{ key: string; terms: unknown[] }>(`SELECT key, terms FROM jam_local_facts ORDER BY key`);
  return res.rows.map((r) => [r.key, r.terms]);
}

async function start(opts: Parameters<typeof persist>[0] = {}) {
  const dispose = await persist({ pg, debounce: 10, ...opts });
  disposers.push(dispose);
  return dispose;
}

beforeAll(async () => {
  pg = await PGlite.create({ dataDir: "memory://", extensions: { live } });
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  while (disposers.length) await disposers.pop()!();
  await pg.exec(`DROP TABLE IF EXISTS jam_local_facts`);
  db.clear();
});

describe("persist", () => {
  it("creates the table and flushes asserted facts after the debounce", async () => {
    await start();
    db.insert("todo", 1, "title", "Buy milk");
    db.insert("todo", 1, "done", false);
    expect(await rows()).toEqual([]);
    await sleep(30);
    expect(await rows()).toEqual([
      [JSON.stringify(["todo", 1, "done", false]), ["todo", 1, "done", false]],
      [JSON.stringify(["todo", 1, "title", "Buy milk"]), ["todo", 1, "title", "Buy milk"]],
    ]);
  });

  it("restores persisted facts on start with their original types", async () => {
    await pg.exec(`CREATE TABLE jam_local_facts (key TEXT PRIMARY KEY, terms JSONB NOT NULL)`);
    await pg.query(`INSERT INTO jam_local_facts (key, terms) VALUES ($1, $2), ($3, $4)`, [
      JSON.stringify(["todo", 1, "title", "A"]),
      JSON.stringify(["todo", 1, "title", "A"]),
      JSON.stringify(["counter", "n", 42]),
      JSON.stringify(["counter", "n", 42]),
    ]);
    await start();
    expect(db.query(["todo", $.id, "title", $.t])).toEqual([{ id: 1, t: "A" }]);
    expect(db.query(["counter", "n", $.n])).toEqual([{ n: 42 }]);
    expect(typeof db.query(["counter", "n", $.n])[0].n).toBe("number");
  });

  it("does not write restored facts back", async () => {
    await pg.exec(`CREATE TABLE jam_local_facts (key TEXT PRIMARY KEY, terms JSONB NOT NULL)`);
    await pg.query(`INSERT INTO jam_local_facts (key, terms) VALUES ($1, $2)`, [
      JSON.stringify(["todo", 1, "title", "A"]),
      JSON.stringify(["todo", 1, "title", "A"]),
    ]);
    await start();
    const before = await rows();
    await sleep(30);
    expect(await rows()).toEqual(before);
  });

  it("deletes retracted facts", async () => {
    await start();
    db.insert("todo", 1, "title", "A");
    await sleep(30);
    expect(await rows()).toHaveLength(1);
    db.drop("todo", 1, "title", "A");
    await sleep(30);
    expect(await rows()).toEqual([]);
  });

  it("replace() replaces the old fact with the new one", async () => {
    await start();
    replace("todo", 1, "title", "A");
    await sleep(30);
    replace("todo", 1, "title", "B");
    await sleep(30);
    expect(await rows()).toEqual([[JSON.stringify(["todo", 1, "title", "B"]), ["todo", 1, "title", "B"]]]);
  });

  it("collapses add+delete of the same key within one debounce window", async () => {
    await start();
    db.insert("todo", 1, "title", "A");
    db.drop("todo", 1, "title", "A");
    await sleep(30);
    expect(await rows()).toEqual([]);
  });

  it("excludes VDOM facts by default", async () => {
    await start();
    db.insert("dom:0", "tag", "div");
    db.insert("dom", "child", 0, "dom:0");
    db.insert("app", "ready", true);
    await sleep(30);
    expect(await rows()).toEqual([[JSON.stringify(["app", "ready", true]), ["app", "ready", true]]]);
  });

  it("include allowlist overrides exclude", async () => {
    await start({ include: (f) => f[0] === "ui" });
    db.insert("ui", "menu", "open", true);
    db.insert("todo", 1, "title", "A");
    db.insert("dom:0", "tag", "div");
    await sleep(30);
    expect(await rows()).toEqual([[JSON.stringify(["ui", "menu", "open", true]), ["ui", "menu", "open", true]]]);
  });

  it("skips claimed facts and their revocation; a later remember() of the same fact is persisted", async () => {
    await start();
    replace("todo", 1, "done", true);
    const stop = whenever([["todo", $.id, "done", true]], (matches) => {
      for (const { id } of matches) claim("todo", id, "class", "completed");
    });
    await sleep(30);
    expect((await rows()).map(([k]) => k)).toEqual([JSON.stringify(["todo", 1, "done", true])]);
    remember("todo", 1, "class", "completed");
    replace("todo", 1, "done", false);
    await sleep(30);
    expect((await rows()).map(([k]) => k)).toEqual([
      JSON.stringify(["todo", 1, "class", "completed"]),
      JSON.stringify(["todo", 1, "done", false]),
    ]);
    stop();
  });

  it("the disposer flushes pending writes and stops observing", async () => {
    const dispose = await start();
    db.insert("todo", 1, "title", "A");
    await dispose();
    expect(await rows()).toHaveLength(1);
    db.insert("todo", 2, "title", "B");
    await sleep(30);
    expect(await rows()).toHaveLength(1);
  });

  it("round-trips through two sessions", async () => {
    const dispose = await start();
    db.insert("todo", 1, "title", "A");
    db.insert("todo", 1, "done", false);
    db.insert("counter", "n", 3.5);
    await dispose();
    disposers.pop();
    const before = db.query([$.a, $.b, $.c]).concat(db.query([$.a, $.b, $.c, $.d]) as any);
    db.clear();
    await start();
    const after = db.query([$.a, $.b, $.c]).concat(db.query([$.a, $.b, $.c, $.d]) as any);
    expect(after).toEqual(before);
    expect(db.query(["todo", 1, "done", $.d])).toEqual([{ d: false }]);
  });

  it("retracting with a wildcard removes every matching row", async () => {
    await start();
    db.insert("todo", 1, "tag", "a");
    db.insert("todo", 1, "tag", "b");
    db.insert("todo", 2, "tag", "c");
    await sleep(30);
    db.drop("todo", 1, "tag", _);
    await sleep(30);
    expect(await rows()).toEqual([[JSON.stringify(["todo", 2, "tag", "c"]), ["todo", 2, "tag", "c"]]]);
  });
});
