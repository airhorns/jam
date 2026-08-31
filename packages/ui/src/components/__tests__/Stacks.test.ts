// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, injectedRules, setupDefaultUI } from "../../testing";
import { Stack, ThemeableStack, XStack, YStack, ZStack } from "../Stacks";

beforeEach(() => {
  setupDefaultUI();
});

describe("Stack", () => {
  it("renders a column flexbox div with the view reset", () => {
    const r = render(h(Stack, null));
    expect(r.root.tagName).toBe("DIV");
    expect(r.root.classList.contains("is_Stack")).toBe(true);
    expect(css(r.root)).toMatchObject({
      display: "flex",
      "flex-direction": "column",
      "align-items": "stretch",
      "box-sizing": "border-box",
      "flex-basis": "auto",
      "flex-shrink": "0",
      "min-width": "0",
      "min-height": "0",
    });
  });

  it("a border needs its style, like any other web element", () => {
    const r = render(h(YStack, { borderWidth: 1, borderStyle: "solid", borderColor: "$borderColor" }));
    expect(css(r.root)).toMatchObject({ "border-width": "1px", "border-style": "solid" });
  });

  it("XStack is a row and YStack a column", () => {
    const x = render(h(XStack, null));
    expect(x.root.classList.contains("is_XStack")).toBe(true);
    expect(css(x.root)["flex-direction"]).toBe("row");
    const y = render(h(YStack, null));
    expect(css(y.root)["flex-direction"]).toBe("column");
  });

  it("resolves token style props", () => {
    const r = render(h(YStack, { padding: "$4", borderRadius: "$4", backgroundColor: "$background" }));
    expect(css(r.root)).toMatchObject({
      padding: "18px",
      "border-radius": "9px",
      "background-color": "var(--background)",
    });
  });

  it("fullscreen pins to its parent", () => {
    const r = render(h(YStack, { fullscreen: true }));
    expect(css(r.root)).toMatchObject({ position: "absolute", top: "0px", left: "0px", right: "0px", bottom: "0px" });
  });

  it("bordered, transparent, chromeless and circular", () => {
    const bordered = render(h(YStack, { bordered: true }));
    expect(css(bordered.root)).toMatchObject({ "border-width": "1px", "border-style": "solid", "border-color": "var(--borderColor)" });
    const thick = render(h(YStack, { bordered: 2 }));
    expect(css(thick.root)["border-width"]).toBe("2px");
    const transparent = render(h(YStack, { transparent: true }));
    expect(css(transparent.root)["background-color"]).toBe("transparent");
    const chromeless = render(h(YStack, { chromeless: true }));
    expect(css(chromeless.root)).toMatchObject({ "background-color": "transparent", "border-color": "transparent" });
    const circular = render(h(YStack, { circular: true }));
    expect(css(circular.root)["border-radius"]).toBe("100000px");
  });

  it("elevation and elevate render a themed shadow", () => {
    const r = render(h(YStack, { elevation: "$4" }));
    expect(css(r.root)["box-shadow"]).toBe("0px 12px 24px var(--shadowColor)");
    const elevated = render(h(YStack, { elevate: true, size: "$4" }));
    expect(css(elevated.root)["box-shadow"]).toContain("var(--shadowColor)");
  });
});

describe("ThemeableStack", () => {
  it("adds the themed surface variants", () => {
    const r = render(h(ThemeableStack, { backgrounded: true, radiused: true, padded: true }));
    expect(css(r.root)).toMatchObject({
      "background-color": "var(--background)",
      "border-radius": "9px",
      padding: "18px",
    });
  });

  it("hoverTheme, pressTheme and focusTheme move the surface colors", () => {
    const r = render(h(ThemeableStack, { hoverTheme: true, pressTheme: true, focusTheme: true }));
    expect(css(r.root, ":hover")).toMatchObject({ "background-color": "var(--backgroundHover)", "border-color": "var(--borderColorHover)" });
    expect(css(r.root, ":active")["background-color"]).toBe("var(--backgroundPress)");
    expect(css(r.root, ":focus")["background-color"]).toBe("var(--backgroundFocus)");
    expect(css(r.root).cursor).toBe("pointer");
  });
});

describe("ZStack", () => {
  it("stacks each child in an absolutely positioned layer", () => {
    const r = render(h(ZStack, { width: 100, height: 100 }, h(YStack, { backgroundColor: "$background" }), h(YStack, null)));
    expect(css(r.root).position).toBe("relative");
    const layers = r.all(".is_ZStackFill");
    expect(layers).toHaveLength(2);
    expect(css(layers[0])).toMatchObject({ position: "absolute", top: "0px", left: "0px", "pointer-events": "none" });
    expect(layers[0].firstElementChild?.classList.contains("is_YStack")).toBe(true);
  });

  it("re-enables pointer events on the layer contents", () => {
    render(h(ZStack, null, h(YStack, null)));
    expect(injectedRules().some((rule) => rule.includes(".is_ZStackFill.is_ZStackFill > *"))).toBe(true);
  });

  it("ignores null children", () => {
    const r = render(h(ZStack, null, null, h(YStack, null), false));
    expect(r.all(".is_ZStackFill")).toHaveLength(1);
    const empty = render(h(ZStack, { width: 10 }));
    expect(empty.all(".is_ZStackFill")).toHaveLength(0);
    expect(css(empty.root).width).toBe("10px");
  });
});
