// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db";
import { $, _, when, replace } from "../primitives";
import { h, Portal, createContext, useContext, useComponentId, useCleanup } from "../jsx";
import { mount } from "../renderer";
import { describeUI, outlineUI, type UINode } from "../describe";
import { drive, press, useDriver, clearDrivers } from "../drive";
import type { Term } from "../db";

let container: HTMLElement;
let dispose: (() => void) | null = null;

beforeEach(() => {
  db.clear();
  clearDrivers();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  dispose?.();
  dispose = null;
  container.remove();
});

/** A toggle whose open state lives in the fact DB under its component id, like @jam/ui's useControllableState. */
function Disclosure(props: { label: string; open?: boolean; onOpenChange?: (open: boolean) => void; children?: unknown }) {
  const id = useComponentId();
  const stored = when([id, "open", $.open])[0]?.open as boolean | undefined;
  const open = props.open ?? stored ?? false;
  const setOpen = (next: boolean) => {
    props.onOpenChange?.(next);
    if (props.open === undefined) replace(id, "open", next);
  };
  useDriver("open", { set: (v: Term) => setOpen(Boolean(v)), get: () => open });
  useCleanup(() => db.drop(id, "open", _));
  return h(
    "div",
    null,
    h("button", { "aria-expanded": String(open), onClick: () => setOpen(!open) }, props.label),
    open ? h("div", { role: "region", "aria-label": `${props.label} panel` }, props.children as never) : null,
  );
}

const flatten = (nodes: UINode[]): UINode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
const find = (nodes: UINode[], role: string, name?: string) =>
  flatten(nodes).find((n) => n.role === role && (name === undefined || n.name === name));

