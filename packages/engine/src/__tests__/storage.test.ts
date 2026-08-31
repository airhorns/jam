import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { memoryStorage, type FactStorage } from "../storage/index";
import { indexedDBStorage } from "../storage/indexeddb";
import { sqliteStorage } from "../storage/sqlite";

const adapters: [string, () => Promise<FactStorage>][] = [
  ["memory", async () => memoryStorage()],
  ["sqlite", async () => sqliteStorage(":memory:")],
  ["indexeddb", () => indexedDBStorage(`test-${Math.random().toString(36).slice(2)}`)],
];

describe.each(adapters)("%s storage", (_name, make) => {
  it("stores facts keyed by their terms", async () => {
    const s = await make();
    await s.write({
      upserts: [
        { terms: ["todo", 1, "title", "a"], scope: "" },
        { terms: ["todo", 1, "title", "a"], scope: "p1" },
        { terms: ["todo", 2, "done", true], scope: "" },
      ],
    });
    await s.write({ deletes: [["todo", 2, "done", true]], upserts: [{ terms: ["todo", 3], scope: "" }] });
    const facts = (await s.load()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(facts).toEqual([
      { terms: ["todo", 1, "title", "a"], scope: "p1" },
      { terms: ["todo", 3], scope: "" },
    ]);
    await s.close();
  });

  it("keeps meta and an ordered log", async () => {
    const s = await make();
    expect(await s.getMeta("seq")).toBeUndefined();
    expect(await s.logHead()).toBe(0);
    await s.write({
      log: [
        { seq: 1, op: "upsert", terms: ["a", 1], scope: "" },
        { seq: 2, op: "delete", terms: ["a", 1], scope: "" },
        { seq: 3, op: "replace", terms: ["a", 2], scope: "s" },
      ],
      meta: { seq: "3" },
    });
    expect(await s.getMeta("seq")).toBe("3");
    expect(await s.logHead()).toBe(3);
    expect(await s.readLog(1)).toEqual([
      { seq: 2, op: "delete", terms: ["a", 1], scope: "" },
      { seq: 3, op: "replace", terms: ["a", 2], scope: "s" },
    ]);
    expect(await s.readLog(0, 1)).toHaveLength(1);
    await s.trimLog(2);
    expect(await s.readLog(0)).toEqual([{ seq: 3, op: "replace", terms: ["a", 2], scope: "s" }]);
    await s.write({ meta: { seq: undefined } });
    expect(await s.getMeta("seq")).toBeUndefined();
    await s.close();
  });
});
