// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, injectedRules, setupDefaultUI } from "../../testing";
import { Group, XGroup, YGroup } from "../Group";
import { Button } from "../Button";
import { Separator } from "../Separator";

const item = (label: string) => h(XGroup.Item, null, h(Button, null, label));

beforeEach(() => {
  setupDefaultUI();
});

describe("Group", () => {
  it("lays items out in a row and marks the orientation", () => {
    const r = render(h(XGroup, null, item("a"), item("b")));
    expect(r.root.classList.contains("is_Group")).toBe(true);
    expect(css(r.root)).toMatchObject({ "flex-direction": "row", "align-items": "stretch" });
    expect(r.root.className).toContain("_jui_grp_h");
    expect(r.all(".is_GroupItem")).toHaveLength(2);
  });

  it("YGroup is a column and the default Group", () => {
    const r = render(h(YGroup, null, item("a")));
    expect(css(r.root)["flex-direction"]).toBe("column");
    expect(r.root.className).toContain("_jui_grp_v");
    expect(Group).toBe(YGroup);
  });

  it("renders an empty group without children", () => {
    const r = render(h(XGroup, null));
    expect(r.root.classList.contains("is_Group")).toBe(true);
    expect(r.root.childElementCount).toBe(0);
  });

  it("takes the radius from the size token", () => {
    expect(css(render(h(XGroup, null, item("a"))).root)["border-radius"]).toBe("9px");
    expect(css(render(h(XGroup, { size: "$6" }, item("a"))).root)["border-radius"]).toBe("16px");
    expect(css(render(h(XGroup, { size: 12 }, item("a"))).root)["border-radius"]).toBe("12px");
  });

  it("passes its radius to the first and last item only", () => {
    render(h(XGroup, null, item("a"), item("b")));
    const rules = injectedRules();
    expect(rules.some((r) => r.includes("_jui_grp_r._jui_grp_h > .is_GroupItem,") && r.includes("border-radius: 0"))).toBe(true);
    expect(rules.some((r) => r.includes(":first-child") && r.includes("border-top-left-radius: inherit"))).toBe(true);
    expect(rules.some((r) => r.includes(":last-child") && r.includes("border-bottom-right-radius: inherit"))).toBe(true);
  });

  it("disablePassBorderRadius leaves the items alone", () => {
    const r = render(h(XGroup, { disablePassBorderRadius: true }, item("a")));
    expect(r.root.className).not.toContain("_jui_grp_r");
  });

  it("collapses adjacent borders when bordered", () => {
    const r = render(h(XGroup, { bordered: true }, item("a"), item("b")));
    expect(r.root.className).toContain("_jui_grp_b");
    expect(css(r.root)["border-width"]).toBe("1px");
    expect(
      injectedRules().some((rule) => rule.includes(":not(:first-child)") && rule.includes("border-left-width: 0")),
    ).toBe(true);
  });

  it("renders a separator between items but not around them", () => {
    const r = render(h(YGroup, { separator: h(Separator, null) }, item("a"), item("b"), item("c")));
    expect(r.all(".is_Separator")).toHaveLength(2);
    expect(r.root.children[1].classList.contains("is_Separator")).toBe(true);
  });

  it("keeps class names passed in", () => {
    const r = render(h(XGroup, { class: "mine" }, item("a")));
    expect(r.root.classList.contains("mine")).toBe(true);
  });
});
