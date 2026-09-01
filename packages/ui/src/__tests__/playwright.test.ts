// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import type { Page } from "@playwright/test";
import { describeUI, outlineUI, drive as driveCore, press as pressCore, h } from "@jam/core";
import { render, resetUI, tick } from "../testing";
import { useControllableState } from "../state";
import { outline, describe as describeTree, flatten, matches, findAll, find, drive, press, pressNode, driveNode } from "../playwright";

// A stand-in for a Playwright page: `evaluate` runs the callback against this test's window.
const page = {
  evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
  waitForTimeout: () => tick(),
} as unknown as Page;

function Disclosure(props: { label: string }) {
  const [open, setOpen] = useControllableState<boolean>("open", { defaultValue: false });
  return h(
    "div",
    null,
    h("button", { "aria-expanded": String(open), onClick: () => setOpen(!open) }, props.label),
    open ? h("div", { role: "region", "aria-label": `${props.label} panel` }, h("input", { type: "text", placeholder: "Token" })) : null,
  );
}

function App() {
  return h("main", null, h("h1", null, "Settings"), h(Disclosure, { label: "Advanced" }), h("a", { href: "/docs" }, "Docs"));
}

beforeEach(() => {
  resetUI();
  (window as unknown as { __jam: unknown }).__jam = { describeUI, outlineUI, drive: driveCore, press: pressCore };
  render(h(App, null));
});

describe("outline and describe", () => {
  it("read the accessibility tree through window.__jam", async () => {
    expect(await outline(page)).toContain('button "Advanced" #dom:0:1:0 expanded=false');
    const tree = await describeTree(page);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ role: "main", component: "App" });
    expect(await describeTree(page, { interactive: true })).toHaveLength(1);
  });

  it("flatten lists every node depth-first", async () => {
    const nodes = flatten(await describeTree(page));
    expect(nodes.map((node) => node.role)).toEqual(["main", "heading", "generic", "button", "link"]);
  });
});

describe("matches", () => {
  it("never matches text runs and filters by role and exact or pattern name", async () => {
    const nodes = flatten(await describeTree(page, { interactive: false }));
    const button = nodes.find((node) => node.role === "button")!;
    const heading = nodes.find((node) => node.role === "heading")!;
    const text = { role: "text", name: "Advanced", state: {}, children: [] };
    expect(matches(text, {})).toBe(false);
    expect(matches(button, { role: "button" })).toBe(true);
    expect(matches(button, { role: "link" })).toBe(false);
    expect(matches(button, { name: "Advanced" })).toBe(true);
    expect(matches(button, { name: "Basic" })).toBe(false);
    expect(matches(button, { name: /^adv/i })).toBe(true);
    expect(matches(heading, { name: /^adv/i })).toBe(false);
    expect(matches({ role: "generic", state: {}, children: [] }, { name: /./ })).toBe(false);
  });

  it("filters by component, including the component that drives the node, and by state", async () => {
    const nodes = flatten(await describeTree(page));
    const wrapper = nodes.find((node) => node.component === "Disclosure")!;
    const button = nodes.find((node) => node.role === "button")!;
    expect(wrapper.drive?.component).toBe("Disclosure");
    expect(matches(wrapper, { component: "Disclosure" })).toBe(true);
    expect(matches(wrapper, { component: "App" })).toBe(false);
    expect(matches(button, { component: "Disclosure" })).toBe(false);
    expect(matches(button, { state: { expanded: false } })).toBe(true);
    expect(matches(button, { state: { expanded: true } })).toBe(false);
  });
});

describe("findAll and find", () => {
  it("findAll returns every match, scoped by `within`", async () => {
    const all = await findAll(page, { role: "button" });
    expect(all.map((node) => node.name)).toEqual(["Advanced"]);
    const [disclosure] = await findAll(page, { component: "Disclosure" });
    expect(await findAll(page, { role: "heading", within: disclosure.id })).toEqual([]);
    expect((await findAll(page, { role: "button", within: disclosure.id })).map((node) => node.id)).toEqual(["dom:0:1:0"]);
  });

  it("find waits for a node to appear", async () => {
    const pending = find(page, { role: "region" }, { timeout: 1000 });
    await tick();
    pressCore("dom:0:1:0");
    expect((await pending).name).toBe("Advanced panel");
  });

  it("find fails with the query and the current outline when nothing appears in time", async () => {
    await expect(find(page, { role: "region", name: /panel/ }, { timeout: 30 })).rejects.toThrow(
      /No node matches \{"role":"region","name":"\/panel\/"\} in:\n[\s\S]*button "Advanced"/,
    );
  });
});

describe("press and drive", () => {
  it("press clicks the element with that id", async () => {
    await press(page, "dom:0:1:0");
    expect((await findAll(page, { role: "button" }))[0].state.expanded).toBe(true);
  });

  it("drive sets a component's state through its driver", async () => {
    const [disclosure] = await findAll(page, { component: "Disclosure" });
    await drive(page, disclosure.id!, "open", true);
    expect(await findAll(page, { role: "region" })).toHaveLength(1);
  });

  it("pressNode and driveNode find first, then act, and return the node", async () => {
    const pressed = await pressNode(page, { role: "button", name: "Advanced" });
    expect(pressed.id).toBe("dom:0:1:0");
    expect(await findAll(page, { role: "textbox" })).toHaveLength(1);
    const driven = await driveNode(page, { component: "Disclosure" }, "open", false);
    expect(driven.drive?.keys).toEqual({ open: true });
    expect(await findAll(page, { role: "textbox" })).toEqual([]);
  });
});
