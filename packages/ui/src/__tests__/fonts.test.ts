import { describe, it, expect, beforeEach } from "vitest";
import { createFont, getFont, getFontStyles, getFontFamily, getFontValue, fillSizes, hasFont } from "../fonts";
import { resetUI } from "../testing";

beforeEach(() => {
  resetUI();
});

describe("createFont", () => {
  it("asserts font family and size scale", () => {
    createFont("body", {
      family: "Inter, sans-serif",
      size: { "1": 12, "2": 14, "3": 16 },
    });

    const f = getFontStyles("body", "2");
    expect(f.fontFamily).toBe("Inter, sans-serif");
    expect(f.fontSize).toBe(14);
    expect(hasFont("body")).toBe(true);
    expect(getFontFamily("body")).toBe("Inter, sans-serif");
  });

  it("fills lineHeight forward from the previous defined key", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16, "4": 18 },
      lineHeight: { "1": 18, "4": 28 },
    });

    expect(getFontStyles("body", "1").lineHeight).toBe(18);
    expect(getFontStyles("body", "2").lineHeight).toBe(18);
    expect(getFontStyles("body", "3").lineHeight).toBe(18);
    expect(getFontStyles("body", "4").lineHeight).toBe(28);
  });

  it("fills weight forward and backfills keys before the first defined one", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16, "4": 18 },
      weight: { "2": "300", "3": "600" },
    });

    expect(getFontStyles("body", "1").fontWeight).toBe("300");
    expect(getFontStyles("body", "2").fontWeight).toBe("300");
    expect(getFontStyles("body", "3").fontWeight).toBe("600");
    expect(getFontStyles("body", "4").fontWeight).toBe("600");
  });

  it("fills letterSpacing across every size key", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16 },
      letterSpacing: { "1": 0.5 },
    });

    expect(getFontStyles("body", "1").letterSpacing).toBe(0.5);
    expect(getFontStyles("body", "2").letterSpacing).toBe(0.5);
    expect(getFontStyles("body", "3").letterSpacing).toBe(0.5);
  });

  it("accepts $-prefixed size keys", () => {
    createFont("body", { family: "Inter", size: { "1": 12, "2": 14 } });
    expect(getFontValue("body", "size", "$2")).toBe(14);
    expect(getFontStyles("body", "$1").fontSize).toBe(12);
  });

  it("returns defaults for undefined font", () => {
    const f = getFontStyles("nonexistent", "1");
    expect(f.fontFamily).toBe("");
    expect(f.fontSize).toBe(14);
    expect(f.lineHeight).toBeUndefined();
    expect(f.fontWeight).toBeUndefined();
    expect(f.letterSpacing).toBeUndefined();
    expect(getFont("nonexistent")).toBeUndefined();
  });

  it("handles empty optional properties", () => {
    createFont("minimal", {
      family: "System",
      size: { "1": 12, "2": 14 },
    });

    const f = getFontStyles("minimal", "1");
    expect(f.fontFamily).toBe("System");
    expect(f.fontSize).toBe(12);
    expect(f.lineHeight).toBeUndefined();
    expect(f.fontWeight).toBeUndefined();
    expect(f.letterSpacing).toBeUndefined();
  });
});

describe("getFont", () => {
  it("exposes tables keyed both bare and $-prefixed", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, true: 14 },
      lineHeight: { "1": 16 },
      weight: { "1": "400" },
    });
    const font = getFont("body")!;
    expect(font.family).toBe("Inter");
    expect(font.size["2"]).toBe(14);
    expect(font.size.$2).toBe(14);
    expect(font.size.$true).toBe(14);
    expect(font.lineHeight.$2).toBe(16);
    expect(font.weight["$true"]).toBe("400");
  });

  it("is recomputed when the font is recreated", () => {
    createFont("body", { family: "Inter", size: { "1": 12 } });
    expect(getFont("body")!.size["1"]).toBe(12);
    createFont("body", { family: "Inter", size: { "1": 13 } });
    expect(getFont("body")!.size["1"]).toBe(13);
  });
});

describe("fillSizes", () => {
  it("orders numeric keys numerically, then named keys", () => {
    const filled = fillSizes({ "10": 1, "2": 1, "1": 1, true: 1 }, { "2": "b", "10": "c" });
    expect(filled).toEqual({ "1": "b", "2": "b", "10": "c", true: "c" });
  });

  it("returns an empty object for an empty partial", () => {
    expect(fillSizes({ "1": 1 }, {})).toEqual({});
  });
});
