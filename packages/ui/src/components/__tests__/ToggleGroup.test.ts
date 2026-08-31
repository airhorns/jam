// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, keydown, injectedRules, setupDefaultUI } from "../../testing";
import { ToggleGroup } from "../ToggleGroup";

beforeEach(() => {
  setupDefaultUI();
});

const items = (props: Record<string, unknown> = {}, itemProps: Record<string, unknown> = {}) =>
  render(
    h(
      ToggleGroup,
      props as never,
      h(ToggleGroup.Item, { key: "left", value: "left" }, "Left"),
      h(ToggleGroup.Item, { key: "center", value: "center" }, "Center"),
      h(ToggleGroup.Item, { key: "right", value: "right", ...itemProps }, "Right"),
    ),
  );

const buttons = (r: ReturnType<typeof render>) => r.all("button[aria-pressed]");

describe("ToggleGroup", () => {
  it("renders a group of pressable buttons", () => {
    const r = items();
    expect(r.root.getAttribute("role")).toBe("group");
    expect(r.root.getAttribute("aria-orientation")).toBe("horizontal");
    expect(css(r.root)).toMatchObject({ display: "inline-flex", "flex-direction": "row" });
    const all = buttons(r);
    expect(all).toHaveLength(3);
    expect(all[0].tagName).toBe("BUTTON");
    expect(all[0].getAttribute("type")).toBe("button");
    expect(all[0].getAttribute("aria-pressed")).toBe("false");
    expect(all[0].dataset.state).toBe("off");
    expect(all[0].textContent).toBe("Left");
  });

  it("sizes items like buttons from the size token", () => {
    const r = items();
    expect(css(buttons(r)[0])).toMatchObject({ height: "44px", "padding-left": "18px", "border-radius": "9px" });
    const small = items({ size: "$2" });
    expect(css(buttons(small)[0])).toMatchObject({ height: "28px", "border-radius": "5px" });
    expect(css(buttons(small)[0])["font-size"]).toBeDefined();
  });

  it("joins the items with injected first/last child rules", () => {
    const r = items();
    expect(r.root.classList.contains("jam-grouped-h")).toBe(true);
    const rules = injectedRules().join("\n");
    expect(rules).toContain(".jam-grouped-h > *:not(:first-child)");
    expect(rules).toContain("margin-left: -1px");
    expect(rules).toContain(".jam-grouped-h > *:not(:last-child)");
  });

  it("stacks vertically", () => {
    const r = items({ orientation: "vertical" });
    expect(css(r.root)["flex-direction"]).toBe("column");
    expect(r.root.classList.contains("jam-grouped-v")).toBe(true);
    expect(injectedRules().join("\n")).toContain(".jam-grouped-v > *:not(:first-child)");
  });

  it("styles the active item with theme refs", () => {
    const r = items({ defaultValue: "center" });
    const [left, center] = buttons(r);
    expect(css(left)).toMatchObject({ "background-color": "var(--background)", "border-color": "var(--borderColor)" });
    expect(css(center)).toMatchObject({ "background-color": "var(--color5)", "border-color": "var(--color7)" });
    expect(css(center, ":hover")["background-color"]).toBe("var(--color6)");
    expect(center.getAttribute("aria-pressed")).toBe("true");
    expect(center.dataset.state).toBe("on");
  });

  it("selects one value at a time in single mode", () => {
    const onValueChange = vi.fn();
    const r = items({ onValueChange });
    click(buttons(r)[0]);
    expect(onValueChange).toHaveBeenCalledWith("left");
    expect(buttons(r)[0].getAttribute("aria-pressed")).toBe("true");
    click(buttons(r)[1]);
    expect(buttons(r)[0].getAttribute("aria-pressed")).toBe("false");
    expect(buttons(r)[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("deselects in single mode unless disableDeactivation is set", () => {
    const r = items({ defaultValue: "left" });
    click(buttons(r)[0]);
    expect(buttons(r)[0].getAttribute("aria-pressed")).toBe("false");

    const sticky = items({ defaultValue: "left", disableDeactivation: true });
    click(buttons(sticky)[0]);
    expect(buttons(sticky)[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps a list in multiple mode", () => {
    const onValueChange = vi.fn();
    const r = items({ type: "multiple", defaultValue: ["left"], onValueChange });
    click(buttons(r)[2]);
    expect(onValueChange).toHaveBeenCalledWith(["left", "right"]);
    expect(buttons(r).map((el) => el.getAttribute("aria-pressed"))).toEqual(["true", "false", "true"]);
    click(buttons(r)[0]);
    expect(onValueChange).toHaveBeenLastCalledWith(["right"]);
    expect(buttons(r)[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("stays controlled when a value is passed", () => {
    const onValueChange = vi.fn();
    const r = items({ value: "left", onValueChange });
    click(buttons(r)[1]);
    expect(onValueChange).toHaveBeenCalledWith("center");
    expect(buttons(r)[0].getAttribute("aria-pressed")).toBe("true");

    const multi = items({ type: "multiple", value: ["left"], onValueChange });
    click(buttons(multi)[1]);
    expect(onValueChange).toHaveBeenLastCalledWith(["left", "center"]);
    expect(buttons(multi)[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("moves focus with the arrow keys without changing the selection", () => {
    const r = items({ defaultValue: "left" });
    buttons(r)[0].focus();
    const event = keydown(buttons(r)[0], "ArrowRight");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons(r)[1]);
    expect(buttons(r)[0].getAttribute("aria-pressed")).toBe("true");
    keydown(buttons(r)[1], "End");
    expect(document.activeElement).toBe(buttons(r)[2]);
    keydown(buttons(r)[2], "ArrowRight");
    expect(document.activeElement).toBe(buttons(r)[0]);
  });

  it("ignores the cross-axis arrows", () => {
    const r = items();
    buttons(r)[0].focus();
    expect(keydown(buttons(r)[0], "ArrowDown").defaultPrevented).toBe(false);
  });

  it("skips disabled items when navigating and ignores their clicks", () => {
    const onValueChange = vi.fn();
    const r = items({ onValueChange }, { disabled: true });
    expect(buttons(r)[2].hasAttribute("disabled")).toBe(true);
    click(buttons(r)[2]);
    expect(onValueChange).not.toHaveBeenCalled();
    buttons(r)[1].focus();
    keydown(buttons(r)[1], "ArrowRight");
    expect(document.activeElement).toBe(buttons(r)[0]);
  });

  it("disables every item when the group is disabled", () => {
    const onValueChange = vi.fn();
    const r = items({ disabled: true, onValueChange });
    expect(buttons(r).every((el) => el.hasAttribute("disabled"))).toBe(true);
    expect(css(buttons(r)[0])).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    click(buttons(r)[0]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("sets data-disabled on a disabled item", () => {
    const r = items({}, { disabled: true });
    expect(buttons(r)[2].dataset.disabled).toBe("");
  });

  it("reverses the arrow keys with dir=\"rtl\"", () => {
    const r = items({ dir: "rtl" });
    buttons(r)[0].focus();
    keydown(buttons(r)[0], "ArrowRight");
    expect(document.activeElement).toBe(buttons(r)[2]);
  });

  it("stops at the ends when loop is false", () => {
    const r = items({ loop: false });
    buttons(r)[2].focus();
    keydown(buttons(r)[2], "ArrowRight");
    expect(document.activeElement).toBe(buttons(r)[2]);
  });

  it("strips the default look when unstyled", () => {
    const r = items({}, {});
    expect(css(buttons(r)[0]).height).toBe("44px");
    const bare = render(h(ToggleGroup, null, h(ToggleGroup.Item, { value: "a", unstyled: true }, "A")));
    expect(css(bare.get("button"))["background-color"]).toBe("transparent");
    expect(css(bare.get("button")).height).toBeUndefined();
  });

  it("sizes items from a literal pixel size", () => {
    const r = items({ size: 40 });
    expect(css(buttons(r)[0])).toMatchObject({ height: "40px", "padding-left": "10px", "font-size": "40px" });
  });

  it("runs caller handlers before its own and keeps a caller class", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const onValueChange = vi.fn();
    const r = items({ onValueChange, onKeyDown, class: "mine" }, { onClick });
    expect(r.root.classList.contains("mine")).toBe(true);
    click(buttons(r)[2]);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith("right");
    buttons(r)[0].focus();
    keydown(buttons(r)[0], "ArrowRight");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(buttons(r)[1]);
  });

  it("ignores arrow keys and clicks through children while disabled", () => {
    const onValueChange = vi.fn();
    const r = render(
      h(
        ToggleGroup,
        { disabled: true, onValueChange } as never,
        h(ToggleGroup.Item, { value: "a" }, h("span", { "data-testid": "inner" }, "A")),
        h(ToggleGroup.Item, { value: "b" }, "B"),
      ),
    );
    buttons(r)[0].focus();
    expect(keydown(buttons(r)[0], "ArrowRight").defaultPrevented).toBe(false);
    r.get("[data-testid=inner]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("renders childless parts and inert items outside a group", () => {
    expect(render(h(ToggleGroup, {} as never)).root.children).toHaveLength(0);
    const r = render(h(ToggleGroup, {} as never, h(ToggleGroup.Item, { value: "a" })));
    expect(buttons(r)[0].textContent).toBe("");
    const lone = render(h(ToggleGroup.Item, { value: "a" }, "Alone"));
    click(lone.root);
    expect(lone.root.getAttribute("aria-pressed")).toBe("false");
  });
});
