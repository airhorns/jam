import { describe, it, expect, beforeEach, vi } from "vitest";
import { isObservableArray, runInAction } from "mobx";
import { FactDB, $, _, matchPattern, type Fact, type FactChange, type FactChangeInfo } from "../db";

describe("matchPattern", () => {
  it("matches exact facts", () => {
    expect(
      matchPattern(
        ["todo", 1, "title", "Buy milk"],
        ["todo", 1, "title", "Buy milk"],
      ),
    ).toEqual({});
  });

  it("rejects length mismatch", () => {
    expect(matchPattern(["todo", 1], ["todo", 1, "title"])).toBeNull();
  });

  it("rejects value mismatch", () => {
    expect(
      matchPattern(
        ["todo", 1, "title", "Buy milk"],
        ["todo", 1, "title", "Sell milk"],
      ),
    ).toBeNull();
  });

  it("binds variables with $", () => {
    const result = matchPattern(
      ["todo", $.id, "title", $.title],
      ["todo", 1, "title", "Buy milk"],
    );
    expect(result).toEqual({ id: 1, title: "Buy milk" });
  });

  it("enforces consistent bindings", () => {
    // $.x appears twice — both positions must have the same value
    expect(matchPattern([$.x, $.x], [1, 1])).toEqual({ x: 1 });
    expect(matchPattern([$.x, $.x], [1, 2])).toBeNull();
  });

  it("matches wildcards", () => {
    expect(
      matchPattern(["todo", _, "title", $.t], ["todo", 99, "title", "X"]),
    ).toEqual({ t: "X" });
  });
});

