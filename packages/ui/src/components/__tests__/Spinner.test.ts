// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, injectedRules, setupDefaultUI } from "../../testing";
import { Spinner } from "../Spinner";

beforeEach(() => {
  setupDefaultUI();
});

describe("Spinner", () => {
  it("is a round ring announced as a progressbar", () => {
    const r = render(h(Spinner, null));
    expect(r.root.classList.contains("is_Spinner")).toBe(true);
    expect(r.root.getAttribute("role")).toBe("progressbar");
    expect(r.root.getAttribute("aria-label")).toBe("Loading");
    expect(r.root.getAttribute("aria-busy")).toBe("true");
    expect(css(r.root)).toMatchObject({
      width: "20px",
      height: "20px",
      "border-width": "2px",
      "border-style": "solid",
      "border-radius": "100000px",
      "border-top-color": "var(--color)",
      "border-right-color": "var(--borderColor)",
      "border-bottom-color": "var(--borderColor)",
      "border-left-color": "var(--borderColor)",
    });
  });

  it("large is bigger with a thicker ring", () => {
    expect(css(render(h(Spinner, { size: "large" })).root)).toMatchObject({ width: "36px", "border-width": "3px" });
  });

  it("accepts a size token or a number", () => {
    expect(css(render(h(Spinner, { size: "$6" })).root)).toMatchObject({ width: "64px", "border-width": "5px" });
    expect(css(render(h(Spinner, { size: "2" })).root).width).toBe("28px");
    expect(css(render(h(Spinner, { size: 48 })).root)).toMatchObject({ width: "48px", "border-width": "4px" });
  });

  it("color tints the leading arc only", () => {
    const r = render(h(Spinner, { color: "$blue9" }));
    expect(css(r.root)["border-top-color"]).toBe("var(--blue9)");
    expect(css(r.root)["border-bottom-color"]).toBe("var(--borderColor)");
    expect(css(r.root).color).toBeUndefined();
  });

  it("spins from one injected keyframe rule", () => {
    render(h(Spinner, null));
    const rules = injectedRules();
    expect(rules.some((rule) => rule.includes("@keyframes jam-ui-spin"))).toBe(true);
    expect(rules.filter((rule) => rule.includes(".is_Spinner.is_Spinner")).length).toBe(1);
    render(h(Spinner, null));
    expect(injectedRules().filter((rule) => rule.includes("@keyframes jam-ui-spin")).length).toBe(1);
  });

  it("takes layout props like any other component", () => {
    const r = render(h(Spinner, { size: "large", margin: "$2" }));
    expect(css(r.root).margin).toBe("7px");
  });
});
