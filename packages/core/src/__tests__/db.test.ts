import { describe, it, expect, beforeEach, vi } from "vitest";
import { FactDB, $, _, matchPattern, type Fact, type FactChange, type FactChangeInfo } from "../db";
import { autorun, transaction } from "../reactive";
import { where } from "../primitives";

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

    it("treats _ as a wildcard that binds nothing", () => {
      expect(db.query(["todo", _, "done", $.done]).map((b) => b.done).sort()).toEqual([false, true]);
    });

    it("lets an effect that subscribed to an index it could not compile go away cleanly", () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const broken = db.index(["todo", $.id, "title", $.title], where($.missing, ">", 1));
      const stop = autorun(() => broken.get());
      expect(errors).toHaveBeenCalledWith("[jam] effect failed", expect.any(Error));
      expect(db.stats().queries).toBe(0);
      expect(() => stop()).not.toThrow();
      expect(db.stats().queries).toBe(0);
      errors.mockRestore();
    });

    it("replace() needs an attribute path and a value", () => {
      expect(() => db.replace("todo")).toThrow("replace() requires at least 2 terms");
    });
  });

  describe("bindings", () => {
    it("only hands out markers for string keys", () => {
      expect($.title).toEqual({ __binding: true, name: "title" });
      expect(($ as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
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

    it("keeps a ref alive while any owner still holds it and drops it with the last", () => {
      const a = db.createChildOwner(db.getCurrentOwnerId(), "a");
      const b = db.createChildOwner(db.getCurrentOwnerId(), "b");
      db.withOwnerScope(a, () => db.setRef("shared", 1));
      db.withOwnerScope(b, () => db.setRef("shared", 2));
      db.setRef("root", 3);
      db.revokeOwner(a);
      expect(db.getRef("shared")).toBe(2);
      db.revokeOwner(b);
      expect(db.getRef("shared")).toBeUndefined();
      expect(db.getRef("root")).toBe(3);
    });

    it("deleting an owned ref also forgets who owned it", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "a");
      db.withOwnerScope(owner, () => db.setRef("k", 1));
      db.deleteRef("k");
      db.withOwnerScope(owner, () => db.setRef("k", 2));
      expect(db.getRef("k")).toBe(2);
      db.revokeOwner(owner);
      expect(db.getRef("k")).toBeUndefined();
    });
  });

  describe("owners", () => {
    it("knows which owners exist, ignores revoking unknown ones and refuses to revoke the root", () => {
      expect(db.ownerExists("nobody")).toBe(false);
      expect(() => db.revokeOwner("nobody")).not.toThrow();
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "a");
      expect(db.ownerExists(owner)).toBe(true);
      expect(() => db.revokeOwner(db.getCurrentOwnerId())).toThrow("the root owner cannot be revoked");
      db.revokeOwner(owner);
      expect(db.ownerExists(owner)).toBe(false);
    });

    it("falls back to the root id when the current owner was revoked underneath it", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "a");
      db.withOwnerScope(owner, () => {
        expect(db.getCurrentOwnerId()).toBe(owner);
        db.revokeOwner(owner);
        expect(db.getCurrentOwnerId()).toBe("__root__");
      });
    });
  });

  describe("observe", () => {
    type Event = [FactChange, string, Fact];
    let log: Event[];
    beforeEach(() => {
      log = [];
      db.observe((type, key, fact) => log.push([type, key, fact]));
    });

    it("fires add with a plain array once the db is consistent", () => {
      let seenInside = 0;
      db.observe((type, _key, fact) => {
        if (type === "add") seenInside = db.query(fact).length;
      });
      db.insert("todo", 1, "title", "A");
      expect(log).toHaveLength(1);
      const [type, key, fact] = log[0];
      expect(type).toBe("add");
      expect(key).toBe(JSON.stringify(["todo", 1, "title", "A"]));
      expect(fact).toEqual(["todo", 1, "title", "A"]);
      expect(() => structuredClone(fact)).not.toThrow();
      expect(seenInside).toBe(1);
    });

    it("delivers changes made inside a transaction when it ends", () => {
      transaction(() => {
        db.insert("todo", 1, "title", "A");
        db.insert("todo", 2, "title", "B");
        expect(log).toHaveLength(0);
      });
      expect(log.map(([t, , f]) => [t, f[1]])).toEqual([["add", 1], ["add", 2]]);
    });

    it("reports the scope of each change", () => {
      const scopes: string[] = [];
      db.observe((_type, _key, _fact, info) => scopes.push(info.scope));
      db.withScope("project:p1", () => db.insert("issue", "i1", "title", "A"));
      db.insert("issue", "i2", "title", "B");
      db.drop("issue", "i1", "title", "A");
      expect(scopes).toEqual(["project:p1", "", "project:p1"]);
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

    it("clear() drops every fact without notifying", () => {
      db.insert("a", 1);
      db.insert("b", 2);
      log = [];
      db.clear();
      expect(db.facts.size).toBe(0);
      expect(log).toEqual([]);
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
      db.setScope(["issue", "i1", "title", "A"], "b");
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

    it("a scope survives flushes that free unused terms before its first fact", () => {
      db.withScope("fresh-scope", () => {
        db.drop("nothing", 1);
        db.drop("nothing", 2);
        db.drop("nothing", 3);
        db.insert("issue", "i1", "title", "A");
      });
      expect(db.scopeOf("issue", "i1", "title", "A")).toBe("fresh-scope");
    });
  });

  describe("term lifetimes", () => {
    it("re-interns an idle index's literals before reading it again", () => {
      const idx = db.index(["rare", $.v]);
      autorun(() => idx.get())();
      const rare = db.engine.id("rare");
      db.drop("nothing", 1);
      db.drop("nothing", 2);
      db.drop("nothing", 3);
      expect(() => db.engine.term(rare)).toThrow(/unknown term id/);
      db.insert("rare", 1);
      expect(idx.get()).toEqual([{ v: 1 }]);
      const seen: number[] = [];
      const stop = autorun(() => seen.push(idx.get().length));
      db.insert("rare", 2);
      expect(seen).toEqual([1, 2]);
      stop();
    });

    it("frees the terms of dropped facts and reuses their ids", () => {
      db.insert("k", "old");
      const old = db.engine.id("old");
      db.replace("k", "new");
      db.drop("nothing", 1);
      expect(() => db.engine.term(old)).toThrow(/unknown term id/);
      expect(db.engine.stats().terms).toBe(3 + ["k", "new", "nothing", 1].length);
      db.insert("k2", "other");
      expect(db.engine.id("k2")).toBe(old);
      expect(db.query(["k", $.v])).toEqual([{ v: "new" }]);
      expect(db.query(["k2", $.v])).toEqual([{ v: "other" }]);
    });
  });

  describe("stats", () => {
    it("adds this layer's bookkeeping to the engine's counts", () => {
      db.insert("todo", 1, "title", "a");
      db.insert("todo", 2, "title", "b");
      const idx = db.index(["todo", $.id, "title", $.title]);
      const stopIndex = autorun(() => idx.get());
      const watch = db.watch([[["todo", $.id, "title", $.title]]], () => {});
      const unobserve = db.observe(() => {});
      db.setRef("handler", () => {});
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "child");

      expect(db.stats()).toMatchObject({
        facts: 2,
        owners: 2,
        namedOwners: 2,
        queries: 1,
        resultRows: 2,
        maintainedIndexes: 1,
        watches: 1,
        listeners: 1,
        refs: 1,
      });
      expect(db.stats().wasmMemoryBytes).toBeGreaterThan(0);

      stopIndex();
      watch.dispose();
      unobserve();
      db.deleteRef("handler");
      db.revokeOwner(owner);
      expect(db.stats()).toMatchObject({ facts: 2, owners: 1, namedOwners: 1, watches: 0, listeners: 0, refs: 0 });
    });
  });

  describe("observe durability", () => {
    type Event = [FactChange, Fact, FactChangeInfo];
    let log: Event[];
    beforeEach(() => {
      log = [];
      db.observe((type, _key, fact, info) => log.push([type, fact, info]));
    });

    it("insert() and drop() are reported", () => {
      db.insert("todo", 1, "title", "A");
      db.drop("todo", 1, "title", "A");
      expect(log.map(([t]) => t)).toEqual(["add", "delete"]);
    });

    it("assert() and owner revocation are silent", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "class", "done"));
      db.revokeOwner(owner);
      expect(log).toEqual([]);
    });

    it("insert() of an already claimed fact emits an add, and revoking the claim keeps it", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "class", "done"));
      db.insert("todo", 1, "class", "done");
      db.insert("todo", 1, "class", "done");
      db.revokeOwner(owner);
      expect(log.map(([t]) => t)).toEqual(["add"]);
      expect(db.query(["todo", 1, "class", $.c])).toEqual([{ c: "done" }]);
    });

    it("dropping a claimed-only fact is silent", () => {
      const owner = db.createChildOwner(db.getCurrentOwnerId(), "scope");
      db.withOwnerScope(owner, () => db.assert("todo", 1, "class", "done"));
      db.drop("todo", 1, "class", "done");
      expect(log).toEqual([]);
    });

    it("replace() flags its add and emits plain deletes for the replaced facts", () => {
      db.insert("todo", 1, "title", "A");
      log = [];
      db.replace("todo", 1, "title", "B");
      expect(log).toEqual([
        ["delete", ["todo", 1, "title", "A"], { scope: "" }],
        ["add", ["todo", 1, "title", "B"], { scope: "", replace: true }],
      ]);
    });
  });
});
