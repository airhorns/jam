import { describe, it, expect, beforeEach, vi } from "vitest";
import { autorun } from "mobx";
import { db } from "../db";
import {
  $,
  _,
  claim,
  remember,
  replace,
  forget,
  when,
  whenever,
  transaction,
} from "../primitives";

beforeEach(() => {
  db.clear();
});

describe("claim", () => {
  it("adds a fact to the global db", () => {
    claim("todo", 1, "title", "Test");
    expect(db.facts.size).toBe(1);
  });
});

describe("forget", () => {
  it("removes a fact from the global db", () => {
    remember("todo", 1, "title", "Test");
    forget("todo", 1, "title", "Test");
    expect(db.facts.size).toBe(0);
  });

  it("supports wildcard removal", () => {
    remember("todo", 1, "title", "A");
    remember("todo", 1, "done", false);
    forget("todo", 1, _, _);
    expect(db.facts.size).toBe(0);
  });
});

describe("remember", () => {
  it("creates durable facts that survive scope revocation", () => {
    db.withOwnerScope("program:test", () => {
      remember("counter", "value", 2);
    });
    db.revokeOwner("program:test");
    const results = when(["counter", "value", $.v]);
    expect(results).toEqual([{ v: 2 }]);
  });
});

describe("replace", () => {
  it("replaces the previous value for a singleton-style prefix", () => {
    remember("ui", "theme", "light");
    replace("ui", "theme", "dark");
    expect(when(["ui", "theme", $.name])).toEqual([{ name: "dark" }]);
  });
});

describe("when", () => {
  it("returns matching bindings", () => {
    remember("x", 1);
    remember("x", 2);
    const result = when(["x", $.val]);
    expect(result).toContainEqual({ val: 1 });
    expect(result).toContainEqual({ val: 2 });
  });

  it("reacts to new facts inside autorun", () => {
    const observed: number[] = [];
    const disposer = autorun(() => {
      observed.push(when(["x", $.val]).length);
    });

    remember("x", 1);
    remember("x", 2);

    expect(observed).toEqual([0, 1, 2]);
    disposer();
  });

  it("reacts to removeed facts inside autorun", () => {
    remember("x", 1);
    remember("x", 2);

    const observed: number[] = [];
    const disposer = autorun(() => {
      observed.push(when(["x", $.val]).length);
    });

    forget("x", 1);

    expect(observed).toEqual([2, 1]);
    disposer();
  });

  it("reacts to durable inserts inside autorun", () => {
    remember("count", 0);

    const observed: unknown[] = [];
    const disposer = autorun(() => {
      const vals = when(["count", $.val]);
      observed.push(vals.length > 0 ? vals[0].val : "empty");
    });

    forget("count", 0);
    remember("count", 1);
    forget("count", 1);
    remember("count", 2);

    expect(observed).toEqual([0, "empty", 1, "empty", 2]);
    disposer();
  });

  it("supports multi-pattern joins", () => {
    remember("todo", 1, "title", "A");
    remember("todo", 1, "done", false);
    remember("todo", 2, "title", "B");
    remember("todo", 2, "done", true);

    const items = when(
      ["todo", $.id, "title", $.title],
      ["todo", $.id, "done", $.done],
    );

    expect(items).toHaveLength(2);
    expect(items).toContainEqual({ id: 1, title: "A", done: false });
    expect(items).toContainEqual({ id: 2, title: "B", done: true });
  });
});

describe("whenever", () => {
  it("runs body when patterns match", () => {
    const spy = vi.fn();
    const disposer = whenever([["x", $.val]], spy);

    remember("x", 1);
    expect(spy).toHaveBeenCalledWith([{ val: 1 }]);

    disposer();
  });

  it("re-runs body when facts change", () => {
    const calls: number[] = [];
    const disposer = whenever([["x", $.val]], (matches) => {
      calls.push(matches.length);
    });

    remember("x", 1);
    remember("x", 2);

    expect(calls).toEqual([0, 1, 2]);
    disposer();
  });

  it("cleans up claimed facts on disposal", () => {
    const disposer = whenever([["source", $.val]], (matches) => {
      for (const { val } of matches) {
        claim("derived", val);
      }
    });

    remember("source", "a");
    expect(db.query(["derived", $.val])).toContainEqual({ val: "a" });

    disposer();
    // Derived facts should have been removeed
    expect(db.query(["derived", $.val])).toEqual([]);
  });
});

describe("transaction", () => {
  it("batches mutations — observers fire once", () => {
    remember("plan", "s-1", "entry-0", "old task", "completed", "medium");
    remember("plan", "s-1", "entry-1", "old task 2", "pending", "low");

    const observed: number[] = [];
    const disposer = autorun(() => {
      observed.push(
        when(["plan", "s-1", $.entryId, $.content, $.status, $.priority])
          .length,
      );
    });

    transaction(() => {
      forget("plan", "s-1", _, _, _, _);
      remember("plan", "s-1", "entry-0", "new task A", "in_progress", "high");
      remember("plan", "s-1", "entry-1", "new task B", "pending", "medium");
      remember("plan", "s-1", "entry-2", "new task C", "pending", "low");
    });

    // Should see: [2 (initial autorun), 3 (after transaction)]
    expect(observed).toEqual([2, 3]);

    disposer();
  });

  it("returns the value from the function", () => {
    const result = transaction(() => {
      remember("x", 1);
      return "done";
    });
    expect(result).toBe("done");
  });
});
