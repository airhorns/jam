// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, resetUI } from "../../testing";
import { createTokens } from "../../tokens";
import { createThemes, setTheme } from "../../themes";
import { createFont } from "../../fonts";
import { Button } from "../Button";

beforeEach(() => {
  resetUI();
});

describe("Button", () => {
  beforeEach(() => {
    createTokens({
      size: { "1": 20, "2": 28, "3": 36, "4": 44, true: 44, "5": 52 },
      space: { "1": 4, "2": 6, "3": 8, "4": 10, true: 10, "5": 12 },
      radius: { "1": 3, "2": 5, "3": 7, "4": 9, true: 9, "5": 10 },
    });
    createThemes({ light: { background: "#fff", backgroundHover: "#eee", backgroundPress: "#ddd", color: "#111", borderColor: "#ccc", borderColorHover: "#aaa", borderColorPress: "#999", outlineColor: "blue" } });
    setTheme("light");
    createFont("body", { family: "Inter", size: { "1": 11, "2": 12, "3": 13, "4": 14, true: 14, "5": 16 } });
  });

  it("renders a button element wrapping string children in Button.Text", () => {
    const r = render(h(Button, null, "Click me"));
    expect(r.root.tagName).toBe("BUTTON");
    expect(r.root.getAttribute("type")).toBe("button");
    expect(r.root.textContent).toBe("Click me");
    const label = r.get("span");
    expect(label.classList.contains("is_ButtonText")).toBe(true);
    expect(css(r.root)).toMatchObject({ display: "flex", height: "44px", "border-radius": "9px", "padding-left": "10px" });
    expect(css(label)["font-size"]).toBe("14px");
  });

  it("rendered as a link it keeps the button look without an underline", () => {
    const r = render(h(Button, { tag: "a", href: "/next" }, "Next"));
    expect(r.root.tagName).toBe("A");
    expect(r.root.hasAttribute("type")).toBe(false);
    expect(css(r.root)).toMatchObject({ display: "flex", cursor: "pointer", "text-decoration-line": "none" });
  });

  it("sizes the frame and label from the size token", () => {
    const r = render(h(Button, { size: "$2" }, "Small"));
    expect(css(r.root)).toMatchObject({ height: "28px", "border-radius": "5px", gap: "6px" });
    expect(css(r.get("span"))["font-size"]).toBe("12px");
    const bare = render(h(Button, { size: "5" }, "Large"));
    expect(css(bare.root).height).toBe("52px");
  });

  it("applies variant styles", () => {
    const outlined = render(h(Button, { variant: "outlined" }, "Outlined"));
    expect(css(outlined.root)).toMatchObject({ "background-color": "transparent", "border-color": "var(--borderColor)" });
    const ghost = render(h(Button, { variant: "ghost" }, "Ghost"));
    expect(css(ghost.root)).toMatchObject({ "background-color": "transparent", "border-color": "transparent" });
    expect(css(ghost.root, ":hover")["background-color"]).toBe("var(--backgroundHover)");
  });

  it("circular buttons are square with a large radius", () => {
    const r = render(h(Button, { circular: true, size: "$4" }, "+"));
    expect(css(r.root)).toMatchObject({ width: "44px", height: "44px", padding: "0px", "border-radius": "100000px" });
  });

  it("disabled buttons forward the attribute and dim", () => {
    const r = render(h(Button, { disabled: true }, "Nope"));
    expect(r.root.hasAttribute("disabled")).toBe(true);
    expect(css(r.root)).toMatchObject({ opacity: "0.5", "pointer-events": "none" });
  });

  it("renders icon and iconAfter in Button.Icon", () => {
    const r = render(h(Button, { icon: "★", iconAfter: "→" }, "Star"));
    const icons = r.all(".is_ButtonIcon");
    expect(icons).toHaveLength(2);
    expect(icons[0].textContent).toBe("★");
    expect(icons[1].textContent).toBe("→");
    expect(r.root.children[1].classList.contains("is_ButtonText")).toBe(true);
  });

  it("unstyled removes the default chrome", () => {
    const r = render(h(Button, { unstyled: true }, "Bare"));
    expect(css(r.root)["background-color"]).toBe("transparent");
    expect(css(r.root).height).toBeUndefined();
  });

  it("forwards click handlers and text props", () => {
    let clicked = 0;
    const r = render(h(Button, { onClick: () => clicked++, color: "red", fontWeight: "700" }, "Go"));
    click(r.root);
    expect(clicked).toBe(1);
    expect(css(r.get("span"))).toMatchObject({ color: "red", "font-weight": "700" });
  });

  it("has sub-components", () => {
    expect(Button.Text).toBeDefined();
    expect(Button.Icon).toBeDefined();
    expect(Button.Frame).toBeDefined();
    expect(Button.Apply).toBeDefined();
  });

  it("Button.Apply provides a size to every button beneath", () => {
    const r = render(h(Button.Apply, { value: { size: "$2" } }, h(Button, null, "A")));
    expect(css(r.get("button")).height).toBe("28px");
    expect(css(r.get("span"))["font-size"]).toBe("12px");
  });
});
