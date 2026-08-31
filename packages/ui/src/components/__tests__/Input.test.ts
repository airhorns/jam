// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, type as typeInto, setupDefaultUI } from "../../testing";
import { Input, TextArea } from "../Input";

beforeEach(() => {
  setupDefaultUI();
});

describe("Input", () => {
  it("renders a themed input sized from the size scale", () => {
    const r = render(h(Input, { placeholder: "Email" }));
    expect(r.root.tagName).toBe("INPUT");
    expect(r.root.classList.contains("is_Input")).toBe(true);
    expect(r.root.getAttribute("placeholder")).toBe("Email");
    expect(css(r.root)).toMatchObject({
      height: "44px",
      "border-radius": "9px",
      "padding-left": "16px",
      "font-size": "15px",
      "border-width": "1px",
      "border-style": "solid",
      "border-color": "var(--borderColor)",
      "background-color": "var(--background)",
      color: "var(--color)",
    });
  });

  it("uses its own component theme", () => {
    const r = render(h(Input, null));
    expect(r.root.className).toContain("t_light_Input");
  });

  it("size changes height, radius, padding and font together", () => {
    expect(css(render(h(Input, { size: "$2" })).root)).toMatchObject({
      height: "28px",
      "border-radius": "5px",
      "padding-left": "4px",
      "font-size": "13px",
    });
    expect(css(render(h(Input, { size: "6" })).root).height).toBe("64px");
  });

  it("styles the placeholder, hover and focus states", () => {
    const r = render(h(Input, null));
    expect(css(r.root, "::placeholder").color).toBe("var(--placeholderColor)");
    expect(css(r.root, ":hover")["border-color"]).toBe("var(--borderColorHover)");
    expect(css(r.root, ":focus")).toMatchObject({
      "border-color": "var(--borderColorFocus)",
      "outline-color": "var(--outlineColor)",
      "outline-width": "2px",
    });
  });

  it("forwards value and disabled to the element", () => {
    const r = render(h(Input, { value: "hello", disabled: true }));
    const input = r.root as HTMLInputElement;
    expect(input.value).toBe("hello");
    expect(input.disabled).toBe(true);
    expect(css(r.root)).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
  });

  it("onChangeText receives the value and onInput still fires", () => {
    const seen: string[] = [];
    let events = 0;
    const r = render(h(Input, { onChangeText: (text: string) => seen.push(text), onInput: () => events++ }));
    typeInto(r.root as HTMLInputElement, "abc");
    expect(seen).toEqual(["abc"]);
    expect(events).toBe(1);
  });

  it("unstyled resets the browser chrome", () => {
    const r = render(h(Input, { unstyled: true }));
    expect(css(r.root)).toMatchObject({ "border-width": "0px", "background-color": "transparent" });
    expect(css(r.root).height).toBeUndefined();
  });
});

describe("TextArea", () => {
  it("renders a textarea with room for its rows", () => {
    const r = render(h(TextArea, { placeholder: "Message" }));
    expect(r.root.tagName).toBe("TEXTAREA");
    expect(r.root.getAttribute("rows")).toBe("3");
    expect(css(r.root)).toMatchObject({
      height: "auto",
      "min-height": "69px",
      "padding-left": "16px",
      "padding-top": "13px",
      "white-space": "pre-wrap",
      "font-size": "15px",
    });
  });

  it("rows sets the minimum height", () => {
    expect(css(render(h(TextArea, { rows: 5 })).root)["min-height"]).toBe("115px");
  });

  it("an explicitly undefined rows keeps the three-row minimum", () => {
    expect(css(render(h(TextArea, { rows: undefined })).root)["min-height"]).toBe("69px");
  });

  it("has no minimum height when the font has no line height for its size", () => {
    const r = render(h(TextArea, { size: "$0.5" }));
    expect(css(r.root)["min-height"]).toBeUndefined();
    expect(css(r.root)["font-size"]).toBeUndefined();
  });

  it("keeps the Input styling and its own theme", () => {
    const r = render(h(TextArea, { size: "$2" }));
    expect(css(r.root)).toMatchObject({ "border-color": "var(--borderColor)", "font-size": "13px" });
    expect(r.root.className).toContain("t_light_TextArea");
  });

  it("onChangeText works too", () => {
    const seen: string[] = [];
    const r = render(h(TextArea, { onChangeText: (text: string) => seen.push(text) }));
    typeInto(r.root as HTMLTextAreaElement, "hi");
    expect(seen).toEqual(["hi"]);
  });
});
