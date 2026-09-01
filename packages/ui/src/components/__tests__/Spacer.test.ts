// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Spacer } from "../Spacer";

beforeEach(() => {
  setupDefaultUI();
});

describe("Spacer", () => {
  it("is a square of the default space token", () => {
    const r = render(h(Spacer, null));
    expect(r.root.classList.contains("is_Spacer")).toBe(true);
    expect(css(r.root)).toMatchObject({
      width: "18px",
      height: "18px",
      "min-width": "18px",
      "min-height": "18px",
      "pointer-events": "none",
    });
  });

  it("sizes from a space token or a number", () => {
    expect(css(render(h(Spacer, { size: "$6" })).root).width).toBe("32px");
    expect(css(render(h(Spacer, { size: "2" })).root).width).toBe("7px");
    expect(css(render(h(Spacer, { size: 40 })).root).width).toBe("40px");
  });

  it("collapses the cross axis with direction", () => {
    const horizontal = render(h(Spacer, { direction: "horizontal", size: "$4" }));
    expect(css(horizontal.root).width).toBe("18px");
    expect(css(horizontal.root).height).toBe("0px");
    const vertical = render(h(Spacer, { direction: "vertical", size: "$4" }));
    expect(css(vertical.root).height).toBe("18px");
    expect(css(vertical.root).width).toBe("0px");
    expect(css(render(h(Spacer, { direction: "both", size: "$4" })).root)).toMatchObject({ width: "18px", height: "18px" });
  });

  it("grows to fill with flex", () => {
    expect(css(render(h(Spacer, { flex: true })).root)["flex-grow"]).toBe("1");
    expect(css(render(h(Spacer, { flex: 1 })).root)["flex-grow"]).toBe("1");
    expect(css(render(h(Spacer, { flex: 2 })).root)["flex-grow"]).toBe("2");
    expect(css(render(h(Spacer, { flex: 2 })).root)["flex-shrink"]).toBe("1");
    expect(css(render(h(Spacer, { flex: 0 })).root)).toMatchObject({ "flex-grow": "0", "flex-shrink": "0" });
  });
});
