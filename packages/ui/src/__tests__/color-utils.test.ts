import { describe, it, expect } from "vitest";
import { parseColor, rgbaToString, opacify, interpolateColor } from "../color-utils";

describe("parseColor", () => {
  it("parses named colors", () => {
    expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor(" Black ")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("parses 3, 4, 6 and 8 digit hex", () => {
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#f008")).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
    expect(parseColor("#0090ff")).toEqual({ r: 0, g: 144, b: 255, a: 1 });
    expect(parseColor("#0090ff80")).toEqual({ r: 0, g: 144, b: 255, a: 128 / 255 });
  });

  it("rejects malformed hex", () => {
    expect(parseColor("#12345")).toBeNull();
    expect(parseColor("#gggggg")).toBeNull();
  });

  it("parses rgb() and rgba() with comma, space and slash separators, numbers and percentages", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(10 20 30 / 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("rgb(100%, 50%, 0%)")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 40%)")).toEqual({ r: 0, g: 0, b: 0, a: 0.4 });
  });

  it("parses hsl() across every hue sector and grey", () => {
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("hsl(120, 100%, 25%)")).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    expect(parseColor("hsl(240, 100%, 50%)")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor("hsl(300, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 255, a: 1 });
    expect(parseColor("hsl(60, 100%, 50%)")).toEqual({ r: 255, g: 255, b: 0, a: 1 });
    expect(parseColor("hsla(-180, 50%, 60%, 0.25)")).toEqual({ r: 102, g: 204, b: 204, a: 0.25 });
    expect(parseColor("hsl(90, 0%, 40%)")).toEqual({ r: 102, g: 102, b: 102, a: 1 });
  });

  it("returns null for anything that is not a literal color", () => {
    expect(parseColor("var(--background)")).toBeNull();
    expect(parseColor("rgb(1, 2)")).toBeNull();
    expect(parseColor("linear-gradient(red, blue)")).toBeNull();
  });
});

describe("rgbaToString", () => {
  it("rounds alpha to three decimals", () => {
    expect(rgbaToString({ r: 1, g: 2, b: 3, a: 1 })).toBe("rgba(1,2,3,1)");
    expect(rgbaToString({ r: 1, g: 2, b: 3, a: 0.33333 })).toBe("rgba(1,2,3,0.333)");
  });
});

describe("opacify", () => {
  it("replaces the alpha of any parseable color", () => {
    expect(opacify("#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)");
    expect(opacify("rgba(1,2,3,0.9)", 0)).toBe("rgba(1,2,3,0)");
  });

  it("leaves unparseable colors alone", () => {
    expect(opacify("var(--color)", 0.5)).toBe("var(--color)");
  });
});

describe("interpolateColor", () => {
  it("mixes channels and alpha linearly", () => {
    expect(interpolateColor("#000000", "#ffffff", 0)).toBe("rgba(0,0,0,1)");
    expect(interpolateColor("#000000", "#ffffff", 1)).toBe("rgba(255,255,255,1)");
    expect(interpolateColor("rgba(0,0,0,0)", "rgba(100,200,50,1)", 0.5)).toBe("rgba(50,100,25,0.5)");
  });

  it("returns `from` when either end cannot be parsed", () => {
    expect(interpolateColor("var(--a)", "#fff", 0.5)).toBe("var(--a)");
    expect(interpolateColor("#000", "var(--b)", 0.5)).toBe("#000");
  });
});
