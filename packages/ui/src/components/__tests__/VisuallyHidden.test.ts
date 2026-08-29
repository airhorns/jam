// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { VisuallyHidden } from "../VisuallyHidden";

beforeEach(() => {
  setupDefaultUI();
});

describe("VisuallyHidden", () => {
  it("keeps its text in the DOM but off the screen", () => {
    const r = render(h(VisuallyHidden, null, "Close"));
    expect(r.root.textContent).toBe("Close");
    const style = css(r.root);
    expect(style).toMatchObject({
      position: "absolute",
      width: "1px",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      "white-space": "nowrap",
      "pointer-events": "none",
      "z-index": "-10000",
    });
    expect(Number(style.opacity)).toBeLessThan(0.001);
  });

  it("preserveDimensions keeps the layout box", () => {
    const r = render(h(VisuallyHidden, { preserveDimensions: true }, "x"));
    expect(css(r.root)).toMatchObject({ position: "relative", width: "auto", height: "auto" });
  });

  it("visible shows the content again", () => {
    const r = render(h(VisuallyHidden, { visible: true }, "x"));
    expect(css(r.root)).toMatchObject({
      position: "relative",
      width: "auto",
      opacity: "1",
      "pointer-events": "auto",
      "z-index": "1",
    });
  });

  it("takes extra props like any text component", () => {
    const r = render(h(VisuallyHidden, { id: "hint", role: "status" }, "Saved"));
    expect(r.root.getAttribute("id")).toBe("hint");
    expect(r.root.getAttribute("role")).toBe("status");
  });
});
