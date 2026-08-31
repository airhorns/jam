import { describe, it, expect, beforeEach } from "vitest";
import { db, $ } from "../db";
import { transaction } from "../reactive";
import { Fragment, Portal, createContext, emitVdom, expandRoot, expandTree, h, useComponentId, type VChild } from "../jsx";

beforeEach(() => {
  db.clear();
});

/** Emit a tree into the fact database and return its sorted VDOM fact keys. */
function emitted(tree: VChild): string[] {
  db.clear();
  transaction(() => emitVdom(tree, "dom", 0));
  return Array.from(db.facts.keys()).sort();
}

describe("Fragment", () => {
  it("takes its children positionally or from props and is transparent when expanded", () => {
    const positional = Fragment(null, "a", ["b", ["c"]]);
    expect(positional.tag).toBe("__fragment");
    expect(positional.children).toEqual(["a", "b", "c"]);
    expect(Fragment({ children: "only" }).children).toEqual(["only"]);
    expect(Fragment({ children: null }).children).toEqual([]);
    expect(Fragment(null).children).toEqual([]);

    expect(emitted(h("div", null, Fragment(null, "a", h("i", null))))).toEqual(emitted(h("div", null, "a", h("i", null))));
  });
});

describe("context", () => {
  it("a Provider called directly renders its children as a fragment", () => {
    const Theme = createContext("light");
    const node = Theme.Provider({ value: "dark", children: h("b", null, "x") });
    expect(node.tag).toBe("__fragment");
    expect(node.children).toEqual([h("b", null, "x")]);
  });
});

describe("Portal", () => {
  it("cannot be called as a plain component", () => {
    expect(() => Portal({})).toThrow("Portal is handled by the renderer");
  });
});

describe("useComponentId", () => {
  it("only works while a component renders", () => {
    expect(() => useComponentId()).toThrow("useComponentId() can only be called while a component is rendering");
  });
});

describe("expanding component output", () => {
  it("spreads arrays a component returns, nested ones included, and skips booleans and nulls", () => {
    const List = () => ["a", [null, "b", [true, "c"]], false];
    const Frag = () => h(Fragment, null, "a", "b", "c");
    const keys = emitted(h("div", null, h(List, null)));
    expect(keys).toEqual(emitted(h("div", null, h(Frag, null))));
    expect(keys).toContain(JSON.stringify(["dom:0:0:2", "text", "c"]));
  });

  it("renders nothing for a component that returns a boolean or something that is not a vnode", () => {
    const Nothing = () => false;
    const Odd = () => ({ tag: "div" }) as unknown as VChild;
    expect(expandRoot(h("div", null, h(Nothing, null), h(Odd, null)))).toEqual([
      { kind: "element", id: "dom:0", tag: "div", props: {}, children: [] },
    ]);
  });

  it("describes components by displayName when they have one, and merges styling wrappers into the component they render", () => {
    const Inner = () => h("span", null, "x");
    const Named = () => h(Inner, null);
    (Named as { displayName?: string }).displayName = "Fancy";

    const Base = () => h("div", null);
    Base.presentational = true;
    const Styled = () => h(Base, null);
    Styled.presentational = true;
    const Card = () => h(Styled, null);
    const Twin = () => h(Card, null);
    const Alias = () => h("p", null);
    (Alias as { displayName?: string }).displayName = "Repeat";
    const Repeat = () => h(Alias, null);

    const { components } = expandTree(h("div", null, h(Named, null), h(Twin, null), h(Repeat, null)));
    expect(components.get("dom:0:0")).toEqual({ name: "Fancy/Inner", parent: null, presentational: false });
    expect(components.get("dom:0:1")).toEqual({ name: "Twin/Card", parent: null, presentational: false });
    expect(components.get("dom:0:2")).toEqual({ name: "Repeat", parent: null, presentational: false });
  });

  it("calls a component written inline, with no name of its own, Anonymous", () => {
    const { components } = expandTree(h("div", null, h(() => h("span", null), null)));
    expect(components.get("dom:0:0")).toEqual({ name: "Anonymous", parent: null, presentational: false });
  });

  it("names presentational chains by every wrapper until a semantic component takes over", () => {
    const Base = () => h("div", null);
    Base.presentational = true;
    const Styled = () => h(Base, null);
    Styled.presentational = true;
    const Panel = () => h(Styled, null);
    Panel.presentational = true;

    expect(expandTree(h(Panel, null)).components.get("dom:0")).toEqual({ name: "Panel/Styled/Base", parent: null, presentational: true });

    const Semantic = () => h(Base, null);
    const Wrapper = () => h(Semantic, null);
    Wrapper.presentational = true;
    expect(expandTree(h(Wrapper, null)).components.get("dom:0")).toEqual({ name: "Semantic", parent: null, presentational: false });
  });
});

describe("style props", () => {
  it("serializes object styles to css, skipping null and false values and keeping custom properties", () => {
    emitVdom(h("div", { style: { backgroundColor: "red", "--gap": "4px", width: 0, border: null, display: false } }), "dom", 0);
    expect(db.query(["dom:0", "prop", "style", $.css])).toEqual([{ css: "background-color: red; --gap: 4px; width: 0" }]);
    emitVdom(h("p", { style: { color: null } }), "dom", 1);
    expect(db.query(["dom:1", "prop", "style", $.css])).toEqual([]);
  });
});
