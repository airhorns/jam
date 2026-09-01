import { describe, it, expect } from "vitest";
import { formatCSSValue, stylesToCSS } from "../style-props";

describe("formatCSSValue", () => {
  it("formats numbers with px unless the property is unitless", () => {
    expect(formatCSSValue("padding", 4)).toBe("4px");
    expect(formatCSSValue("padding", 0)).toBe("0");
    expect(formatCSSValue("opacity", 0.5)).toBe("0.5");
  });

  it("passes strings through, drops null and stringifies anything else", () => {
    expect(formatCSSValue("color", "red")).toBe("red");
    expect(formatCSSValue("color", null)).toBe("");
    expect(formatCSSValue("color", undefined)).toBe("");
    expect(formatCSSValue("display", true)).toBe("true");
  });
});

describe("stylesToCSS composition", () => {
  it("skips false, empty and elevation values", () => {
    expect(stylesToCSS({ display: false, color: "", elevation: "$4", padding: 2 })).toEqual({ padding: "2px" });
  });

  it("adds units to perspective and rotations given as numbers", () => {
    expect(stylesToCSS({ perspective: 500, rotate: 45, rotateX: "10deg", skewX: 5 }).transform).toBe(
      "perspective(500px) rotate(45deg) rotateX(10deg) skewX(5deg)",
    );
  });

  it("appends composed shadows to an explicit boxShadow and defaults the color", () => {
    expect(stylesToCSS({ shadowRadius: 4 })["box-shadow"]).toBe("0px 0px 4px rgba(0,0,0,1)");
    expect(stylesToCSS({ boxShadow: "inset 0 0 1px red", shadowOffset: { height: 2 }, shadowColor: "var(--shadowColor)", shadowOpacity: 0.5 })["box-shadow"]).toBe(
      "inset 0 0 1px red, 0px 2px 0px var(--shadowColor)",
    );
  });

  it("composes text-shadow from its parts, defaulting the missing ones", () => {
    expect(stylesToCSS({ textShadowColor: "black", textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3 })["text-shadow"]).toBe("1px 2px 3px black");
    expect(stylesToCSS({ textShadowRadius: 2 })["text-shadow"]).toBe("0px 0px 2px currentColor");
    expect(stylesToCSS({ textShadowOffset: { width: 4 } })["text-shadow"]).toBe("4px 0px 0px currentColor");
  });
});
