import { describe, it, expect, beforeEach } from "vitest";
import { memoryStorage, type FactStorage } from "@jam/engine/storage";
import { db, $, _ } from "../db";
import { whenever, replace, claim, remember, scoped } from "../primitives";
import { persist } from "../persist";

let storage: FactStorage;
const disposers: Array<() => Promise<void>> = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rows(): Promise<Array<[string, unknown[]]>> {
  const facts = await storage.load();
  return facts.map((f) => [JSON.stringify(f.terms), f.terms] as [string, unknown[]]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

async function start(opts: Parameters<typeof persist>[0] = {}) {
  const dispose = await persist({ storage, debounce: 10, ...opts });
  disposers.push(dispose);
  return dispose;
}

beforeEach(async () => {
  while (disposers.length) await disposers.pop()!();
  storage = memoryStorage();
  db.clear();
});

describe("persist", () => {
  it("flushes asserted facts after the debounce", async () => {
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

  it("restores persisted facts on start with their original types and scopes", async () => {
    await storage.write({
      upserts: [
        { terms: ["todo", 1, "title", "A"], scope: "project:p1" },
        { terms: ["counter", "n", 42], scope: "" },
      ],
    });
    await start();
    expect(db.query(["todo", $.id, "title", $.t])).toEqual([{ id: 1, t: "A" }]);
    expect(db.query(["counter", "n", $.n])).toEqual([{ n: 42 }]);
    expect(typeof db.query(["counter", "n", $.n])[0].n).toBe("number");
    expect(db.scopeOf("todo", 1, "title", "A")).toBe("project:p1");
  });

  it("does not write restored facts back", async () => {
    await storage.write({ upserts: [{ terms: ["todo", 1, "title", "A"], scope: "" }] });
    await start();
    const before = await rows();
    await sleep(30);
    expect(await rows()).toEqual(before);
  });

  it("stores the scope of each fact", async () => {
    await start();
    scoped("project:p1", () => remember("issue", "i1", "title", "A"));
    remember("issue", "i1", "status", "todo");
    await sleep(30);
    const facts = await storage.load();
    expect(facts.map((f) => f.scope)).toEqual(["project:p1", "project:p1"]);
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
