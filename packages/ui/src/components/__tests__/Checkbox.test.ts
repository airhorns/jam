// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, keydown, setupDefaultUI } from "../../testing";
import { Checkbox } from "../Checkbox";

beforeEach(() => {
  setupDefaultUI();
});

describe("Checkbox", () => {
  it("renders a checkbox button with aria state", () => {
    const r = render(h(Checkbox, null, h(Checkbox.Indicator, null)));
    expect(r.root.tagName).toBe("BUTTON");
    expect(r.root.getAttribute("type")).toBe("button");
    expect(r.root.getAttribute("role")).toBe("checkbox");
    expect(r.root.getAttribute("aria-checked")).toBe("false");
    expect(r.root.dataset.state).toBe("unchecked");
    expect(r.root.classList.contains("is_Checkbox")).toBe(true);
  });

  it("sizes the box from the size token and rounds it", () => {
    const r = render(h(Checkbox, null));
    expect(css(r.root)).toMatchObject({ width: "20px", height: "20px", "border-radius": "5px" });
    const small = render(h(Checkbox, { size: "$2" }));
    expect(css(small.root)).toMatchObject({ width: "13px", height: "13px", "border-radius": "3px" });
    const big = render(h(Checkbox, { size: "$6" }));
    expect(css(big.root).width).toBe("29px");
    const literal = render(h(Checkbox, { size: 40 }));
    expect(css(literal.root)).toMatchObject({ width: "40px", height: "40px", "border-radius": "10px" });
  });

  it("uses theme refs for colours and states", () => {
    const r = render(h(Checkbox, null));
    expect(css(r.root)).toMatchObject({
      "background-color": "var(--background)",
      "border-color": "var(--borderColor)",
      color: "var(--color)",
    });
    expect(css(r.root, ":hover")["border-color"]).toBe("var(--borderColorHover)");
    expect(css(r.root, ":focus-visible")["outline-color"]).toBe("var(--outlineColor)");
    expect(css(r.root).transition).toContain("150ms");
  });

  it("strips the default look when unstyled", () => {
    const r = render(h(Checkbox, { unstyled: true }));
    const styles = css(r.root);
    expect(styles["background-color"]).toBe("transparent");
    expect(styles.width).toBeUndefined();
  });

  it("shows the indicator only when checked", () => {
    const r = render(h(Checkbox, { defaultChecked: false }, h(Checkbox.Indicator, null)));
    expect(r.query(".is_CheckboxIndicator")).toBeNull();
    click(r.root);
    expect(r.root.getAttribute("aria-checked")).toBe("true");
    expect(r.root.dataset.state).toBe("checked");
    const indicator = r.get(".is_CheckboxIndicator");
    expect(indicator.textContent).toBe("✓");
    expect(css(indicator)["font-size"]).toBe("15px");
  });

  it("renders custom indicator children and honours forceMount", () => {
    const r = render(h(Checkbox, { defaultChecked: true }, h(Checkbox.Indicator, null, "x")));
    expect(r.get(".is_CheckboxIndicator").textContent).toBe("x");
    const forced = render(h(Checkbox, null, h(Checkbox.Indicator, { forceMount: true }, "y")));
    expect(forced.get(".is_CheckboxIndicator").textContent).toBe("y");
  });

  it("renders indeterminate as a mixed dash", () => {
    const r = render(h(Checkbox, { checked: "indeterminate" }, h(Checkbox.Indicator, null)));
    expect(r.root.getAttribute("aria-checked")).toBe("mixed");
    expect(r.root.dataset.state).toBe("indeterminate");
    const indicator = r.get(".is_CheckboxIndicator");
    expect(indicator.textContent).toBe("");
    expect(css(indicator)).toMatchObject({ height: "2px", "background-color": "var(--color)" });
  });

  it("toggles uncontrolled and reports changes", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Checkbox, { defaultChecked: false, onCheckedChange }));
    click(r.root);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(r.root.getAttribute("aria-checked")).toBe("true");
    click(r.root);
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(r.root.getAttribute("aria-checked")).toBe("false");
  });

  it("stays controlled when checked is passed", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Checkbox, { checked: false, onCheckedChange }));
    click(r.root);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(r.root.getAttribute("aria-checked")).toBe("false");
  });

  it("moves from indeterminate to checked", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Checkbox, { defaultChecked: "indeterminate", onCheckedChange }));
    click(r.root);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("disables with the real attribute and dims", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Checkbox, { disabled: true, onCheckedChange }));
    expect(r.root.hasAttribute("disabled")).toBe(true);
    expect(css(r.root)).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    click(r.root);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("mirrors a hidden input for forms", () => {
    const r = render(h(Checkbox, { name: "terms", value: "yes", required: true, defaultChecked: true }));
    const input = r.get<HTMLInputElement>("input[type=checkbox]");
    expect(input.name).toBe("terms");
    expect(input.checked).toBe(true);
    expect(input.getAttribute("aria-hidden")).toBe("true");
    expect(r.get("button").getAttribute("aria-required")).toBe("true");
  });

  it("leaves Space and Enter to the native button", () => {
    const r = render(h(Checkbox, null));
    const event = keydown(r.root, " ");
    expect(event.defaultPrevented).toBe(false);
  });

  it("shares size with the indicator through context", () => {
    const r = render(h(Checkbox, { size: "$2", defaultChecked: true }, h(Checkbox.Indicator, null)));
    expect(css(r.get(".is_CheckboxIndicator"))["font-size"]).toBe("10px");
    const literal = render(h(Checkbox, { size: 40, defaultChecked: true }, h(Checkbox.Indicator, null)));
    expect(css(literal.get(".is_CheckboxIndicator"))["font-size"]).toBe("30px");
  });

  it("leaves the box and indicator unsized for an unknown size token", () => {
    const r = render(h(Checkbox, { size: "$nonexistent", defaultChecked: true }, h(Checkbox.Indicator, null)));
    expect(css(r.root).width).toBeUndefined();
    expect(css(r.get(".is_CheckboxIndicator"))["font-size"]).toBeUndefined();
  });

  it("resets to unchecked when no default was given", () => {
    const r = render(h("form", null, h(Checkbox, { name: "agree" })));
    click(r.get("button"));
    expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    r.get<HTMLFormElement>("form").dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(r.get("button").getAttribute("aria-checked")).toBe("false");
  });

  it("runs a caller onClick before toggling and ignores clicks reaching a disabled box through the indicator", () => {
    const onClick = vi.fn();
    const r = render(h(Checkbox, { onClick }));
    click(r.root);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(r.root.getAttribute("aria-checked")).toBe("true");

    const onCheckedChange = vi.fn();
    const disabled = render(h(Checkbox, { disabled: true, defaultChecked: true, onCheckedChange }, h(Checkbox.Indicator, null)));
    disabled.get(".is_CheckboxIndicator").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(disabled.root.getAttribute("aria-checked")).toBe("true");
  });
});