describe("FactDB", () => {
  let db: FactDB;

  beforeEach(() => {
    db = new FactDB();
  });

  describe("remember / forget", () => {
    it("asserts and queries a fact", () => {
      db.insert("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(1);
      const results = db.query(["todo", $.id, "title", $.title]);
      expect(results).toEqual([{ id: 1, title: "Buy milk" }]);
    });

    it("deduplicates identical facts", () => {
      db.insert("todo", 1, "title", "Buy milk");
      db.insert("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(1);
    });

    it("removes an exact fact", () => {
      db.insert("todo", 1, "title", "Buy milk");
      db.drop("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(0);
    });

    it("forget is a no-op for missing facts", () => {
      db.drop("todo", 1, "title", "Buy milk");
      expect(db.facts.size).toBe(0);
    });

    it("removes with wildcard", () => {
      db.insert("todo", 1, "title", "Buy milk");
      db.insert("todo", 1, "done", false);
      db.insert("todo", 2, "title", "Sell milk");
      db.drop("todo", 1, _, _);
      expect(db.facts.size).toBe(1);
      expect(db.query(["todo", $.id, "title", $.title])).toEqual([
        { id: 2, title: "Sell milk" },
      ]);
    });

    it("wildcard forget only removes matching-length facts", () => {
      db.insert("todo", 1, "title", "Buy milk");
      db.insert("short", 1);
      db.drop(_, _); // only matches 2-term facts
      expect(db.facts.size).toBe(1);
    });
  });

  describe("remember (durable)", () => {
    it("sets a new value", () => {
      db.insert("todo", 1, "title", "Buy milk");
      expect(db.query(["todo", 1, "title", $.title])).toEqual([
        { title: "Buy milk" },
      ]);
    });

    it("keeps multiple durable values at the same key path until explicitly dropped", () => {
      db.insert("todo", 1, "done", false);
      db.insert("todo", 1, "done", true);
      const results = db.query(["todo", 1, "done", $.done]);
      expect(results).toContainEqual({ done: false });
      expect(results).toContainEqual({ done: true });
      expect(db.facts.size).toBe(2);
    });

    it("doesn't affect other key paths", () => {
      db.insert("todo", 1, "title", "Buy milk");
      db.insert("todo", 1, "done", false);
      db.insert("todo", 1, "done", true);
      expect(db.query(["todo", 1, "title", $.title])).toEqual([
        { title: "Buy milk" },
      ]);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      db.insert("todo", 1, "title", "Buy milk");
      db.insert("todo", 1, "done", false);
      db.insert("todo", 2, "title", "Walk dog");
      db.insert("todo", 2, "done", true);
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

  describe("observe", () => {
    type Event = [FactChange, string, Fact];
    let log: Event[];
    beforeEach(() => {
      log = [];
      db.observe((type, key, fact) => log.push([type, key, fact]));
    });

    it("fires add synchronously with a plain array once the db is consistent", () => {
      let seenInside = 0;
      db.observe((type, _key, fact) => {
        if (type === "add") seenInside = db.query(fact).length;
      });
      runInAction(() => {
        db.insert("todo", 1, "title", "A");
        expect(log).toHaveLength(1);
      });
      const [type, key, fact] = log[0];
      expect(type).toBe("add");
      expect(key).toBe(JSON.stringify(["todo", 1, "title", "A"]));
      expect(fact).toEqual(["todo", 1, "title", "A"]);
      expect(isObservableArray(fact)).toBe(false);
      expect(() => structuredClone(fact)).not.toThrow();
      expect(seenInside).toBe(1);
    });

    it("does not fire for a duplicate insert", () => {
      db.insert("todo", 1, "title", "A");
      db.insert("todo", 1, "title", "A");
      expect(log).toHaveLength(1);
    });

    it("fires delete for exact and wildcard drops", () => {
      db.insert("todo", 1, "title", "A");
      db.insert("todo", 2, "title", "B");
      db.insert("todo", 3, "title", "C");
      log = [];
      db.drop("todo", 1, "title", "A");
      db.drop("todo", _, "title", _);
      expect(log.map(([t, , f]) => [t, f[1]])).toEqual([["delete", 1], ["delete", 2], ["delete", 3]]);
    });

    it("replace() emits delete then add, and nothing for an unchanged value", () => {
      db.insert("todo", 1, "title", "A");
      log = [];
      db.replace("todo", 1, "title", "B");
      expect(log.map(([t, , f]) => [t, f[3]])).toEqual([["delete", "A"], ["add", "B"]]);
      log = [];
      db.replace("todo", 1, "title", "B");
      expect(log).toEqual([]);
    });

    it("replace() of an unchanged value keeps the fact for a scope that claimed it", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "title", "A"));
      db.replace("todo", 1, "title", "A");
      db.revokeOwner(owner);
      expect(db.query(["todo", 1, "title", $.t])).toEqual([{ t: "A" }]);
    });

    it("deleteByKey and clear emit one delete per fact", () => {
      db.insert("a", 1);
      db.insert("b", 2);
      db.insert("c", 3);
      log = [];
      db.deleteByKey(JSON.stringify(["a", 1]));
      expect(log).toEqual([["delete", JSON.stringify(["a", 1]), ["a", 1]]]);
      log = [];
      db.clear();
      expect(log.map(([t, , f]) => [t, ...f]).sort()).toEqual([["delete", "b", 2], ["delete", "c", 3]]);
    });

    it("unsubscribe stops notifications", () => {
      const own: Event[] = [];
      const stop = db.observe((type, key, fact) => own.push([type, key, fact]));
      db.insert("a", 1);
      stop();
      db.insert("a", 2);
      expect(own).toHaveLength(1);
      expect(log).toHaveLength(2);
    });

    it("a throwing listener does not break the mutation or other listeners", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      db.observe(() => {
        throw new Error("boom");
      });
      db.insert("a", 1);
      expect(db.query(["a", $.x])).toEqual([{ x: 1 }]);
      expect(log).toHaveLength(1);
      expect(errors).toHaveBeenCalledOnce();
      errors.mockRestore();
    });
  });
  describe("scopes", () => {
    it("facts are global unless written inside withScope", () => {
      db.insert("project", "p1", "name", "Core");
      db.withScope("project:p1", () => db.insert("issue", "i1", "title", "A"));
      expect(db.scopeOf("project", "p1", "name", "Core")).toBe("");
      expect(db.scopeOf("issue", "i1", "title", "A")).toBe("project:p1");
      expect(db.scopeOf("nope", 1)).toBe("");
    });

    it("later facts about a scoped entity inherit its scope", () => {
      db.withScope("project:p1", () => db.insert("issue", "i1", "title", "A"));
      db.insert("issue", "i1", "status", "todo");
      db.replace("issue", "i1", "priority", "high");
      expect(db.scopeOf("issue", "i1", "status", "todo")).toBe("project:p1");
      expect(db.scopeOf("issue", "i1", "priority", "high")).toBe("project:p1");
      expect(db.scopeOf("issue", "i2", "status", "todo")).toBe("");
    });

    it("replace() keeps the scope of the fact it replaces", () => {
      db.withScope("project:p1", () => db.insert("issue", "i1", "title", "A"));
      db.replace("issue", "i1", "title", "B");
      expect(db.scopeOf("issue", "i1", "title", "B")).toBe("project:p1");
      expect(db.query(["issue", "i1", "title", $.t])).toEqual([{ t: "B" }]);
    });

    it("an explicit scope wins over inheritance and the entity keeps its first scope", () => {
      db.withScope("a", () => db.insert("issue", "i1", "title", "A"));
      db.withScope("b", () => db.insert("issue", "i1", "label", "x"));
      db.insert("issue", "i1", "status", "todo");
      expect(db.scopeOf("issue", "i1", "label", "x")).toBe("b");
      expect(db.scopeOf("issue", "i1", "status", "todo")).toBe("a");
    });

    it("forgets the entity scope once its last scoped fact is gone", () => {
      db.withScope("project:p1", () => db.insert("issue", "i1", "title", "A"));
      db.drop("issue", "i1", "title", "A");
      db.insert("issue", "i1", "status", "todo");
      expect(db.scopeOf("issue", "i1", "status", "todo")).toBe("");
    });

    it("setScope re-tags a fact without notifying and moves entity inheritance with it", () => {
      const log: FactChange[] = [];
      db.observe((type) => log.push(type));
      db.withScope("a", () => db.insert("issue", "i1", "title", "A"));
      log.length = 0;
      db.setScope(JSON.stringify(["issue", "i1", "title", "A"]), "b");
      expect(log).toEqual([]);
      expect(db.scopeOf("issue", "i1", "title", "A")).toBe("b");
      db.insert("issue", "i1", "status", "todo");
      expect(db.scopeOf("issue", "i1", "status", "todo")).toBe("b");
    });

    it("clear() drops scopes", () => {
      db.withScope("a", () => db.insert("issue", "i1", "title", "A"));
      db.clear();
      db.insert("issue", "i1", "status", "todo");
      expect(db.scopeOf("issue", "i1", "status", "todo")).toBe("");
    });
  });

  describe("observe durability", () => {
    type Event = [FactChange, Fact, FactChangeInfo];
    let log: Event[];
    beforeEach(() => {
      log = [];
      db.observe((type, _key, fact, info) => log.push([type, fact, info]));
    });

    it("insert() and drop() are durable", () => {
      db.insert("todo", 1, "title", "A");
      db.drop("todo", 1, "title", "A");
      expect(log.map(([t, , i]) => [t, i.durable])).toEqual([["add", true], ["delete", true]]);
    });

    it("assert() and owner revocation are not durable", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "class", "done"));
      db.revokeOwner(owner);
      expect(log.map(([t, , i]) => [t, i.durable])).toEqual([["add", false], ["delete", false]]);
    });

    it("insert() of an already claimed fact emits a durable add, and revoking the claim keeps it", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "class", "done"));
      db.insert("todo", 1, "class", "done");
      db.insert("todo", 1, "class", "done");
      db.revokeOwner(owner);
      expect(log.map(([t, , i]) => [t, i.durable])).toEqual([["add", false], ["add", true]]);
      expect(db.query(["todo", 1, "class", $.c])).toEqual([{ c: "done" }]);
    });

    it("dropping a claimed-only fact is not durable", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "class", "done"));
      db.drop("todo", 1, "class", "done");
      expect(log[1]).toEqual(["delete", ["todo", 1, "class", "done"], { durable: false }]);
    });

    it("replace() flags its add and emits plain durable deletes for the replaced facts", () => {
      db.insert("todo", 1, "title", "A");
      log = [];
      db.replace("todo", 1, "title", "B");
      expect(log).toEqual([
        ["delete", ["todo", 1, "title", "A"], { durable: true }],
        ["add", ["todo", 1, "title", "B"], { durable: true, replace: true }],
      ]);
    });

    it("clear() deletes are not durable", () => {
      db.insert("a", 1);
      log = [];
      db.clear();
      expect(log).toEqual([["delete", ["a", 1], { durable: false }]]);
    });
  });
});
