// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { atomicClassName, injectAtomic, injectRule, stylesToCSS, clearInjectedStyles } from "../css";
import { injectedRules } from "../testing";

beforeEach(() => {
  clearInjectedStyles();
});

describe("atomicClassName", () => {
  it("is deterministic for the same declaration", () => {
    expect(atomicClassName("padding", "10px")).toBe(atomicClassName("padding", "10px"));
  });

  it("differs for different values, pseudo selectors and media", () => {
    const base = atomicClassName("padding", "10px");
    expect(atomicClassName("padding", "20px")).not.toBe(base);
    expect(atomicClassName("padding", "10px", { pseudo: ":hover" })).not.toBe(base);
    expect(atomicClassName("padding", "10px", { media: "(min-width: 800px)" })).not.toBe(base);
  });

  it("abbreviates the property and marks the context", () => {
    expect(atomicClassName("border-top-left-radius", "4px")).toMatch(/^_bortoplefrad-[0-9a-z]+$/);
    expect(atomicClassName("color", "red", { pseudo: ":hover" })).toMatch(/^_col-hover-[0-9a-z]+$/);
    expect(atomicClassName("color", "red", { pseudo: "::placeholder" })).toMatch(/^_col-placeholder-/);
    expect(atomicClassName("color", "red", { media: "(min-width: 1px)" })).toMatch(/^_col-m-/);
  });
});

describe("injectAtomic", () => {
  it("inserts one rule per declaration and dedupes", () => {
    const a = injectAtomic("padding", "10px");
    const b = injectAtomic("padding", "10px");
    expect(a).toBe(b);
    const rules = injectedRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain(`.${a}`);
    expect(rules[0]).toContain("padding: 10px");
  });

  it("emits pseudo rules with the selector suffix", () => {
    const cls = injectAtomic("color", "red", { pseudo: ":hover" });
    expect(injectedRules()[0]).toContain(`.${cls}:hover`);
  });

  it("makes :disabled rules also match aria-disabled", () => {
    const cls = injectAtomic("opacity", "0.5", { pseudo: ":disabled" });
    const rule = injectedRules()[0];
    expect(rule).toContain(`.${cls}:disabled`);
    expect(rule).toContain(`.${cls}[aria-disabled="true"]`);
  });

  it("wraps media rules and boosts specificity by precedence", () => {
    const low = injectAtomic("padding", "1px", { media: "(min-width: 800px)", mediaPrecedence: 0 });
    const high = injectAtomic("padding", "2px", { media: "(min-width: 1000px)", mediaPrecedence: 3 });
    const rules = injectedRules();
    const lowRule = rules.find((r) => r.includes(low))!;
    const highRule = rules.find((r) => r.includes(high))!;
    expect(lowRule.startsWith("@media")).toBe(true);
    expect(lowRule).toContain(`:root:root .${low}`);
    expect(highRule).toContain(`:root:root:root:root:root .${high}`);
  });
});

describe("injectRule", () => {
  it("inserts arbitrary rules once per key", () => {
    injectRule("kf", "@keyframes spin { to { transform: rotate(360deg) } }");
    injectRule("kf", "@keyframes spin { to { transform: rotate(360deg) } }");
    expect(injectedRules()).toHaveLength(1);
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

  it("composes transform from transform props", () => {
    const result = stylesToCSS({ x: 10, y: -4, scale: 1.5, rotate: "45deg" });
    expect(result.transform).toBe("translateX(10px) translateY(-4px) scale(1.5) rotate(45deg)");
  });

  it("composes box-shadow from shadow props", () => {
    const result = stylesToCSS({ shadowColor: "rgba(0,0,0,0.2)", shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 });
    expect(result["box-shadow"]).toBe("0px 4px 8px rgba(0,0,0,0.2)");
  });

  it("applies shadowOpacity via color-mix for concrete colors", () => {
    const result = stylesToCSS({ shadowColor: "black", shadowOpacity: 0.5, shadowRadius: 2 });
    expect(result["box-shadow"]).toContain("color-mix");
  });

  it("prefixes -webkit props", () => {
    const result = stylesToCSS({ WebkitLineClamp: 2 });
    expect(result["-webkit-line-clamp"]).toBe("2");
  });
});
