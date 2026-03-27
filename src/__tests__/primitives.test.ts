import { describe, it, expect, beforeEach, vi } from "vitest";
import { autorun } from "mobx";
import { db } from "../db";
import { $, _, assert, retract, set, when, whenever } from "../primitives";

beforeEach(() => {
  db.facts.clear();
  db.refs.clear();
});

describe("assert", () => {
  it("adds a fact to the global db", () => {
    assert("todo", 1, "title", "Test");
    expect(db.facts.size).toBe(1);
  });
});

describe("retract", () => {
  it("removes a fact from the global db", () => {
    assert("todo", 1, "title", "Test");
    retract("todo", 1, "title", "Test");
    expect(db.facts.size).toBe(0);
  });

  it("supports wildcard retraction", () => {
    assert("todo", 1, "title", "A");
    assert("todo", 1, "done", false);
    retract("todo", 1, _, _);
    expect(db.facts.size).toBe(0);
  });
});

describe("set", () => {
  it("upserts: replaces old value at key path", () => {
    set("counter", "value", 0);
    set("counter", "value", 1);
    set("counter", "value", 2);
    expect(db.facts.size).toBe(1);
    const results = db.query(["counter", "value", $.v]);
    expect(results).toEqual([{ v: 2 }]);
  });
});

describe("when", () => {
  it("returns a computed that queries the db", () => {
    assert("x", 1);
    assert("x", 2);
    const result = when(["x", $.val]);
    expect(result.get()).toContainEqual({ val: 1 });
    expect(result.get()).toContainEqual({ val: 2 });
  });

  it("reacts to new facts", () => {
    const result = when(["x", $.val]);
    expect(result.get()).toEqual([]);

    const observed: number[] = [];
    const disposer = autorun(() => {
      observed.push(result.get().length);
    });

    assert("x", 1);
    assert("x", 2);

    expect(observed).toEqual([0, 1, 2]);
    disposer();
  });

  it("reacts to retracted facts", () => {
    assert("x", 1);
    assert("x", 2);
    const result = when(["x", $.val]);

    const observed: number[] = [];
    const disposer = autorun(() => {
      observed.push(result.get().length);
    });

    retract("x", 1);

    expect(observed).toEqual([2, 1]);
    disposer();
  });

  it("reacts to set (upsert)", () => {
    set("count", 0);
    const result = when(["count", $.val]);

    const observed: unknown[] = [];
    const disposer = autorun(() => {
      const vals = result.get();
      observed.push(vals.length > 0 ? vals[0].val : "empty");
    });

    set("count", 1);
    set("count", 2);

    expect(observed).toEqual([0, 1, 2]);
    disposer();
  });

  it("supports multi-pattern joins", () => {
    assert("todo", 1, "title", "A");
    assert("todo", 1, "done", false);
    assert("todo", 2, "title", "B");
    assert("todo", 2, "done", true);

    const result = when(
      ["todo", $.id, "title", $.title],
      ["todo", $.id, "done", $.done],
    );

    const items = result.get();
    expect(items).toHaveLength(2);
    expect(items).toContainEqual({ id: 1, title: "A", done: false });
    expect(items).toContainEqual({ id: 2, title: "B", done: true });
  });
});

describe("whenever", () => {
  it("runs body when patterns match", () => {
    const spy = vi.fn();
    const disposer = whenever([["x", $.val]], spy);

    assert("x", 1);
    expect(spy).toHaveBeenCalledWith([{ val: 1 }]);

    disposer();
  });

  it("re-runs body when facts change", () => {
    const calls: number[] = [];
    const disposer = whenever([["x", $.val]], (matches) => {
      calls.push(matches.length);
    });

    assert("x", 1);
    assert("x", 2);

    expect(calls).toEqual([0, 1, 2]);
    disposer();
  });

  it("cleans up asserted facts on disposal", () => {
    const disposer = whenever([["source", $.val]], (matches) => {
      for (const { val } of matches) {
        assert("derived", val);
      }
    });

    assert("source", "a");
    expect(db.query(["derived", $.val])).toContainEqual({ val: "a" });

    disposer();
    // Derived facts should have been retracted
    expect(db.query(["derived", $.val])).toEqual([]);
  });
});