describe("describeUI", () => {
  it("names controls the way a screen reader would and collapses unnamed containers", () => {
    const App = () =>
      h(
        "div",
        null,
        h("h1", null, "Settings"),
        h("div", null, h("label", { htmlFor: "email" }, "Email"), h("input", { id: "email", type: "email", value: "a@b.c", required: true })),
        h("p", { id: "hint" }, "We never share it."),
        h("button", { "aria-describedby": "hint", disabled: true }, h("span", { "aria-hidden": "true" }, "★"), "Save"),
        h("a", { href: "/docs" }, "Docs"),
        h("span", null, "plain ", "text"),
      );
    dispose = mount(h(App, null), container);

    const tree = describeUI();
    expect(find(tree, "heading", "Settings")?.state).toEqual({ level: 1 });
    expect(find(tree, "textbox", "Email")?.state).toMatchObject({ value: "a@b.c", required: true });
    const save = find(tree, "button", "Save")!;
    expect(save.state.disabled).toBe(true);
    expect(save.description).toBe("We never share it.");
    expect(save.children).toEqual([]);
    expect(find(tree, "link", "Docs")?.state.href).toBe("/docs");
    expect(flatten(tree).filter((n) => n.role === "text").map((n) => n.name)).toEqual(["We never share it.", "plain", "text"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ role: "generic", component: "App" });
    expect(flatten(tree[0].children).some((n) => n.role === "generic")).toBe(false);
  });

  it("reports a component's drivable state once, at its first element, and reads live input values", () => {
    const App = () => h("main", null, h(Disclosure, { label: "Advanced" }, h("input", { type: "text", placeholder: "Token" })));
    dispose = mount(h(App, null), container);

    const collapsed = describeUI();
    const wrapper = find(collapsed, "generic")!;
    expect(wrapper).toMatchObject({ id: "dom:0:0", component: "Disclosure", drive: { id: "dom:0:0", component: "Disclosure", keys: { open: false } } });
    const button = find(collapsed, "button", "Advanced")!;
    expect(button).toMatchObject({ id: "dom:0:0:0", state: { expanded: false } });
    expect(button.drive).toBeUndefined();
    expect(find(collapsed, "region")).toBeUndefined();
    expect(outlineUI()).toBe(["main #dom:0 <App>", "  generic #dom:0:0 (Disclosure open=false)", '    button "Advanced" #dom:0:0:0 expanded=false'].join("\n"));

    press(button.id!);
    const expanded = describeUI();
    expect(find(expanded, "generic")?.drive?.keys).toEqual({ open: true });
    const region = find(expanded, "region", "Advanced panel")!;
    expect(region.drive).toBeUndefined();
    const token = find(expanded, "textbox", "Token")!;
    expect(token.state).toMatchObject({ value: "", placeholder: "Token" });

    (container.querySelector("input") as HTMLInputElement).value = "typed";
    expect(find(describeUI(), "textbox", "Token")?.state.value).toBe("typed");
  });

  it("describes portalled content in tree order after the rest and keeps hidden subtrees out", () => {
    const App = () =>
      h(
        "div",
        null,
        h("button", null, "Open"),
        h("ul", { hidden: true }, h("li", null, "secret")),
        h("div", { style: { display: "none" } }, "invisible"),
        h(Portal, null, h("div", { role: "dialog", "aria-label": "Confirm" }, h("button", null, "OK"))),
      );
    dispose = mount(h(App, null), container);

    expect(outlineUI()).toBe(
      ["generic #dom:0 <App>", '  button "Open" #dom:0:0', 'dialog "Confirm" #dom:0:3:0', '  button "OK" #dom:0:3:0:0'].join("\n"),
    );
  });

  it("keeps only interactive nodes and their structure in interactive mode", () => {
    const App = () =>
      h(
        "nav",
        { "aria-label": "Main" },
        h("p", null, "Welcome back"),
        h("ul", null, h("li", null, "Static"), h("li", null, h("a", { href: "/a" }, "Alpha"))),
        h("div", { onClick: () => {} }, "Clickable card"),
      );
    dispose = mount(h(App, null), container);

    const outline = outlineUI({ interactive: true });
    expect(outline).toBe(
      [
        `navigation "Main" #dom:0 <App>`,
        `  list #dom:0:1`,
        `    listitem #dom:0:1:1`,
        `      link "Alpha" #dom:0:1:1:0 href="/a"`,
        `  generic #dom:0:2 clickable=true`,
      ].join("\n"),
    );
    expect(outline).not.toMatch(/Welcome|Static/);
  });

  it("labels a scoped root as the full outline does, not with the components begun above it", () => {
    const Side = () => h("section", { id: "side", "aria-label": "Side" }, h("button", null, "B"));
    const App = () => h("div", null, h("button", null, "A"), h(Side, null), h("footer", null, "Foot"));
    dispose = mount(h(App, null), container);
    expect(outlineUI({ root: "side" })).toBe(`region "Side" #side <Side>\n  button "B" #side:0`);
    expect(outlineUI({ root: "#dom:0:2" })).toBe(`contentinfo #dom:0:2\n  text "Foot"`);
  });

  it("describes from a component id: its elements while it renders, its hidden node when it does not", () => {
    function Sheet() {
      const id = useComponentId();
      const open = when([id, "open", $.open])[0]?.open === true;
      useDriver("open", { set: (v: Term) => replace(id, "open", Boolean(v)), get: () => open });
      useCleanup(() => db.drop(id, "open", _));
      return open ? h(Portal, null, h("div", { role: "dialog", "aria-label": "Sheet" }, h("button", null, "Close"))) : null;
    }
    const App = () => h("main", null, h("h1", null, "Page"), h(Sheet, null));
    dispose = mount(h(App, null), container);

    expect(outlineUI({ root: "dom:0:1" })).toBe("hidden #dom:0:1 (Sheet open=false)");
    drive("#dom:0:1", "open", true);
    expect(outlineUI({ root: "dom:0:1" })).toBe(['dialog "Sheet" #dom:0:1:0 (Sheet open=true)', '  button "Close" #dom:0:1:0:0'].join("\n"));
    expect(outlineUI({ root: "dom:0:1", interactive: true })).toBe(['dialog "Sheet" #dom:0:1:0 (Sheet open=true)', '  button "Close" #dom:0:1:0:0'].join("\n"));
  });

  it("counts a compound's parts as its own even when a page wrote them, so its state attaches to the visible tree", () => {
    const PopupContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({ open: false, setOpen: () => {} });
    function Popup(props: { children?: unknown }) {
      const id = useComponentId();
      const open = when([id, "open", $.open])[0]?.open === true;
      const setOpen = (next: boolean) => replace(id, "open", next);
      useDriver("open", { set: (v: Term) => setOpen(Boolean(v)), get: () => open });
      useCleanup(() => db.drop(id, "open", _));
      return h(PopupContext.Provider, { value: { open, setOpen } }, props.children as never);
    }
    function PopupTrigger(props: { children?: unknown }) {
      const ctx = useContext(PopupContext);
      return h("button", { "aria-expanded": String(ctx.open), onClick: () => ctx.setOpen(!ctx.open) }, props.children as never);
    }
    function PopupContent() {
      const ctx = useContext(PopupContext);
      return ctx.open ? h(Portal, null, h("div", { role: "dialog", "aria-label": "Popup" }, "body")) : null;
    }
    const App = () => h("main", null, h(Popup, null, h(PopupTrigger, null, "Open"), h(PopupContent, null)), h("p", null, "after"));
    dispose = mount(h(App, null), container);

    expect(outlineUI()).toBe(["main #dom:0 <App>", '  button "Open" #dom:0:0:0 expanded=false (Popup open=false)', '  text "after"'].join("\n"));
    expect(outlineUI({ root: "dom:0:0" })).toBe('button "Open" #dom:0:0:0 expanded=false (Popup open=false)');
    drive("dom:0:0:0", "open", true);
    expect(outlineUI({ root: "dom:0:0" })).toBe(['button "Open" #dom:0:0:0 expanded=true (Popup open=true)', 'dialog "Popup" #dom:0:0:1:0 <PopupContent>', '  text "body"'].join("\n"));
    expect(flatten(describeUI()).filter((n) => n.role === "hidden")).toEqual([]);
  });

  it("treats header and footer as landmarks only outside sectioning content", () => {
    const App = () =>
      h("div", null,
        h("header", null, h("h1", null, "Site")),
        h("main", null, h("section", { "aria-label": "Column" }, h("header", null, h("h2", null, "Backlog")))),
        h("div", { role: "region", "aria-label": "Aside" }, h("footer", null, "Note")));
    dispose = mount(h(App, null), container);
    expect(flatten(describeUI()).map((n) => n.role)).toEqual(["generic", "banner", "heading", "main", "region", "heading", "region", "text"]);
  });

  it("lists drivable components that render nothing visible as hidden nodes, so they can still be driven", () => {
    function Drawer() {
      const id = useComponentId();
      const open = when([id, "open", $.open])[0]?.open === true;
      useDriver("open", { set: (v: Term) => replace(id, "open", Boolean(v)), get: () => open });
      useCleanup(() => db.drop(id, "open", _));
      return open ? h("aside", { "aria-label": "Drawer" }, "contents") : null;
    }
    const App = () => h("div", null, h("h1", null, "Page"), h(Drawer, null));
    dispose = mount(h(App, null), container);

    expect(outlineUI()).toBe(["generic #dom:0 <App>", '  heading "Page" #dom:0:0 level=1', "hidden #dom:0:1 (Drawer open=false)"].join("\n"));
    expect(outlineUI({ root: "dom:0:0" })).not.toMatch(/hidden/);
    drive("dom:0:1", "open", true);
    expect(outlineUI()).toBe(
      ["generic #dom:0 <App>", '  heading "Page" #dom:0:0 level=1', '  complementary "Drawer" #dom:0:1 (Drawer open=true)', '    text "contents"'].join("\n"),
    );
  });

  it("records both names when a component's whole output is another component", () => {
    const App = () => h(Disclosure, { label: "Only" });
    dispose = mount(h(App, null), container);
    expect(outlineUI({ interactive: true })).toBe(["generic #dom:0 (App/Disclosure open=false)", '  button "Only" #dom:0:0 expanded=false'].join("\n"));
  });
});

