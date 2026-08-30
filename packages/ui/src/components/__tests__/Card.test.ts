// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Card } from "../Card";
import { H4 } from "../Text";

beforeEach(() => {
  setupDefaultUI();
});

describe("Card", () => {
  it("is a themed surface with the default radius", () => {
    const r = render(h(Card, null, "body"));
    expect(r.root.classList.contains("is_Card")).toBe(true);
    expect(css(r.root)).toMatchObject({
      "background-color": "var(--background)",
      "border-radius": "9px",
      position: "relative",
      overflow: "hidden",
    });
  });

  it("size picks the radius token", () => {
    expect(css(render(h(Card, { size: "$6" })).root)["border-radius"]).toBe("16px");
    expect(css(render(h(Card, { size: 4 })).root)["border-radius"]).toBe("4px");
  });

  it("elevate and bordered lift the card off the page", () => {
    const r = render(h(Card, { elevate: true, bordered: true }));
    expect(css(r.root)["box-shadow"]).toBe("0px 12px 24px var(--shadowColor)");
    expect(css(r.root)).toMatchObject({ "border-width": "1px", "border-color": "var(--borderColor)" });
  });

  it("hoverTheme and pressTheme move the surface", () => {
    const r = render(h(Card, { hoverTheme: true, pressTheme: true }));
    expect(css(r.root, ":hover")["background-color"]).toBe("var(--backgroundHover)");
    expect(css(r.root, ":active")["background-color"]).toBe("var(--backgroundPress)");
  });

  it("padded pads the whole card", () => {
    expect(css(render(h(Card, { padded: true })).root).padding).toBe("18px");
  });

  it("Header pads from the card's size through context", () => {
    const r = render(h(Card, null, h(Card.Header, null, h(H4, null, "Title"))));
    const header = r.get(".is_CardHeader");
    expect(css(header)).toMatchObject({ padding: "18px", "z-index": "10" });
    const big = render(h(Card, { size: "$6" }, h(Card.Header, null, "Title")));
    expect(css(big.get(".is_CardHeader")).padding).toBe("32px");
  });

  it("Footer is a padded row pinned to the bottom", () => {
    const r = render(h(Card, null, h(Card.Footer, null, "actions")));
    expect(css(r.get(".is_CardFooter"))).toMatchObject({
      "flex-direction": "row",
      "align-items": "center",
      "margin-top": "auto",
      "z-index": "5",
      padding: "18px",
    });
  });

  it("Background fills the card and inherits its radius", () => {
    const r = render(h(Card, null, h(Card.Background, null)));
    expect(css(r.get(".is_CardBackground"))).toMatchObject({
      position: "absolute",
      top: "0px",
      "z-index": "0",
      "border-radius": "inherit",
      "pointer-events": "none",
    });
  });

  it("unstyled drops the surface", () => {
    const r = render(h(Card, { unstyled: true }));
    expect(css(r.root)["background-color"]).toBeUndefined();
    expect(css(r.root)["border-radius"]).toBeUndefined();
  });
});
