import { describe, it, expect, beforeEach } from "vitest";
import { FactDB, $, _, matchPattern } from "../db";

describe("matchPattern", () => {
  it("matches exact facts", () => {
    expect(matchPattern(["todo", 1, "title", "Buy milk"], ["todo", 1, "title", "Buy milk"])).toEqual({});
  });

  it("rejects length mismatch", () => {
    expect(matchPattern(["todo", 1], ["todo", 1, "title"])).toBeNull();
  });

  it("rejects value mismatch", () => {
    expect(matchPattern(["todo", 1, "title", "Buy milk"], ["todo", 1, "title", "Sell milk"])).toBeNull();
  });

  it("binds variables with $", () => {
    const result = matchPattern(["todo", $.id, "title", $.title], ["todo", 1, "title", "Buy milk"]);
    expect(result).toEqual({ id: 1, title: "Buy milk" });
  });

  it("enforces consistent bindings", () => {
    // $.x appears twice — both positions must have the same value
    expect(matchPattern([$.x, $.x], [1, 1])).toEqual({ x: 1 });
    expect(matchPattern([$.x, $.x], [1, 2])).toBeNull();
  });

  it("matches wildcards", () => {
    expect(matchPattern(["todo", _, "title", $.t], ["todo", 99, "title", "X"])).toEqual({ t: "X" });
  });
});

describe("FactDB", () => {
  let db: FactDB;

  beforeEach(() => {
    db = new FactDB();
  });

  describe("assert / retract", () => {
    it("asserts and queries a fact", () => {
      db.assert("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(1);
      const results = db.query(["todo", $.id, "title", $.title]);
      expect(results).toEqual([{ id: 1, title: "Buy milk" }]);
    });

    it("deduplicates identical facts", () => {
      db.assert("todo", 1, "title", "Buy milk");
      db.assert("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(1);
    });

    it("retracts an exact fact", () => {
      db.assert("todo", 1, "title", "Buy milk");
      db.retract("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(0);
    });

    it("retract is a no-op for missing facts", () => {
      db.retract("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(0);
    });

    it("retracts with wildcard", () => {
      db.assert("todo", 1, "title", "Buy milk");
      db.assert("todo", 1, "done", false);
      db.assert("todo", 2, "title", "Sell milk");
      db.retract("todo", 1, _, _);
      expect(db.facts.size).toBe(1);
      expect(db.query(["todo", $.id, "title", $.title])).toEqual([{ id: 2, title: "Sell milk" }]);
    });

    it("wildcard retract only removes matching-length facts", () => {
      db.assert("todo", 1, "title", "Buy milk");
      db.assert("short", 1);
      db.retract(_, _); // only matches 2-term facts
      expect(db.facts.size).toBe(1);
    });
  });

  describe("set (upsert)", () => {
    it("sets a new value", () => {
      db.set("todo", 1, "title", "Buy milk");
      expect(db.query(["todo", 1, "title", $.title])).toEqual([{ title: "Buy milk" }]);
    });

    it("replaces old value at same key path", () => {
      db.set("todo", 1, "done", false);
      db.set("todo", 1, "done", true);
      const results = db.query(["todo", 1, "done", $.done]);
      expect(results).toEqual([{ done: true }]);
      // Only one fact should remain, not two
      expect(db.facts.size).toBe(1);
    });

    it("doesn't affect other key paths", () => {
      db.set("todo", 1, "title", "Buy milk");
      db.set("todo", 1, "done", false);
      db.set("todo", 1, "done", true);
      expect(db.query(["todo", 1, "title", $.title])).toEqual([{ title: "Buy milk" }]);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      db.assert("todo", 1, "title", "Buy milk");
      db.assert("todo", 1, "done", false);
      db.assert("todo", 2, "title", "Walk dog");
      db.assert("todo", 2, "done", true);
    });

    it("queries single pattern", () => {
      const results = db.query(["todo", $.id, "title", $.title]);
      expect(results).toHaveLength(2);
      expect(results).toContainEqual({ id: 1, title: "Buy milk" });
      expect(results).toContainEqual({ id: 2, title: "Walk dog" });
    });

    it("joins two patterns on shared variable", () => {
      const results = db.query(
        ["todo", $.id, "title", $.title],
        ["todo", $.id, "done", $.done],
      );
      expect(results).toHaveLength(2);
      expect(results).toContainEqual({ id: 1, title: "Buy milk", done: false });
      expect(results).toContainEqual({ id: 2, title: "Walk dog", done: true });
    });

    it("filters with literal values in pattern", () => {
      const results = db.query(["todo", $.id, "done", true]);
      expect(results).toEqual([{ id: 2 }]);
    });

    it("returns empty for no matches", () => {
      expect(db.query(["nonexistent", $.x])).toEqual([]);
    });

    it("returns empty for empty patterns", () => {
      expect(db.query()).toEqual([]);
    });
  });

  describe("refs (side-channel)", () => {
    it("stores and retrieves non-serializable values", () => {
      const fn = () => {};
      db.setRef("handler:click", fn);
      expect(db.getRef("handler:click")).toBe(fn);
    });

    it("deletes refs", () => {
      db.setRef("key", "val");
      db.deleteRef("key");
      expect(db.getRef("key")).toBeUndefined();
    });
  });
});
