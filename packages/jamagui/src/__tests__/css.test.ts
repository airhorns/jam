import { describe, it, expect, beforeEach } from "vitest";
import { generateClassName, stylesToCSS, clearInjectedStyles } from "../css";

beforeEach(() => {
  clearInjectedStyles();
});

describe("generateClassName", () => {
  it("produces deterministic class names", () => {
    const a = generateClassName({ padding: "10px" });
    const b = generateClassName({ padding: "10px" });
    expect(a).toBe(b);
  });

  it("produces different names for different styles", () => {
    const a = generateClassName({ padding: "10px" });
    const b = generateClassName({ padding: "20px" });
    expect(a).not.toBe(b);
  });

  it("produces the same name regardless of property order", () => {
    const a = generateClassName({ padding: "10px", margin: "5px" });
    const b = generateClassName({ margin: "5px", padding: "10px" });
    expect(a).toBe(b);
  });

  it("starts with _jui_ prefix", () => {
    const name = generateClassName({ color: "red" });
    expect(name).toMatch(/^_jui_/);
  });
});

describe("stylesToCSS", () => {
  it("converts camelCase to kebab-case", () => {
    const result = stylesToCSS({ backgroundColor: "red" });
    expect(result["background-color"]).toBe("red");
  });

  it("adds px units to numeric values", () => {
    const result = stylesToCSS({ padding: 10, margin: 20 });
    expect(result.padding).toBe("10px");
    expect(result.margin).toBe("20px");
  });

  it("keeps unitless properties without px", () => {
    const result = stylesToCSS({ flex: 1, opacity: 0.5, zIndex: 10, fontWeight: 600 });
    expect(result.flex).toBe("1");
    expect(result.opacity).toBe("0.5");
    expect(result["z-index"]).toBe("10");
    expect(result["font-weight"]).toBe("600");
  });

  it("handles zero values", () => {
    const result = stylesToCSS({ padding: 0 });
    expect(result.padding).toBe("0");
  });

  it("passes through string values", () => {
    const result = stylesToCSS({ display: "flex", color: "#fff" });
    expect(result.display).toBe("flex");
    expect(result.color).toBe("#fff");
  });

  it("skips null and undefined values", () => {
    const result = stylesToCSS({ padding: null, margin: undefined, color: "red" } as any);
    expect("padding" in result).toBe(false);
    expect("margin" in result).toBe(false);
    expect(result.color).toBe("red");
  });
});
