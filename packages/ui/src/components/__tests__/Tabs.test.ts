// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, keydown, setupDefaultUI } from "../../testing";
import { Tabs } from "../Tabs";

beforeEach(() => {
  setupDefaultUI();
});

const tabs = (props: Record<string, unknown> = {}, tabProps: Record<string, unknown> = {}) =>
  render(
    h(
      Tabs,
      props as never,
      h(
        Tabs.List,
        { key: "list" },
        h(Tabs.Tab, { key: "a", value: "a" }, "First"),
        h(Tabs.Tab, { key: "b", value: "b" }, "Second"),
        h(Tabs.Tab, { key: "c", value: "c", ...tabProps }, "Third"),
      ),
      h(Tabs.Content, { key: "ca", value: "a" }, "Panel A"),
      h(Tabs.Content, { key: "cb", value: "b" }, "Panel B"),
      h(Tabs.Content, { key: "cc", value: "c" }, "Panel C"),
    ),
  );

const list = (r: ReturnType<typeof render>) => r.get("[role=tablist]");
const tabList = (r: ReturnType<typeof render>) => r.all("[role=tab]");
const panels = (r: ReturnType<typeof render>) => r.all("[role=tabpanel]");

describe("Tabs", () => {
  it("wires the tabs to their panels", () => {
    const r = tabs({ defaultValue: "b" });
    expect(r.root.getAttribute("data-orientation")).toBe("horizontal");
    expect(list(r).getAttribute("aria-orientation")).toBe("horizontal");
    const all = tabList(r);
    expect(all).toHaveLength(3);
    expect(all[1].getAttribute("aria-selected")).toBe("true");
    expect(all[0].getAttribute("aria-selected")).toBe("false");
    expect(all[1].dataset.state).toBe("active");
    expect(all[1].getAttribute("type")).toBe("button");

    const shown = panels(r);
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toBe("Panel B");
    expect(shown[0].id).toBe(all[1].getAttribute("aria-controls"));
    expect(shown[0].getAttribute("aria-labelledby")).toBe(all[1].id);
    expect(shown[0].getAttribute("tabindex")).toBe("0");
  });

  it("sizes tabs like buttons and panels from the space token", () => {
    const r = tabs({ defaultValue: "a" });
    expect(css(tabList(r)[0])).toMatchObject({ height: "44px", "padding-left": "18px", "border-radius": "0px" });
    expect(css(tabList(r)[0])["font-size"]).toBeDefined();
    expect(css(panels(r)[0]).padding).toBe("18px");

    const small = tabs({ defaultValue: "a", size: "$2" });
    expect(css(tabList(small)[0]).height).toBe("28px");
    expect(css(panels(small)[0]).padding).toBe("7px");
  });

  it("underlines the selected tab with the theme colour", () => {
    const r = tabs({ defaultValue: "a" });
    const [first, second] = tabList(r);
    expect(css(list(r))).toMatchObject({
      "border-bottom-width": "1px",
      "border-bottom-style": "solid",
      "border-bottom-color": "var(--borderColor)",
    });
    expect(css(first)).toMatchObject({
      "border-bottom-width": "2px",
      "margin-bottom": "-1px",
      "border-bottom-color": "var(--color10)",
      color: "var(--color)",
      "font-weight": "600",
    });
    expect(css(second)).toMatchObject({ "border-bottom-color": "transparent", color: "var(--color10)" });
    expect(css(second, ":hover")).toMatchObject({ color: "var(--color)", "background-color": "var(--backgroundHover)" });
  });

  it("selects a tab on click", () => {
    const onValueChange = vi.fn();
    const r = tabs({ defaultValue: "a", onValueChange });
    click(tabList(r)[2]);
    expect(onValueChange).toHaveBeenCalledWith("c");
    expect(tabList(r)[2].getAttribute("aria-selected")).toBe("true");
    expect(panels(r)[0].textContent).toBe("Panel C");
  });

  it("focuses a tab when it is clicked", () => {
    const r = tabs({ defaultValue: "a" });
    click(tabList(r)[2]);
    expect(document.activeElement).toBe(tabList(r)[2]);
  });

  it("reverses the arrow keys with dir=\"rtl\"", () => {
    const r = tabs({ defaultValue: "a", dir: "rtl" });
    tabList(r)[0].focus();
    keydown(tabList(r)[0], "ArrowLeft");
    expect(document.activeElement).toBe(tabList(r)[1]);
  });

  it("stays controlled when a value is passed", () => {
    const onValueChange = vi.fn();
    const r = tabs({ value: "a", onValueChange });
    click(tabList(r)[1]);
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(panels(r)[0].textContent).toBe("Panel A");
  });

  it("keeps only the selected tab in the tab order", () => {
    const r = tabs({ defaultValue: "b" });
    expect(tabList(r).map((el) => el.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    const none = tabs({});
    expect(tabList(none).map((el) => el.getAttribute("tabindex"))).toEqual(["0", "0", "0"]);
  });

  it("selects as the arrow keys move in automatic mode", () => {
    const r = tabs({ defaultValue: "a" });
    tabList(r)[0].focus();
    const event = keydown(tabList(r)[0], "ArrowRight");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tabList(r)[1]);
    expect(tabList(r)[1].getAttribute("aria-selected")).toBe("true");
    expect(panels(r)[0].textContent).toBe("Panel B");

    keydown(tabList(r)[1], "End");
    expect(tabList(r)[2].getAttribute("aria-selected")).toBe("true");
    keydown(tabList(r)[2], "ArrowRight");
    expect(tabList(r)[0].getAttribute("aria-selected")).toBe("true");
    keydown(tabList(r)[0], "Home");
    expect(tabList(r)[0].getAttribute("aria-selected")).toBe("true");
  });

  it("only moves focus in manual mode", () => {
    const r = tabs({ defaultValue: "a", activationMode: "manual" });
    tabList(r)[0].focus();
    keydown(tabList(r)[0], "ArrowRight");
    expect(document.activeElement).toBe(tabList(r)[1]);
    expect(tabList(r)[0].getAttribute("aria-selected")).toBe("true");
    click(tabList(r)[1]);
    expect(tabList(r)[1].getAttribute("aria-selected")).toBe("true");
  });

  it("stops at the ends when loop is off, and ignores the cross axis", () => {
    const r = render(
      h(
        Tabs,
        { defaultValue: "a" } as never,
        h(
          Tabs.List,
          { loop: false },
          h(Tabs.Tab, { key: "a", value: "a" }, "First"),
          h(Tabs.Tab, { key: "b", value: "b" }, "Second"),
        ),
        h(Tabs.Content, { value: "a" }, "Panel A"),
        h(Tabs.Content, { value: "b" }, "Panel B"),
      ),
    );
    tabList(r)[0].focus();
    keydown(tabList(r)[0], "ArrowLeft");
    expect(document.activeElement).toBe(tabList(r)[0]);
    expect(keydown(tabList(r)[0], "ArrowDown").defaultPrevented).toBe(false);
  });

  it("skips disabled tabs and ignores their clicks", () => {
    const onValueChange = vi.fn();
    const r = tabs({ defaultValue: "a", onValueChange }, { disabled: true });
    expect(tabList(r)[2].hasAttribute("disabled")).toBe(true);
    expect(css(tabList(r)[2])).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    click(tabList(r)[2]);
    expect(onValueChange).not.toHaveBeenCalled();
    tabList(r)[1].focus();
    keydown(tabList(r)[1], "ArrowRight");
    expect(document.activeElement).toBe(tabList(r)[0]);
  });

  it("keeps panels mounted when forceMount is set", () => {
    const r = render(
      h(
        Tabs,
        { defaultValue: "a" } as never,
        h(Tabs.List, null, h(Tabs.Tab, { value: "a" }, "First"), h(Tabs.Tab, { value: "b" }, "Second")),
        h(Tabs.Content, { value: "a", forceMount: true }, "Panel A"),
        h(Tabs.Content, { value: "b", forceMount: true }, "Panel B"),
      ),
    );
    const all = r.all("[role=tabpanel]");
    expect(all).toHaveLength(2);
    expect(all[0].dataset.state).toBe("active");
    expect(all[0].tabIndex).toBe(0);
    expect(all[1].dataset.state).toBe("inactive");
    expect(all[1].hasAttribute("hidden")).toBe(false);
    expect(all[1].tabIndex).toBe(-1);
  });

  it("stacks the list beside the panel when vertical", () => {
    const r = tabs({ defaultValue: "a", orientation: "vertical" });
    expect(css(r.root)["flex-direction"]).toBe("row");
    expect(css(list(r))).toMatchObject({
      "flex-direction": "column",
      "border-right-width": "1px",
      "border-right-color": "var(--borderColor)",
    });
    expect(list(r).getAttribute("aria-orientation")).toBe("vertical");
    expect(css(tabList(r)[0])).toMatchObject({
      "border-right-width": "2px",
      "margin-right": "-1px",
      "border-right-color": "var(--color10)",
    });

    tabList(r)[0].focus();
    keydown(tabList(r)[0], "ArrowDown");
    expect(document.activeElement).toBe(tabList(r)[1]);
    expect(tabList(r)[1].getAttribute("aria-selected")).toBe("true");
    expect(keydown(tabList(r)[1], "ArrowRight").defaultPrevented).toBe(false);
  });

  it("strips the default look when unstyled", () => {
    const r = render(
      h(
        Tabs,
        { defaultValue: "a" } as never,
        h(Tabs.List, { unstyled: true }, h(Tabs.Tab, { value: "a", unstyled: true }, "First")),
        h(Tabs.Content, { value: "a", unstyled: true }, "Panel A"),
      ),
    );
    expect(css(list(r))["border-bottom-width"]).toBeUndefined();
    expect(css(tabList(r)[0]).height).toBeUndefined();
    expect(css(panels(r)[0]).padding).toBeUndefined();
  });
});
