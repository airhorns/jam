import "fake-indexeddb/auto";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterAll, describe, expect, it } from "vitest";

import { FORMAT_VERSION, memoryStorage, type FactStorage } from "../storage/index";
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

  it("keeps meta and a log whose seqs it assigns", async () => {
    const s = await make();
    expect(await s.getMeta("seq")).toBeUndefined();
    expect(await s.logHead()).toBe(0);
    expect(await s.write({ meta: { seq: "3" } })).toEqual([]);
    expect(
      await s.write({
        log: [
          { op: "upsert", terms: ["a", 1], scope: "" },
          { op: "delete", terms: ["a", 1], scope: "" },
          { op: "replace", terms: ["a", 2], scope: "s" },
        ],
      }),
    ).toEqual([1, 2, 3]);
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

  it("never reuses a seq, even after the log is emptied", async () => {
    const s = await make();
    await s.write({ log: [{ op: "upsert", terms: ["a", 1], scope: "" }] });
    await s.trimLog(1);
    expect(await s.logHead()).toBe(0);
    expect(await s.write({ log: [{ op: "upsert", terms: ["a", 2], scope: "" }] })).toEqual([2]);
    expect(await s.readLog(0)).toEqual([{ seq: 2, op: "upsert", terms: ["a", 2], scope: "" }]);
    await s.close();
  });
});

describe("format versions", () => {
  const dir = mkdtempSync(join(tmpdir(), "jam-storage-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("sqlite keeps data written at the current version and discards anything older", async () => {
    const path = join(dir, "facts.db");
    const first = sqliteStorage(path);
    await first.write({ upserts: [{ terms: ["a", 1], scope: "" }], log: [{ op: "upsert", terms: ["a", 1], scope: "" }] });
    await first.close();

    const second = sqliteStorage(path);
    expect(await second.load()).toEqual([{ terms: ["a", 1], scope: "" }]);
    expect(await second.logHead()).toBe(1);
    await second.close();

    const raw = new DatabaseSync(path);
    raw.exec(`PRAGMA user_version = ${FORMAT_VERSION - 1}`);
    raw.close();
    const third = sqliteStorage(path);
    expect(await third.load()).toEqual([]);
    expect(await third.logHead()).toBe(0);
    await third.write({ upserts: [{ terms: ["b", 2], scope: "" }] });
    await third.close();

    const fourth = sqliteStorage(path);
    expect(await fourth.load()).toEqual([{ terms: ["b", 2], scope: "" }]);
    await fourth.close();
  });

  it("indexeddb replaces the stores of a database opened at an older version", async () => {
    const name = `versioned-${Math.random().toString(36).slice(2)}`;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(name, FORMAT_VERSION - 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("facts", { keyPath: "key" });
        req.result.createObjectStore("stale");
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("facts", "readwrite");
        tx.objectStore("facts").put({ key: "x", terms: ["x"], scope: "" });
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const s = await indexedDBStorage(name);
    expect(await s.load()).toEqual([]);
    await s.write({ upserts: [{ terms: ["a", 1], scope: "" }] });
    await s.close();

    const reopened = await indexedDBStorage(name);
    expect(await reopened.load()).toEqual([{ terms: ["a", 1], scope: "" }]);
    await reopened.close();
    const names = await new Promise<string[]>((resolve, reject) => {
      const req = indexedDB.open(name, FORMAT_VERSION);
      req.onsuccess = () => {
        resolve(Array.from(req.result.objectStoreNames));
        req.result.close();
      };
      req.onerror = () => reject(req.error);
    });
    expect(names.sort()).toEqual(["facts", "log", "meta"]);
  });
});
