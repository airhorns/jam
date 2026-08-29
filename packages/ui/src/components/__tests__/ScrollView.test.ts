// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { ScrollView } from "../ScrollView";
import { Text } from "../Text";

beforeEach(() => {
  setupDefaultUI();
});

describe("ScrollView", () => {
  it("scrolls vertically by default", () => {
    const r = render(h(ScrollView, { height: 100 }, h(Text, null, "content")));
    expect(r.root.classList.contains("is_ScrollView")).toBe(true);
    expect(css(r.root)).toMatchObject({
      "flex-direction": "column",
      "overflow-x": "hidden",
      "overflow-y": "auto",
      height: "100px",
    });
    expect(r.root.textContent).toBe("content");
  });

  it("horizontal scrolls the other axis and lays out a row", () => {
    const r = render(h(ScrollView, { horizontal: true }));
    expect(css(r.root)).toMatchObject({
      "flex-direction": "row",
      "overflow-x": "auto",
      "overflow-y": "hidden",
    });
  });

  it("hides the scrollbar when asked", () => {
    expect(css(render(h(ScrollView, { showsScrollIndicator: false })).root)["scrollbar-width"]).toBe("none");
    expect(css(render(h(ScrollView, null)).root)["scrollbar-width"]).toBeUndefined();
  });

  it("unstyled drops the overflow defaults", () => {
    const r = render(h(ScrollView, { unstyled: true }));
    expect(css(r.root)["overflow-y"]).toBeUndefined();
  });
});
