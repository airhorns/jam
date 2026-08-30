import { describe, it, expect, beforeEach } from "vitest";
import { reaction, runInAction } from "mobx";
import { db, $ } from "../db";
import { replace, when } from "../primitives";
import { h, emitVdom, expandRoot, emitExpanded, type VChild } from "../jsx";

beforeEach(() => {
  db.clear();
});

/** Emit a tree into the fact database and return its sorted VDOM fact keys. */
function emitted(tree: VChild): string[] {
  db.clear();
  runInAction(() => emitVdom(tree, "dom", 0));
  return Array.from(db.facts.keys()).sort();
}

/** Drive a tree the way mount() does, minus the DOM: track expandRoot, emit in the effect. */
function drive(root: VChild) {
  const owner = db.createChildOwner(db.getCurrentOwnerId(), "drive");
  let dataRuns = 0;
  const dispose = reaction(
    () => {
      dataRuns++;
      return expandRoot(root, "dom");
    },
    (nodes) => {
      runInAction(() => {
        db.revokeOwner(owner);
        db.withOwnerScope(owner, () => emitExpanded(nodes, "dom", 0));
      });
    },
    { fireImmediately: true, equals: () => false },
  );
  return { dispose, runs: () => dataRuns };
}

describe("nested component reactivity", () => {
  it("re-runs a nested component when a fact its when() depends on changes", () => {
    replace("counter", "n", 0);
    const Child = () => {
      const [{ n }] = when(["counter", "n", $.n]);
      return h("span", null, String(n));
    };
    const Root = () => h("div", null, h(Child, null));

    const { dispose, runs } = drive(h(Root, null));
    expect(db.query(["dom:0:0:0", "text", $.t])).toEqual([{ t: "0" }]);

    replace("counter", "n", 1);
    expect(runs()).toBe(2);
    expect(db.query(["dom:0:0:0", "text", $.t])).toEqual([{ t: "1" }]);
    expect(db.query(["dom:0:0:0", "text", "0"])).toEqual([]);
    dispose();
  });

  it("does not re-run when an unrelated fact changes", () => {
    replace("counter", "n", 0);
    const Child = () => h("span", null, String(when(["counter", "n", $.n])[0].n));
    const Root = () => h("div", null, h(Child, null));
    const { dispose, runs } = drive(h(Root, null));
    replace("other", "x", 1);
    expect(runs()).toBe(1);
    dispose();
  });

  it("does not re-run the tree because of its own VDOM writes", () => {
    replace("counter", "n", 0);
    const Child = () => h("span", null, String(when(["counter", "n", $.n])[0].n));
    const Root = () => h("div", null, h(Child, null), h(Child, null));
    const { dispose, runs } = drive(h(Root, null));
    expect(runs()).toBe(1);
    replace("counter", "n", 1);
    expect(runs()).toBe(2);
    dispose();
  });

  it("tracks when() calls in components two levels deep and in lists", () => {
    replace("todo", 1, "title", "a");
    replace("todo", 2, "title", "b");
    const Item = ({ todoId }: { todoId: number }) => {
      const [{ title }] = when(["todo", todoId, "title", $.title]);
      return h("li", null, title);
    };
    const List = () => h("ul", null, when(["todo", $.id, "title", $.t]).map(({ id }) => h(Item, { key: id, todoId: id })));
    const Root = () => h("main", null, h(List, null));
    const { dispose } = drive(h(Root, null));
    expect(db.query(["dom:0:0:k:2:0", "text", $.t])).toEqual([{ t: "b" }]);
    replace("todo", 2, "title", "B!");
    expect(db.query(["dom:0:0:k:2:0", "text", $.t])).toEqual([{ t: "B!" }]);
    dispose();
  });
});

describe("expandRoot", () => {
  it("gives the root component's output ids starting at dom:0", () => {
    const Root = () => h("div", null, "hi");
    const keys = emitted(h(Root, null));
    expect(keys).toEqual(emitted(h("div", null, "hi")));
    expect(keys).toContain(JSON.stringify(["dom:0", "tag", "div"]));
  });

  it("does not mutate the input tree", () => {
    const Child = () => h("i", null);
    const tree = h("div", null, h(Child, null));
    expandRoot(tree, "dom");
    expect(tree).toEqual(h("div", null, h(Child, null)));
  });
});

describe("h passes JSX children to components", () => {
  it("nested JSX children arrive as props.children", () => {
    const Wrap = (p: { class: string; children?: VChild[] }) => h("div", { class: p.class }, p.children);
    const keys = emitted(h(Wrap, { class: "wrap" }, h("span", null, "a"), [h("span", { key: "k" }, "b")]));
    expect(keys).toEqual(emitted(h("div", { class: "wrap" }, h("span", null, "a"), h("span", { key: "k" }, "b"))));
  });

  it("leaves props untouched for childless components and intrinsic elements", () => {
    const Leaf = (p: Record<string, unknown>) => h("i", null, String(Object.keys(p).length));
    expect(emitted(h(Leaf, { a: 1 }))).toEqual(emitted(h("i", null, "1")));
    expect(h("div", { a: 1 }, "x").props).toEqual({ a: 1 });
    expect(h("div", null).props).toEqual({});
  });
});
