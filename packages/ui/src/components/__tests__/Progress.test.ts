// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, injectedRules, setupDefaultUI } from "../../testing";
import { Progress } from "../Progress";

beforeEach(() => {
  setupDefaultUI();
});

const bar = (props: Record<string, unknown>) => render(h(Progress, props, h(Progress.Indicator, null)));

describe("Progress", () => {
  it("renders a rounded track announced as a progressbar", () => {
    const r = bar({ value: 60 });
    expect(r.root.classList.contains("is_Progress")).toBe(true);
    expect(r.root.getAttribute("role")).toBe("progressbar");
    expect(r.root.getAttribute("aria-valuemin")).toBe("0");
    expect(r.root.getAttribute("aria-valuemax")).toBe("100");
    expect(r.root.getAttribute("aria-valuenow")).toBe("60");
    expect(r.root.getAttribute("aria-valuetext")).toBe("60%");
    expect(r.root.getAttribute("data-state")).toBe("loading");
    expect(css(r.root)).toMatchObject({
      height: "11px",
      "min-width": "220px",
      "border-radius": "100000px",
      overflow: "hidden",
      "background-color": "var(--background)",
    });
  });

  it("the indicator fills in proportion to the value", () => {
    const indicator = bar({ value: 60 }).get(".is_ProgressIndicator");
    expect(css(indicator)).toMatchObject({
      height: "100%",
      width: "200%",
      transform: "translateX(-70%)",
      "background-color": "var(--background)",
    });
    expect(indicator.className).toContain("t_light_ProgressIndicator");
  });

  it("a full bar reads as complete", () => {
    const r = bar({ value: 100 });
    expect(r.root.getAttribute("data-state")).toBe("complete");
    expect(css(r.get(".is_ProgressIndicator")).transform).toBe("translateX(-50%)");
  });

  it("clamps values outside the range", () => {
    expect(bar({ value: -20 }).root.getAttribute("aria-valuenow")).toBe("0");
    expect(bar({ value: 400 }).root.getAttribute("aria-valuenow")).toBe("100");
  });

  it("honours a custom max", () => {
    const r = bar({ value: 2, max: 4 });
    expect(r.root.getAttribute("aria-valuemax")).toBe("4");
    expect(r.root.getAttribute("aria-valuetext")).toBe("50%");
    expect(css(r.get(".is_ProgressIndicator")).transform).toBe("translateX(-75%)");
  });

  it("without a value it sweeps as indeterminate", () => {
    const r = bar({});
    expect(r.root.getAttribute("data-state")).toBe("indeterminate");
    expect(r.root.hasAttribute("aria-valuenow")).toBe(false);
    const indicator = r.get(".is_ProgressIndicator");
    expect(indicator.getAttribute("data-state")).toBe("indeterminate");
    expect(css(indicator).width).toBe("40%");
    expect(css(indicator).transform).toBe("translateX(75%)");
    expect(injectedRules().some((rule) => rule.includes("@keyframes jam-ui-progress-sweep"))).toBe(true);
    expect(
      injectedRules().some(
        (rule) => rule.includes('.is_ProgressIndicator[data-state="indeterminate"]') && rule.includes("animation"),
      ),
    ).toBe(true);
  });

  it("size scales the track height and its minimum width", () => {
    expect(css(bar({ value: 10, size: "$2" }).root)).toMatchObject({ height: "7px", "min-width": "140px" });
    expect(css(bar({ value: 10, size: "6" }).root).height).toBe("16px");
    expect(css(bar({ value: 10, size: 40 }).root)).toMatchObject({ height: "10px", "min-width": "200px" });
  });

  it("unstyled drops the track styling", () => {
    const r = render(h(Progress, { unstyled: true, value: 10 }));
    expect(css(r.root).height).toBeUndefined();
    expect(css(r.root)["border-radius"]).toBeUndefined();
  });
});
