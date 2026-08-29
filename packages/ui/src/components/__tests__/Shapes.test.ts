// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Circle, Square } from "../Shapes";

beforeEach(() => {
  setupDefaultUI();
});

describe("Square", () => {
  it("centres its content and takes both dimensions from a size token", () => {
    const r = render(h(Square, { size: "$6" }, "1"));
    expect(r.root.classList.contains("is_Square")).toBe(true);
    expect(css(r.root)).toMatchObject({
      width: "64px",
      height: "64px",
      "min-width": "64px",
      "min-height": "64px",
      "align-items": "center",
      "justify-content": "center",
    });
  });

  it("accepts a bare token key or a number", () => {
    expect(css(render(h(Square, { size: "2" })).root).width).toBe("28px");
    expect(css(render(h(Square, { size: 50 })).root).width).toBe("50px");
  });

  it("keeps the themeable variants", () => {
    const r = render(h(Square, { size: "$4", bordered: true, elevation: "$4", backgrounded: true }));
    expect(css(r.root)).toMatchObject({
      "border-width": "1px",
      "border-color": "var(--borderColor)",
      "background-color": "var(--background)",
      "box-shadow": "0px 12px 24px var(--shadowColor)",
    });
  });
});

describe("Circle", () => {
  it("is a fully rounded Square", () => {
    const r = render(h(Circle, { size: "$5" }));
    expect(r.root.classList.contains("is_Circle")).toBe(true);
    expect(css(r.root)).toMatchObject({ width: "52px", height: "52px", "border-radius": "100000px" });
  });

  it("can still be given a radius", () => {
    const r = render(h(Circle, { size: "$5", borderRadius: "$4" }));
    expect(css(r.root)["border-radius"]).toBe("9px");
  });
});
