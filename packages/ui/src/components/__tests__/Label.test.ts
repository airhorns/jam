// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Label } from "../Label";
import { Input } from "../Input";
import { YStack } from "../Stacks";

beforeEach(() => {
  setupDefaultUI();
});

describe("Label", () => {
  it("renders a label element with the theme's text color", () => {
    const r = render(h(Label, null, "Email"));
    expect(r.root.tagName).toBe("LABEL");
    expect(r.root.classList.contains("is_Label")).toBe(true);
    expect(r.root.textContent).toBe("Email");
    expect(css(r.root)).toMatchObject({
      color: "var(--color)",
      display: "flex",
      "align-items": "center",
      "user-select": "none",
      cursor: "default",
      "background-color": "transparent",
    });
  });

  it("htmlFor becomes the for attribute", () => {
    const r = render(h(YStack, null, h(Label, { htmlFor: "email" }, "Email"), h(Input, { id: "email" })));
    const label = r.get<HTMLLabelElement>("label");
    expect(label.getAttribute("for")).toBe("email");
    expect(label.hasAttribute("htmlFor")).toBe(false);
    expect(r.get<HTMLInputElement>("input").id).toBe("email");
  });

  it("size sets the font size and a control-height line box", () => {
    expect(css(render(h(Label, null, "x")).root)).toMatchObject({ "font-size": "15px", "line-height": "44px" });
    expect(css(render(h(Label, { size: "$2" }, "x")).root)).toMatchObject({ "font-size": "13px", "line-height": "28px" });
    expect(css(render(h(Label, { size: "1" }, "x")).root)["font-size"]).toBe("12px");
  });

  it("presses to the theme's press color", () => {
    expect(css(render(h(Label, null, "x")).root, ":active").color).toBe("var(--colorPress)");
  });

  it("disabled dims the label", () => {
    const r = render(h(Label, { disabled: true }, "x"));
    expect(css(r.root)).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
  });

  it("unstyled drops the defaults", () => {
    const r = render(h(Label, { unstyled: true }, "x"));
    expect(css(r.root)["font-size"]).toBeUndefined();
    expect(css(r.root).color).toBeUndefined();
  });
});
