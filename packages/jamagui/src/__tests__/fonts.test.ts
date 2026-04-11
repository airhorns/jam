import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { createFont, getFontSized } from "../fonts";

beforeEach(() => {
  db.clear();
});

describe("createFont", () => {
  it("asserts font family and size scale", () => {
    createFont("body", {
      family: "Inter, sans-serif",
      size: { "1": 12, "2": 14, "3": 16 },
    });

    const f = getFontSized("body", "2");
    expect(f.fontFamily).toBe("Inter, sans-serif");
    expect(f.fontSize).toBe(14);
  });

  it("auto-fills lineHeight from nearest defined key", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16, "4": 18 },
      lineHeight: { "1": 18, "4": 28 },
    });

    // Key 1: defined
    expect(getFontSized("body", "1").lineHeight).toBe(18);
    // Key 2: nearest to 1 (distance 1) and 4 (distance 2), picks 1
    expect(getFontSized("body", "2").lineHeight).toBe(18);
    // Key 3: equidistant from 1 (dist 2) and 4 (dist 1), picks 4
    expect(getFontSized("body", "3").lineHeight).toBe(28);
    // Key 4: defined
    expect(getFontSized("body", "4").lineHeight).toBe(28);
  });

  it("auto-fills weight from nearest defined key", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16 },
      weight: { "1": "300", "3": "600" },
    });

    expect(getFontSized("body", "1").fontWeight).toBe("300");
    expect(getFontSized("body", "2").fontWeight).toBe("300");
    expect(getFontSized("body", "3").fontWeight).toBe("600");
  });

  it("auto-fills letterSpacing", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16 },
      letterSpacing: { "1": 0.5 },
    });

    expect(getFontSized("body", "1").letterSpacing).toBe(0.5);
    expect(getFontSized("body", "2").letterSpacing).toBe(0.5);
    expect(getFontSized("body", "3").letterSpacing).toBe(0.5);
  });

  it("returns defaults for undefined font", () => {
    const f = getFontSized("nonexistent", "1");
    expect(f.fontFamily).toBe("");
    expect(f.fontSize).toBe(14);
    expect(f.lineHeight).toBeUndefined();
    expect(f.fontWeight).toBeUndefined();
    expect(f.letterSpacing).toBeUndefined();
  });

  it("handles empty optional properties", () => {
    createFont("minimal", {
      family: "System",
      size: { "1": 12, "2": 14 },
    });

    const f = getFontSized("minimal", "1");
    expect(f.fontFamily).toBe("System");
    expect(f.fontSize).toBe(12);
    expect(f.lineHeight).toBeUndefined();
    expect(f.fontWeight).toBeUndefined();
    expect(f.letterSpacing).toBeUndefined();
  });
});
