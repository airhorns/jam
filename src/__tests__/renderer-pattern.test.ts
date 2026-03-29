import { describe, it, expect, beforeEach } from "vitest";
import { autorun, reaction, runInAction } from "mobx";
import { db, $ } from "../db";
import { assert, set, when, whenever, claim } from "../primitives";

describe("fine-grained per-pattern reactivity", () => {
  beforeEach(() => { db.clear(); });

  it("autorun only fires when matching patterns change", () => {
    const observed: number[] = [];
    const disposer = autorun(() => {
      const result = when(["todo", $.id, "title", $.title]);
      observed.push(result.get().length);
    });

    // VDOM write — should NOT trigger the autorun (different pattern)
    assert("e1", "tag", "div");
    assert("e2", "class", "foo");

    expect(observed).toEqual([0]); // no re-fire

    // App-state write — SHOULD trigger
    set("todo", 1, "title", "Buy milk");
    expect(observed).toEqual([0, 1]);

    disposer();
  });

  it("VDOM writes in reaction effect don't cause cycle", () => {
    const dataRuns: number[] = [];
    const disposer = reaction(
      () => {
        const result = when(["app", $.id, "name", $.name]);
        const items = result.get();
        dataRuns.push(items.length);
        return items;
      },
      () => {
        // Effect: write VDOM facts to the same map
        runInAction(() => {
          db.assert("e1", "tag", "div");
          db.assert("e2", "tag", "span");
          db.assert("e3", "text", "hello");
        });
      },
      { fireImmediately: true, equals: () => false },
    );

    // Data function ran once (initial) — VDOM writes in effect didn't re-trigger
    expect(dataRuns).toEqual([0]);

    // App-state change triggers data function re-run
    set("app", 1, "name", "Test");
    expect(dataRuns).toEqual([0, 1]);

    disposer();
  });

  it("whenever on app-state can claim VDOM facts without cycle", () => {
    const bodyRuns: number[] = [];
    const disposer = whenever(
      [["todo", $.id, "done", true]],
      (matches) => {
        bodyRuns.push(matches.length);
        for (const { id } of matches) {
          claim(`k:${id}`, "class", "strikethrough");
        }
      },
    );

    // Initial run: no done todos
    expect(bodyRuns).toEqual([0]);

    // Add a done todo — whenever should fire once
    set("todo", 1, "title", "Test");
    set("todo", 1, "done", true);
    expect(bodyRuns).toEqual([0, 1]);

    // Verify the VDOM claim exists
    expect(db.query(["k:1", "class", "strikethrough"])).toHaveLength(1);

    // The VDOM claim should NOT re-trigger the whenever (different pattern)
    expect(bodyRuns).toEqual([0, 1]);

    disposer();
  });

  it("whenever on VDOM facts works too", () => {
    const bodyRuns: string[] = [];
    const disposer = whenever(
      [[$.el, "tag", "div"]],
      (matches) => {
        bodyRuns.push(matches.map(m => m.el as string).join(","));
      },
    );

    expect(bodyRuns).toEqual([""]);

    // Write VDOM facts
    assert("e1", "tag", "div");
    expect(bodyRuns).toEqual(["", "e1"]);

    assert("e2", "tag", "div");
    expect(bodyRuns).toEqual(["", "e1", "e1,e2"]);

    // App-state fact doesn't trigger this whenever
    set("todo", 1, "title", "Nope");
    expect(bodyRuns).toEqual(["", "e1", "e1,e2"]);

    disposer();
  });

  it("chain: app-state → whenever → VDOM claim → whenever on VDOM", () => {
    const vdomObserved: string[] = [];

    // Program 1: when a todo is done, claim a decoration
    const dispose1 = whenever(
      [["todo", $.id, "done", true]],
      (matches) => {
        for (const { id } of matches) {
          claim(`todo-el-${id}`, "class", "completed");
        }
      },
    );

    // Program 2: whenever a "completed" class is claimed, log it
    const dispose2 = whenever(
      [[$.el, "class", "completed"]],
      (matches) => {
        vdomObserved.push(matches.map(m => m.el as string).join(","));
      },
    );

    expect(vdomObserved).toEqual([""]);

    // Trigger the chain: app-state → program 1 → VDOM claim → program 2
    set("todo", 1, "title", "Test");
    set("todo", 1, "done", true);

    expect(vdomObserved).toEqual(["", "todo-el-1"]);

    // Add another done todo
    set("todo", 2, "title", "Test 2");
    set("todo", 2, "done", true);
    expect(vdomObserved).toEqual(["", "todo-el-1", "todo-el-1,todo-el-2"]);

    dispose1();
    dispose2();
  });

  it("index deduplicates identical pattern sets", () => {
    const a = when(["x", $.val]);
    const b = when(["x", $.val]);
    // Same computed (or at least same version tracking)
    assert("x", 1);
    expect(a.get()).toEqual(b.get());
  });
});
