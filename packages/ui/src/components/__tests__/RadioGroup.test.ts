// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, keydown, setupDefaultUI } from "../../testing";
import { RadioGroup } from "../RadioGroup";

beforeEach(() => {
  setupDefaultUI();
});

const group = (props: Record<string, unknown> = {}, items = ["a", "b", "c"], itemProps: Record<string, unknown> = {}) =>
  render(
    h(
      RadioGroup,
      props,
      ...items.map((value) =>
        h(RadioGroup.Item, { key: value, value, ...(value === "c" ? itemProps : {}) }, h(RadioGroup.Indicator, null)),
      ),
    ),
  );

describe("RadioGroup", () => {
  it("renders a radiogroup of radio buttons", () => {
    const r = group();
    expect(r.root.getAttribute("role")).toBe("radiogroup");
    expect(r.root.getAttribute("aria-orientation")).toBe("vertical");
    expect(css(r.root)).toMatchObject({ display: "flex", "flex-direction": "column", gap: "7px" });
    const items = r.all("[role=radio]");
    expect(items).toHaveLength(3);
    expect(items[0].tagName).toBe("BUTTON");
    expect(items[0].getAttribute("type")).toBe("button");
    expect(items[0].getAttribute("aria-checked")).toBe("false");
    expect(items[0].dataset.value).toBe("a");
  });

  it("lays out horizontally and reports the orientation", () => {
    const r = group({ orientation: "horizontal" });
    expect(r.root.getAttribute("aria-orientation")).toBe("horizontal");
    expect(css(r.root)["flex-direction"]).toBe("row");
  });

  it("sizes items at half the size token and rounds them fully", () => {
    const r = group();
    expect(css(r.get("[role=radio]"))).toMatchObject({ width: "22px", height: "22px", "border-radius": "100000px" });
    const big = group({ size: "$6" });
    expect(css(big.get("[role=radio]")).width).toBe("32px");
    expect(css(big.root).gap).toBe("32px");
    const literal = group({ size: 30 });
    expect(css(literal.get("[role=radio]")).width).toBe("30px");
  });

  it("uses theme refs and marks the selected item", () => {
    const r = group({ defaultValue: "b" });
    const [a, b] = r.all("[role=radio]");
    expect(css(a)).toMatchObject({ "background-color": "var(--background)", "border-color": "var(--borderColor)" });
    expect(css(a, ":hover")["border-color"]).toBe("var(--borderColorHover)");
    expect(css(a, ":focus-visible")["outline-color"]).toBe("var(--outlineColor)");
    expect(css(b)).toMatchObject({ "border-color": "var(--color)", "border-width": "2px" });
    expect(b.getAttribute("aria-checked")).toBe("true");
    expect(b.dataset.state).toBe("checked");
  });

  it("shows the indicator only for the selected item", () => {
    const r = group({ defaultValue: "b" });
    expect(r.all(".is_RadioGroupIndicator")).toHaveLength(1);
    const dot = r.get(".is_RadioGroupIndicator");
    expect(css(dot)).toMatchObject({ width: "50%", height: "50%", "background-color": "var(--color)" });
    expect(r.all("[role=radio]")[1].contains(dot)).toBe(true);
  });

  it("selects on click, uncontrolled", () => {
    const onValueChange = vi.fn();
    const r = group({ onValueChange });
    click(r.all("[role=radio]")[2]);
    expect(onValueChange).toHaveBeenCalledWith("c");
    expect(r.all("[role=radio]")[2].getAttribute("aria-checked")).toBe("true");
  });

  it("stays controlled when value is passed", () => {
    const onValueChange = vi.fn();
    const r = group({ value: "a", onValueChange });
    click(r.all("[role=radio]")[1]);
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(r.all("[role=radio]")[0].getAttribute("aria-checked")).toBe("true");
  });

  it("is fully tabbable with no selection and rovingly tabbable with one", () => {
    const none = group();
    expect(none.all("[role=radio]").map((el) => el.tabIndex)).toEqual([0, 0, 0]);
    const some = group({ defaultValue: "b" });
    expect(some.all("[role=radio]").map((el) => el.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("moves selection and focus with the arrow keys", () => {
    const r = group({ defaultValue: "a", orientation: "vertical" });
    const items = r.all("[role=radio]");
    items[0].focus();
    const event = keydown(items[0], "ArrowDown");
    expect(event.defaultPrevented).toBe(true);
    expect(r.all("[role=radio]")[1].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(r.all("[role=radio]")[1]);
    keydown(r.all("[role=radio]")[1], "ArrowUp");
    expect(r.all("[role=radio]")[0].getAttribute("aria-checked")).toBe("true");
  });

  it("wraps at the ends and jumps with Home and End", () => {
    const r = group({ defaultValue: "a" });
    r.all("[role=radio]")[0].focus();
    keydown(r.all("[role=radio]")[0], "ArrowUp");
    expect(r.all("[role=radio]")[2].getAttribute("aria-checked")).toBe("true");
    keydown(r.all("[role=radio]")[2], "Home");
    expect(r.all("[role=radio]")[0].getAttribute("aria-checked")).toBe("true");
    keydown(r.all("[role=radio]")[0], "End");
    expect(r.all("[role=radio]")[2].getAttribute("aria-checked")).toBe("true");
  });

  it("ignores the cross-axis arrows for its orientation", () => {
    const r = group({ defaultValue: "a", orientation: "vertical" });
    r.all("[role=radio]")[0].focus();
    expect(keydown(r.all("[role=radio]")[0], "ArrowRight").defaultPrevented).toBe(false);
    expect(r.all("[role=radio]")[0].getAttribute("aria-checked")).toBe("true");
  });

  it("skips disabled items when navigating", () => {
    const r = group({ defaultValue: "a" }, ["a", "b", "c"], { disabled: true });
    expect(r.all("[role=radio]")[2].hasAttribute("disabled")).toBe(true);
    r.all("[role=radio]")[0].focus();
    keydown(r.all("[role=radio]")[0], "ArrowUp");
    expect(r.all("[role=radio]")[1].getAttribute("aria-checked")).toBe("true");
  });

  it("disables every item when the group is disabled", () => {
    const onValueChange = vi.fn();
    const r = group({ disabled: true, onValueChange });
    const items = r.all("[role=radio]");
    expect(items.every((el) => el.hasAttribute("disabled"))).toBe(true);
    expect(css(items[0])).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    click(items[0]);
    keydown(r.root, "ArrowDown");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("reports required and renders a hidden radio input per item for the given name", () => {
    const r = group({ required: true, name: "plan", defaultValue: "a" });
    expect(r.root.getAttribute("aria-required")).toBe("true");
    const inputs = r.all("input[type=radio]");
    expect(inputs).toHaveLength(3);
    expect(inputs.every((el) => el.hasAttribute("required"))).toBe(true);
    expect((inputs[0] as HTMLInputElement).checked).toBe(true);
  });

  it("threads dir into arrow-key navigation and defaults loop to true", () => {
    const rtl = group({ orientation: "horizontal", dir: "rtl", defaultValue: "a" });
    expect(rtl.root.getAttribute("dir")).toBe("rtl");
    const items = rtl.all("[role=radio]");
    items[0].focus();
    keydown(items[0], "ArrowRight");
    expect(items[2].getAttribute("aria-checked")).toBe("true");

    const noLoop = group({ loop: false });
    const noLoopItems = noLoop.all("[role=radio]");
    noLoopItems[2].focus();
    keydown(noLoopItems[2], "ArrowDown");
    expect(document.activeElement).toBe(noLoopItems[2]);
  });

  it("preventDefaults Enter on an item", () => {
    const r = group({ defaultValue: "a" });
    const items = r.all("[role=radio]");
    items[0].focus();
    expect(keydown(items[0], "Enter").defaultPrevented).toBe(true);
  });

  it("contributes a hidden radio input per item to the owning form and restores the default on reset", () => {
    const r = render(
      h(
        "form",
        null,
        h(RadioGroup, { name: "plan", defaultValue: "a" }, h(RadioGroup.Item, { value: "a" }), h(RadioGroup.Item, { value: "b" })),
      ),
    );
    const form = r.get<HTMLFormElement>("form");
    click(r.all("[role=radio]")[1]);
    expect(new FormData(form).get("plan")).toBe("b");
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(r.all("[role=radio]")[0].getAttribute("aria-checked")).toBe("true");
    expect(new FormData(form).get("plan")).toBe("a");
  });

  it("resets to no selection when it started without a default, reporting it as an empty value", () => {
    const onValueChange = vi.fn();
    const r = render(
      h("form", null, h(RadioGroup, { name: "plan", onValueChange }, h(RadioGroup.Item, { value: "a" }), h(RadioGroup.Item, { value: "b" }))),
    );
    const form = r.get<HTMLFormElement>("form");
    click(r.all("[role=radio]")[1]);
    expect(new FormData(form).get("plan")).toBe("b");
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(r.all("[role=radio]").map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(new FormData(form).get("plan")).toBeNull();
    expect(onValueChange).toHaveBeenLastCalledWith("");
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  it("treats a controlled empty value as no selection, so every item stays a Tab stop", () => {
    const r = render(h(RadioGroup, { value: "" }, h(RadioGroup.Item, { value: "a" }), h(RadioGroup.Item, { value: "b" })));
    expect(r.all("[role=radio]").map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(r.all<HTMLElement>("[role=radio]").map((el) => el.tabIndex)).toEqual([0, 0]);
  });

  it("does not report a change when a form reset clears a group that is already empty", () => {
    const onValueChange = vi.fn();
    const r = render(h("form", null, h(RadioGroup, { value: "", onValueChange }, h(RadioGroup.Item, { value: "a" }))));
    r.get<HTMLFormElement>("form").dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("strips the default look when unstyled", () => {
    const r = render(h(RadioGroup, { unstyled: true }, h(RadioGroup.Item, { value: "a", unstyled: true })));
    expect(css(r.root).gap).toBeUndefined();
    expect(css(r.get("[role=radio]"))["background-color"]).toBe("transparent");
  });
});