describe("drive", () => {
  it("sets uncontrolled component state through its driver and fires onChange once", () => {
    const onOpenChange = vi.fn();
    const App = () => h(Disclosure, { label: "More", onOpenChange });
    dispose = mount(h(App, null), container);

    const button = find(describeUI(), "button", "More")!;
    drive(button.id!, "open", true);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(container.querySelector("[role=region]")).not.toBeNull();
    expect(find(describeUI(), "button", "More")?.state.expanded).toBe(true);
  });

  it("drives a controlled component by asking its owner, as a click would", () => {
    replace("app", "open", false);
    const App = () => {
      const open = when(["app", "open", $.v])[0]?.v as boolean;
      return h(Disclosure, { label: "Filters", open, onOpenChange: (next: boolean) => replace("app", "open", next) });
    };
    dispose = mount(h(App, null), container);

    drive(find(describeUI(), "button", "Filters")!.id!, "open", true);
    expect(when(["app", "open", $.v])[0]?.v).toBe(true);
    expect(container.querySelector("[role=region]")).not.toBeNull();
  });

  it("resolves the nearest driver for the key from any element inside the component", () => {
    const App = () => h(Disclosure, { label: "Outer" }, h(Disclosure, { label: "Inner" }));
    dispose = mount(h(App, null), container);
    const outer = find(describeUI(), "button", "Outer")!.id!;
    drive(outer, "open", true);
    const inner = find(describeUI(), "button", "Inner")!;
    drive(inner.id!, "open", true);
    expect(find(describeUI(), "button", "Inner")?.state.expanded).toBe(true);
    expect(find(describeUI(), "button", "Outer")?.state.expanded).toBe(true);
    drive(inner.id!, "open", false);
    expect(find(describeUI(), "button", "Inner")?.state.expanded).toBe(false);
    expect(find(describeUI(), "button", "Outer")?.state.expanded).toBe(true);
  });

  it("types into native inputs with input and change events", () => {
    const seen: string[] = [];
    const App = () => h("input", { "aria-label": "Search", onInput: (e: Event) => seen.push((e.target as HTMLInputElement).value) });
    dispose = mount(h(App, null), container);
    drive(find(describeUI(), "textbox", "Search")!.id!, "value", "milk");
    expect(seen).toEqual(["milk"]);
    expect(find(describeUI(), "textbox", "Search")?.state.value).toBe("milk");
  });

  it("toggles native checkboxes only when the value differs", () => {
    const changes: boolean[] = [];
    const App = () => h("input", { type: "checkbox", "aria-label": "Done", onChange: (e: Event) => changes.push((e.target as HTMLInputElement).checked) });
    dispose = mount(h(App, null), container);
    const id = find(describeUI(), "checkbox", "Done")!.id!;
    drive(id, "checked", true);
    drive(id, "checked", true);
    drive(id, "checked", false);
    expect(changes).toEqual([true, false]);
  });

  it("throws when nothing drives the key, and never leaves the intent fact behind", () => {
    const App = () => h("button", null, "Nope");
    dispose = mount(h(App, null), container);
    const id = find(describeUI(), "button", "Nope")!.id!;
    expect(() => drive(id, "value", 1)).toThrow(/Nothing drives "value"/);
    expect(Array.from(db.facts.values()).some((f) => f[0] === "drive")).toBe(false);
  });

  it("records the intent as a non-durable fact for the duration of the action", () => {
    const seen: Array<[string, boolean]> = [];
    const stop = db.observe((type, _key, fact, info) => {
      if (fact[0] === "drive") seen.push([type, info.durable]);
    });
    const App = () => h(Disclosure, { label: "Log" });
    dispose = mount(h(App, null), container);
    drive(find(describeUI(), "button", "Log")!.id!, "open", true);
    stop();
    expect(seen).toEqual([
      ["add", false],
      ["delete", false],
    ]);
  });

  it("forgets a component's drivers when it leaves the tree", () => {
    replace("app", "show", true);
    const App = () => (when(["app", "show", true]).length ? h(Disclosure, { label: "Gone" }) : h("span", null, "empty"));
    dispose = mount(h(App, null), container);
    const id = find(describeUI(), "button", "Gone")!.id!;
    replace("app", "show", false);
    expect(() => drive(id, "open", true)).toThrow(/Nothing drives/);
  });
});

