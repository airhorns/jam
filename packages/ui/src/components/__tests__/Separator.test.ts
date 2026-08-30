// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Separator } from "../Separator";

beforeEach(() => {
  setupDefaultUI();
});

describe("Separator", () => {
  it("draws a themed one-pixel bottom border", () => {
    const r = render(h(Separator, null));
    expect(r.root.classList.contains("is_Separator")).toBe(true);
    expect(css(r.root)).toMatchObject({
      "border-color": "var(--borderColor)",
      "border-style": "solid",
      "border-bottom-width": "1px",
      "border-top-width": "0px",
      "border-left-width": "0px",
      "border-right-width": "0px",
      "flex-shrink": "0",
      "align-self": "stretch",
    });
    // A `border-width` shorthand here would beat or lose to the bottom-width
    // longhand by stylesheet order, so there must not be one.
    expect(css(r.root)["border-width"]).toBeUndefined();
  });

  it("has no height or margin of its own", () => {
    const r = render(h(Separator, null));
    expect(css(r.root).height).toBe("0px");
    expect(css(r.root).margin).toBe("0px");
  });

  it("vertical draws a right border and stretches instead", () => {
    const r = render(h(Separator, { vertical: true }));
    expect(css(r.root)).toMatchObject({
      "border-right-width": "1px",
      "border-bottom-width": "0px",
      height: "initial",
      "align-self": "stretch",
    });
    expect(css(r.root).width).toBe("0px");
  });

  it("takes an explicit color", () => {
    const r = render(h(Separator, { borderColor: "$blue9" }));
    expect(css(r.root)["border-color"]).toBe("var(--blue9)");
  });

  it("unstyled drops the border", () => {
    const r = render(h(Separator, { unstyled: true }));
    expect(css(r.root)["border-bottom-width"]).toBeUndefined();
  });
});
