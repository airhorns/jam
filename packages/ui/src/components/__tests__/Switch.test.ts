// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, keydown, setupDefaultUI } from "../../testing";
import { Switch } from "../Switch";

beforeEach(() => {
  setupDefaultUI();
});

const thumb = (r: ReturnType<typeof render>) => r.get(".is_SwitchThumb");

describe("Switch", () => {
  it("renders a switch button with aria state", () => {
    const r = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(r.root.tagName).toBe("BUTTON");
    expect(r.root.getAttribute("type")).toBe("button");
    expect(r.root.getAttribute("role")).toBe("switch");
    expect(r.root.getAttribute("aria-checked")).toBe("false");
    expect(r.root.dataset.state).toBe("unchecked");
    expect(thumb(r).dataset.state).toBe("unchecked");
  });

  it("sizes the track at 65% of the size token and twice that wide", () => {
    const r = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(css(r.root)).toMatchObject({ height: "29px", width: "58px", "border-radius": "100000px" });
    expect(css(thumb(r))).toMatchObject({ width: "23px", height: "23px", left: "2px" });

    const small = render(h(Switch, { size: "$2" }, h(Switch.Thumb, null)));
    expect(css(small.root)).toMatchObject({ height: "18px", width: "36px" });
    expect(css(thumb(small)).width).toBe("12px");

    const literal = render(h(Switch, { size: 40 }, h(Switch.Thumb, null)));
    expect(css(literal.root)).toMatchObject({ height: "26px", width: "52px" });
  });

  it("translates the thumb by one track height when checked", () => {
    const off = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(css(thumb(off)).transform).toBe("translateY(-50%)");
    const on = render(h(Switch, { checked: true }, h(Switch.Thumb, null)));
    expect(css(thumb(on)).transform).toBe("translateY(-50%) translateX(29px)");
    const small = render(h(Switch, { checked: true, size: "$2" }, h(Switch.Thumb, null)));
    expect(css(thumb(small)).transform).toBe("translateY(-50%) translateX(18px)");
  });

  it("uses distinct theme refs for the on and off track", () => {
    const off = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(css(off.root)).toMatchObject({ "background-color": "var(--background)", "border-color": "var(--borderColor)" });
    const on = render(h(Switch, { checked: true }, h(Switch.Thumb, null)));
    expect(css(on.root)).toMatchObject({ "background-color": "var(--color10)", "border-color": "var(--color10)" });
    expect(css(on.root, ":hover")["background-color"]).toBe("var(--color11)");
    expect(css(thumb(on))["background-color"]).toBe("var(--color)");
  });

  it("puts the thumb in the SwitchThumb theme", () => {
    const r = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(r.root.classList.contains("t_light_Switch")).toBe(true);
    expect(thumb(r).classList.contains("t_light_SwitchThumb")).toBe(true);
    expect(css(thumb(r))["background-color"]).toBe("var(--background)");
  });

  it("transitions the track and the thumb", () => {
    const r = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(css(r.root).transition).toContain("150ms");
    expect(css(thumb(r)).transition).toContain("150ms");
  });

  it("toggles uncontrolled and reports changes", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Switch, { onCheckedChange }, h(Switch.Thumb, null)));
    click(r.root);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(r.root.getAttribute("aria-checked")).toBe("true");
    expect(thumb(r).dataset.state).toBe("checked");
    click(r.root);
    expect(r.root.getAttribute("aria-checked")).toBe("false");
  });

  it("stays controlled when checked is passed", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Switch, { checked: false, onCheckedChange }, h(Switch.Thumb, null)));
    click(r.root);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(r.root.getAttribute("aria-checked")).toBe("false");
  });

  it("sets off and on with the arrow keys", () => {
    const r = render(h(Switch, { defaultChecked: false }, h(Switch.Thumb, null)));
    const right = keydown(r.root, "ArrowRight");
    expect(right.defaultPrevented).toBe(true);
    expect(r.root.getAttribute("aria-checked")).toBe("true");
    keydown(r.root, "ArrowRight");
    expect(r.root.getAttribute("aria-checked")).toBe("true");
    keydown(r.root, "ArrowLeft");
    expect(r.root.getAttribute("aria-checked")).toBe("false");
  });

  it("leaves Space to the native button", () => {
    const r = render(h(Switch, null, h(Switch.Thumb, null)));
    expect(keydown(r.root, " ").defaultPrevented).toBe(false);
  });

  it("disables with the real attribute and dims", () => {
    const onCheckedChange = vi.fn();
    const r = render(h(Switch, { disabled: true, onCheckedChange }, h(Switch.Thumb, null)));
    expect(r.root.hasAttribute("disabled")).toBe(true);
    expect(css(r.root)).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    expect(r.root.getAttribute("data-disabled")).toBe("");
    expect(thumb(r).getAttribute("data-disabled")).toBe("");
    click(r.root);
    keydown(r.root, "ArrowRight");
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("sets aria-required and mirrors it onto the hidden input", () => {
    const r = render(h(Switch, { required: true, name: "notifications" }));
    expect(r.root.getAttribute("aria-required")).toBe("true");
    expect(r.get("input").hasAttribute("required")).toBe(true);
  });

  it("contributes a hidden checkbox input to the owning form and restores the default on reset", () => {
    const r = render(h("form", null, h(Switch, { name: "notifications", defaultChecked: false })));
    const form = r.get<HTMLFormElement>("form");
    click(r.get("button"));
    expect(new FormData(form).get("notifications")).toBe("on");
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(r.get("button").getAttribute("aria-checked")).toBe("false");
  });

  it("strips the default look when unstyled", () => {
    const r = render(h(Switch, { unstyled: true }, h(Switch.Thumb, { unstyled: true })));
    const styles = css(r.root);
    expect(styles["background-color"]).toBe("transparent");
    expect(styles.width).toBeUndefined();
    expect(css(thumb(r))["background-color"]).toBeUndefined();
  });
});
