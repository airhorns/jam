// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import { $, when, replace, remember } from "../primitives";
import { h, createContext, useContext, useComponentId, Portal, injectVdom, Fragment } from "../jsx";
import { mount } from "../renderer";

let container: HTMLElement;
let dispose: (() => void) | null = null;

beforeEach(() => {
  db.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  dispose?.();
  dispose = null;
  container.remove();
});

describe("mount", () => {
  it("re-renders a nested component when a fact it reads changes", () => {
    replace("counter", "count", 0);
    const Child = () => {
      const rows = when(["counter", "count", $.v]);
      return h("span", null, String(rows[0]?.v ?? "none"));
    };
    const Root = () => h("div", null, h(Child, null));

    dispose = mount(h(Root, null), container);
    expect(container.querySelector("span")!.textContent).toBe("0");

    replace("counter", "count", 1);
    expect(container.querySelector("span")!.textContent).toBe("1");
  });

  it("re-renders deeply nested components and list items", () => {
    remember("todo", "item", "a");
    const Item = ({ id }: { id: string }) => {
      const done = when(["todo", "done", id]).length > 0;
      return h("li", { class: done ? "done" : undefined }, id);
    };
    const List = () => {
      const items = when(["todo", "item", $.id]);
      return h("ul", null, items.map((r) => h(Item, { key: String(r.id), id: String(r.id) })));
    };
    const Root = () => h("main", null, h(List, null));

    dispose = mount(h(Root, null), container);
    expect(container.querySelectorAll("li").length).toBe(1);
    expect(container.querySelector("li")!.className).toBe("");

    remember("todo", "done", "a");
    expect(container.querySelector("li")!.className).toBe("done");

    remember("todo", "item", "b");
    expect(container.querySelectorAll("li").length).toBe(2);
  });

  it("provides context to nested components", () => {
    const Color = createContext("gray");
    const Swatch = () => h("i", null, useContext(Color));
    const Root = () =>
      h("div", null,
        h(Swatch, null),
        h(Color.Provider, { value: "red" }, h(Swatch, null), h(Color.Provider, { value: "blue" }, h(Swatch, null))),
        h(Swatch, null),
      );

    dispose = mount(h(Root, null), container);
    const texts = Array.from(container.querySelectorAll("i")).map((n) => n.textContent);
    expect(texts).toEqual(["gray", "red", "blue", "gray"]);
  });

  it("context values are reactive when derived from facts", () => {
    replace("app", "theme", "light");
    const Theme = createContext("none");
    const Leaf = () => h("b", null, useContext(Theme));
    const Root = () => {
      const theme = String(when(["app", "theme", $.t])[0]?.t);
      return h(Theme.Provider, { value: theme }, h("div", null, h(Leaf, null)));
    };

    dispose = mount(h(Root, null), container);
    expect(container.querySelector("b")!.textContent).toBe("light");
    replace("app", "theme", "dark");
    expect(container.querySelector("b")!.textContent).toBe("dark");
  });

  it("useComponentId is stable across renders and per-instance", () => {
    replace("tick", "n", 0);
    const seen: string[][] = [];
    const Widget = () => {
      when(["tick", "n", $.n]);
      const id = useComponentId();
      seen[seen.length - 1].push(id);
      return h("div", { "data-cid": id });
    };
    const Root = () => {
      seen.push([]);
      return h("section", null, h(Widget, null), h(Widget, { key: "x" }), h(Widget, { id: "explicit" }));
    };

    dispose = mount(h(Root, null), container);
    replace("tick", "n", 1);
    expect(seen.length).toBe(2);
    expect(seen[0]).toEqual(seen[1]);
    expect(new Set(seen[0]).size).toBe(3);
    expect(seen[0][2]).toBe("explicit");
    expect(container.querySelector("[data-cid='explicit']")).not.toBeNull();
    expect(db.query(["explicit", "tag", "div"])).toHaveLength(1);
  });

  it("useComponentId can key per-instance state in the db", () => {
    const Toggle = () => {
      const id = useComponentId();
      const on = when([id, "on", true]).length > 0;
      return h("button", { onClick: () => replace(id, "on", !on) }, on ? "on" : "off");
    };
    const Root = () => h("div", null, h(Toggle, null), h(Toggle, null));

    dispose = mount(h(Root, null), container);
    const [a, b] = Array.from(container.querySelectorAll("button"));
    expect(a.textContent).toBe("off");
    a.click();
    expect(a.textContent).toBe("on");
    expect(b.textContent).toBe("off");
  });

  it("renders Portal children at the root of the container", () => {
    replace("ui", "open", false);
    const Overlay = () => {
      const open = when(["ui", "open", true]).length > 0;
      return h("div", { class: "wrapper" },
        h("p", null, "inline"),
        open ? h(Portal, null, h("div", { class: "overlay" }, "floating")) : null,
      );
    };

    dispose = mount(h(Overlay, null), container);
    expect(container.querySelector(".overlay")).toBeNull();

    replace("ui", "open", true);
    const overlay = container.querySelector(".overlay")!;
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(container);
    expect(container.children[0].className).toBe("wrapper");
    expect(container.children[1].className).toBe("overlay");
    expect(container.querySelector(".wrapper .overlay")).toBeNull();

    replace("ui", "open", false);
    expect(container.querySelector(".overlay")).toBeNull();
  });

  it("portal children can read context and are reactive", () => {
    replace("msg", "text", "hi");
    const Ctx = createContext("default");
    const Inner = () => {
      const text = String(when(["msg", "text", $.t])[0]?.t);
      return h("span", null, `${useContext(Ctx)}:${text}`);
    };
    const Root = () => h(Ctx.Provider, { value: "ctx" }, h("div", null, h(Portal, null, h(Inner, null))));

    dispose = mount(h(Root, null), container);
    expect(container.querySelector("span")!.textContent).toBe("ctx:hi");
    replace("msg", "text", "bye");
    expect(container.querySelector("span")!.textContent).toBe("ctx:bye");
  });

  it("handles boolean attributes and DOM properties", () => {
    replace("form", "disabled", false);
    const Root = () => {
      const disabled = when(["form", "disabled", true]).length > 0;
      return h("div", null,
        h("input", { type: "checkbox", checked: disabled, disabled }),
        h("button", { "aria-pressed": disabled, hidden: disabled }, "go"),
      );
    };

    dispose = mount(h(Root, null), container);
    const input = container.querySelector("input")!;
    const button = container.querySelector("button")!;
    expect(input.checked).toBe(false);
    expect(input.disabled).toBe(false);
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.hasAttribute("hidden")).toBe(false);

    replace("form", "disabled", true);
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.hasAttribute("hidden")).toBe(true);
  });

  it("normalizes attribute names and serializes style objects", () => {
    const Root = () =>
      h("div", null,
        h("label", { htmlFor: "f", className: "lbl", tabIndex: 0 }, "L"),
        h("div", { style: { backgroundColor: "red", "--x": "1", zIndex: 3 } }),
      );
    dispose = mount(h(Root, null), container);
    const label = container.querySelector("label")!;
    expect(label.getAttribute("for")).toBe("f");
    expect(label.className).toBe("lbl");
    expect(label.getAttribute("tabindex")).toBe("0");
    const styled = container.querySelectorAll("div")[1];
    expect(styled.getAttribute("style")).toBe("background-color: red; --x: 1; z-index: 3");
  });

  it("wires event handlers and updates after re-render", () => {
    replace("counter", "n", 0);
    const Root = () => {
      const n = Number(when(["counter", "n", $.n])[0]?.n ?? 0);
      return h("button", { onClick: () => replace("counter", "n", n + 1) }, String(n));
    };
    dispose = mount(h(Root, null), container);
    const button = container.querySelector("button")!;
    button.click();
    button.click();
    expect(button.textContent).toBe("2");
  });

  it("fragments and arrays flatten into sibling children with stable ids", () => {
    const Root = () =>
      h("ul", null,
        h(Fragment, null, h("li", null, "a"), h("li", null, "b")),
        [h("li", null, "c"), [h("li", null, "d")]],
      );
    dispose = mount(h(Root, null), container);
    expect(Array.from(container.querySelectorAll("li")).map((n) => n.textContent)).toEqual(["a", "b", "c", "d"]);
  });

  it("components returning fragments don't collide with following siblings", () => {
    const Pair = () => h(Fragment, null, h("li", null, "p1"), h("li", null, "p2"));
    const Root = () => h("ul", null, h(Pair, null), h("li", null, "after"), h(Pair, null));
    dispose = mount(h(Root, null), container);
    expect(Array.from(container.querySelectorAll("li")).map((n) => n.textContent))
      .toEqual(["p1", "p2", "after", "p1", "p2"]);
  });

  it("injected vdom co-exists with component output", () => {
    const Root = () => h("div", { id: "host" }, h("span", null, "one"));
    dispose = mount(h(Root, null), container);
    injectVdom("host", 1000, h("span", null, "two"));
    expect(Array.from(container.querySelectorAll("span")).map((n) => n.textContent)).toEqual(["one", "two"]);
  });

  it("creates svg elements in the SVG namespace and updates them in place", () => {
    set("icon", "d", "M0 0L1 1");
    const Icon = () => {
      const d = String(when(["icon", "d", $.d])[0]?.d ?? "");
      return h(
        "svg",
        { width: 12, viewBox: "0 0 12 12" },
        h("path", { d, stroke: "currentColor", "stroke-width": 1.5 }),
        h("foreignObject", null, h("div", null, "html")),
      );
    };
    dispose = mount(h("span", null, h(Icon, null)), container);

    const svg = container.querySelector("svg")!;
    const path = container.querySelector("path")!;
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(path.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 12 12");
    expect(path.getAttribute("stroke-width")).toBe("1.5");
    expect(container.querySelector("foreignObject div")!.namespaceURI).toBe("http://www.w3.org/1999/xhtml");

    set("icon", "d", "M1 1L2 2");
    expect(container.querySelector("path")).toBe(path);
    expect(path.getAttribute("d")).toBe("M1 1L2 2");
  });

  it("focuses elements with autofocus when they are created", () => {
    replace("ui", "show", false);
    const Root = () => {
      const show = when(["ui", "show", true]).length > 0;
      return h("div", null, show ? h("input", { autofocus: true }) : null);
    };
    dispose = mount(h(Root, null), container);
    replace("ui", "show", true);
    expect(document.activeElement).toBe(container.querySelector("input"));
  });
});
