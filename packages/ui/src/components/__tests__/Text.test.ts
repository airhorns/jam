// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { Anchor, Text, SizableText, Paragraph, Heading, H1, H2, H3, H4, H5, H6 } from "../Text";

beforeEach(() => {
  setupDefaultUI();
});

describe("Text", () => {
  it("renders an inline span with normalized text defaults", () => {
    const r = render(h(Text, null, "hello"));
    expect(r.root.tagName).toBe("SPAN");
    expect(r.root.textContent).toBe("hello");
    expect(css(r.root)).toMatchObject({ display: "inline", "white-space": "pre-wrap", margin: "0px" });
  });

  it("uses the default body font", () => {
    const r = render(h(Text, null, "hello"));
    expect(css(r.root)["font-family"]).toContain("system-ui");
  });

  it("clamps with numberOfLines and ellipsis", () => {
    const one = render(h(Text, { numberOfLines: 1 }, "x"));
    expect(css(one.root)).toMatchObject({ "text-overflow": "ellipsis", "white-space": "nowrap", overflow: "hidden" });
    const three = render(h(Text, { numberOfLines: 3 }, "x"));
    expect(css(three.root)).toMatchObject({ "-webkit-line-clamp": "3", "-webkit-box-orient": "vertical", overflow: "hidden", "white-space": "normal" });
    const ellipsis = render(h(Text, { ellipsis: true }, "x"));
    expect(css(ellipsis.root)["text-overflow"]).toBe("ellipsis");
  });

  it("text nested in text inherits the parent's wrapping so ellipsis still truncates", () => {
    const r = render(h(SizableText, { ellipsis: true }, h(Text, { fontWeight: "600" }, "Ada"), " wrote a very long message"));
    const inner = r.root.querySelector("span") as HTMLElement;
    expect(css(r.root)["white-space"]).toBe("nowrap");
    expect(css(inner)["white-space"]).toBe("inherit");
    expect(css(inner)["font-weight"]).toBe("600");
    const explicit = render(h(Text, null, h(Text, { whiteSpace: "nowrap" }, "x")));
    expect(css(explicit.root.querySelector("span") as HTMLElement)["white-space"]).toBe("nowrap");
  });

  it("resolves font tokens against the font in effect", () => {
    const r = render(h(Text, { fontFamily: "$heading", fontSize: "$9", fontWeight: "$9" }, "x"));
    expect(css(r.root)).toMatchObject({ "font-size": "30px", "font-weight": "800" });
  });
});

describe("SizableText", () => {
  it("sizes from the body font by default", () => {
    const r = render(h(SizableText, null, "x"));
    expect(css(r.root)).toMatchObject({ "font-size": "15px", "line-height": "23px", color: "var(--color)" });
  });

  it("changes every font metric with size", () => {
    const r = render(h(SizableText, { size: "$8" }, "x"));
    expect(css(r.root)).toMatchObject({ "font-size": "26px", "line-height": "38px" });
    const bare = render(h(SizableText, { size: "2" }, "x"));
    expect(css(bare.root)["font-size"]).toBe("13px");
  });

  it("unstyled drops the default size and color", () => {
    const r = render(h(SizableText, { unstyled: true }, "x"));
    expect(css(r.root)["font-size"]).toBeUndefined();
    expect(css(r.root).color).toBeUndefined();
  });
});

describe("Paragraph and headings", () => {
  it("Paragraph renders a p with normal wrapping", () => {
    const r = render(h(Paragraph, null, "text"));
    expect(r.root.tagName).toBe("P");
    expect(css(r.root)).toMatchObject({ "white-space": "normal", "font-size": "15px", "user-select": "auto" });
  });

  it("Heading renders a span with the heading role and font", () => {
    const r = render(h(Heading, null, "title"));
    expect(r.root.tagName).toBe("SPAN");
    expect(r.root.getAttribute("role")).toBe("heading");
    expect(css(r.root)).toMatchObject({ "font-size": "26px", "font-weight": "700", margin: "0px" });
  });

  it("H1-H6 render semantic tags at descending sizes", () => {
    const sizes: Array<[any, string, string]> = [
      [H1, "H1", "40px"],
      [H2, "H2", "30px"],
      [H3, "H3", "26px"],
      [H4, "H4", "22px"],
      [H5, "H5", "18px"],
      [H6, "H6", "16px"],
    ];
    for (const [Comp, tag, size] of sizes) {
      const r = render(h(Comp, null, "h"));
      expect(r.root.tagName).toBe(tag);
      expect(r.root.hasAttribute("role")).toBe(false);
      expect(css(r.root)["font-size"]).toBe(size);
    }
  });

  it("headings accept size overrides and theme colours", () => {
    const r = render(h(H1, { size: "$5", color: "$color10" }, "h"));
    expect(css(r.root)).toMatchObject({ "font-size": "16px", color: "var(--color10)" });
  });
});

describe("Anchor", () => {
  it("renders a sized link that keeps the browser underline", () => {
    const r = render(h(Anchor, { href: "/docs", target: "_blank", rel: "noreferrer" }, "Docs"));
    expect(r.root.tagName).toBe("A");
    expect(r.root.getAttribute("href")).toBe("/docs");
    expect(r.root.getAttribute("target")).toBe("_blank");
    expect(r.root.getAttribute("rel")).toBe("noreferrer");
    expect(r.root.classList.contains("is_Anchor")).toBe(true);
    expect(css(r.root)).toMatchObject({ "font-size": "15px", color: "var(--color)" });
    expect(css(r.root)["text-decoration-line"]).toBeUndefined();
  });

  it("can drop the underline like any text", () => {
    expect(css(render(h(Anchor, { href: "#", textDecorationLine: "none" }, "x")).root)["text-decoration-line"]).toBe("none");
  });
});