describe("press", () => {
  it("clicks the element's DOM node so native semantics apply", () => {
    const clicks: string[] = [];
    const App = () =>
      h("form", { onSubmit: (e: Event) => { e.preventDefault(); clicks.push("submit"); } },
        h("button", { type: "submit", onClick: () => clicks.push("click") }, "Go"),
        h("button", { disabled: true, onClick: () => clicks.push("disabled") }, "Off"));
    dispose = mount(h(App, null), container);
    const tree = describeUI();
    press(find(tree, "button", "Go")!.id!);
    press(find(tree, "button", "Off")!.id!);
    expect(clicks).toEqual(["click", "submit"]);
  });

  it("sends the browser's press sequence and renders between events, so handlers see the state earlier ones wrote", () => {
    const events: string[] = [];
    const log = (e: Event) => events.push(`${e.type}${e instanceof MouseEvent && e.button !== 0 ? "?" : ""}`);
    const App = () => {
      const down = when(["press", "down", true]).length > 0;
      return h("div", null,
        h("button", {
          onPointerDown: (e: Event) => { log(e); replace("press", "down", true); },
          onMouseDown: log, onFocus: log, onPointerUp: log, onMouseUp: log,
          onClick: () => events.push(down ? "click" : "click:stale"),
        }, "Menu"),
        h("button", { disabled: true, onPointerDown: log, onFocus: log, onClick: log }, "Off"));
    };
    dispose = mount(h(App, null), container);
    const tree = describeUI();
    press(find(tree, "button", "Menu")!.id!);
    press(find(tree, "button", "Off")!.id!);
    expect(events).toEqual(["pointerdown", "mousedown", "focus", "pointerup", "mouseup", "click"]);
  });

  it("accepts ids with the outline's # prefix", () => {
    const clicks: string[] = [];
    const App = () => h("button", { onClick: () => clicks.push("go") }, "Go");
    dispose = mount(h(App, null), container);
    press("#dom:0");
    expect(clicks).toEqual(["go"]);
  });

  it("throws for an id with nothing to click", () => {
    expect(() => press("nowhere")).toThrow(/Nothing to press/);
  });
});
