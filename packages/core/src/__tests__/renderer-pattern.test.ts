import { describe, it, expect, beforeEach } from "vitest";
import { autorun, reaction, runInAction } from "mobx";
import { db, $ } from "../db";
import { assert, set, when, whenever, claim } from "../primitives";

describe("fine-grained per-pattern reactivity", () => {
  beforeEach(() => { db.clear(); });

  it("autorun only fires when matching patterns change", () => {
    const observed: number[] = [];
    const disposer = autorun(() => {
      observed.push(when(["todo", $.id, "title", $.title]).length);
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
        const items = when(["app", $.id, "name", $.name]);
        dataRuns.push(items.length);
        return items;
      },
      () => {
        runInAction(() => {
          db.assert("e1", "tag", "div");
          db.assert("e2", "tag", "span");
          db.assert("e3", "text", "hello");
        });
      },
      { fireImmediately: true, equals: () => false },
    );

    expect(dataRuns).toEqual([0]);

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

    expect(bodyRuns).toEqual([0]);

    set("todo", 1, "title", "Test");
    set("todo", 1, "done", true);
    expect(bodyRuns).toEqual([0, 1]);

    expect(db.query(["k:1", "class", "strikethrough"])).toHaveLength(1);
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

    assert("e1", "tag", "div");
    expect(bodyRuns).toEqual(["", "e1"]);

    assert("e2", "tag", "div");
    expect(bodyRuns).toEqual(["", "e1", "e1,e2"]);

    set("todo", 1, "title", "Nope");
    expect(bodyRuns).toEqual(["", "e1", "e1,e2"]);

    disposer();
  });

  it("chain: app-state → whenever → VDOM claim → whenever on VDOM", () => {
    const vdomObserved: string[] = [];

    const dispose1 = whenever(
      [["todo", $.id, "done", true]],
      (matches) => {
        for (const { id } of matches) {
          claim(`todo-el-${id}`, "class", "completed");
        }
      },
    );

    const dispose2 = whenever(
      [[$.el, "class", "completed"]],
      (matches) => {
        vdomObserved.push(matches.map(m => m.el as string).join(","));
      },
    );

    expect(vdomObserved).toEqual([""]);

    set("todo", 1, "title", "Test");
    set("todo", 1, "done", true);
    expect(vdomObserved).toEqual(["", "todo-el-1"]);

    set("todo", 2, "title", "Test 2");
    set("todo", 2, "done", true);
    expect(vdomObserved).toEqual(["", "todo-el-1", "todo-el-1,todo-el-2"]);

    dispose1();
    dispose2();
  });

  it("when() returns same results for identical patterns", () => {
    assert("x", 1);
    const a = when(["x", $.val]);
    const b = when(["x", $.val]);
    expect(a).toEqual(b);
  });
});
