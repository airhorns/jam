import { describe, it, expect } from "vitest";
import type { VariantExtras } from "../styled";
import {
  tokenValue,
  stepToken,
  defaultSizeKey,
  getButtonSized,
  getSquareSized,
  getSpacerSized,
  getRadiusSized,
  steppedSpace,
  getSpaceSized,
  getFontSized,
  getSizedElevation,
  getElevation,
  themeableVariants,
} from "../variants";

const tokens: VariantExtras["tokens"] = {
  size: { "2": 32, $2: 32, "3": 38, $3: 38, "3.5": 40, "$3.5": 40, "4": 44, $4: 44, true: 44, $true: 44 },
  space: { "2": 8, $2: 8, "3": 12, $3: 12, "3.5": 14, "$3.5": 14, "4": 16, $4: 16, true: 16, $true: 16 },
  radius: { "2": 6, $2: 6, "4": 9, $4: 9, true: 9, $true: 9 },
  color: { red: "#f00", $red: "#f00" },
};

const font = {
  family: "Inter",
  size: { "2": 12, $2: 12, "4": 14, $4: 14, true: 14, $true: 14 },
  lineHeight: { "4": 20, $4: 20 },
  weight: { "4": "500", $4: "500" },
  letterSpacing: { "2": 0.5, $2: 0.5 },
};

function extras(overrides: Partial<VariantExtras> = {}): VariantExtras {
  return { props: {}, tokens, theme: { shadowColor: "$shadowColor" }, themeValues: {}, font: undefined, fontName: "body", ...overrides };
}

describe("tokenValue", () => {
  it("returns numbers as-is and looks tokens up with or without $", () => {
    expect(tokenValue(tokens, "size", 12)).toBe(12);
    expect(tokenValue(tokens, "size", "$4")).toBe(44);
    expect(tokenValue(tokens, "size", "4")).toBe(44);
  });

  it("is undefined for missing categories, missing keys and non-numeric tokens", () => {
    expect(tokenValue(tokens, "zIndex", "$1")).toBeUndefined();
    expect(tokenValue(tokens, "size", "$99")).toBeUndefined();
    expect(tokenValue(tokens, "color", "$red")).toBeUndefined();
  });
});

describe("stepToken", () => {
  it("steps along the numerically sorted scale and clamps at both ends", () => {
    expect(stepToken(tokens, "size", "$2", 1)).toBe("$3");
    expect(stepToken(tokens, "size", "$3", 1)).toBe("$3.5");
    expect(stepToken(tokens, "size", "$4", 5)).toBe("$4");
    expect(stepToken(tokens, "size", "$2", -3)).toBe("$2");
  });

  it("skips half steps on request", () => {
    expect(stepToken(tokens, "size", "$3", 1, { excludeHalfSteps: true })).toBe("$4");
    expect(stepToken(tokens, "size", "4", -1, { excludeHalfSteps: true })).toBe("$3");
  });

  it("resolves `true` to the key it aliases before stepping", () => {
    expect(stepToken(tokens, "size", "$true", -1)).toBe("$3.5");
    expect(stepToken({ size: { true: 99, "2": 32 } }, "size", "$true", 1)).toBe("$true");
  });

  it("returns unknown keys and unknown categories unchanged", () => {
    expect(stepToken(tokens, "size", "$nope", 1)).toBe("$nope");
    expect(stepToken(tokens, "zIndex", "$1", 1)).toBe("$1");
  });
});

describe("defaultSizeKey", () => {
  it("finds the key `true` aliases", () => {
    expect(defaultSizeKey(tokens.size)).toBe("4");
  });

  it("falls back to 4 without a table or a `true` entry, and to `true` when nothing aliases it", () => {
    expect(defaultSizeKey(undefined)).toBe("4");
    expect(defaultSizeKey({ "2": 32 })).toBe("4");
    expect(defaultSizeKey({ true: 99, "2": 32 })).toBe("true");
  });
});

describe("getButtonSized", () => {
  it("derives padding, height and radius from the matching tokens", () => {
    expect(getButtonSized("$2", extras())).toEqual({ paddingHorizontal: 8, height: 32, borderRadius: 6 });
  });

  it("falls back to each category's `true` token when the key is missing", () => {
    expect(getButtonSized("$3", extras())).toEqual({ paddingHorizontal: 12, height: 38, borderRadius: 9 });
    expect(getButtonSized("$7", extras())).toEqual({ paddingHorizontal: 16, height: 44, borderRadius: 9 });
    expect(getButtonSized("$7", extras({ tokens: { size: {}, space: {}, radius: {} } }))).toEqual({
      paddingHorizontal: undefined,
      height: undefined,
      borderRadius: undefined,
    });
  });

  it("scales literal numbers", () => {
    expect(getButtonSized(40, extras())).toEqual({ paddingHorizontal: 10, height: 40, borderRadius: 8 });
  });

  it("does nothing for null values or circular buttons", () => {
    expect(getButtonSized(null, extras())).toBeNull();
    expect(getButtonSized("$2", extras({ props: { circular: true } }))).toBeNull();
  });

  it("is undefined-valued when token categories are missing entirely", () => {
    expect(getButtonSized("$2", extras({ tokens: {} }))).toEqual({ paddingHorizontal: undefined, height: undefined, borderRadius: undefined });
  });
});

describe("getSquareSized / getSpacerSized / getRadiusSized / getSpaceSized", () => {
  it("square sizing uses the size token, a literal number, or the raw value", () => {
    expect(getSquareSized("$2", extras())).toEqual({ width: 32, height: 32, minWidth: 32, minHeight: 32 });
    expect(getSquareSized(10, extras())).toEqual({ width: 10, height: 10, minWidth: 10, minHeight: 10 });
    expect(getSquareSized("50%", extras())).toEqual({ width: "50%", height: "50%", minWidth: "50%", minHeight: "50%" });
    expect(getSquareSized(null, extras())).toBeNull();
  });

  it("spacer sizing defaults to the `true` space token and accepts numbers", () => {
    expect(getSpacerSized(undefined, extras())).toEqual({ width: 16, height: 16, minWidth: 16, minHeight: 16 });
    expect(getSpacerSized("$2", extras())).toEqual({ width: 8, height: 8, minWidth: 8, minHeight: 8 });
    expect(getSpacerSized(5, extras())).toEqual({ width: 5, height: 5, minWidth: 5, minHeight: 5 });
    expect(getSpacerSized("$nope", extras())).toEqual({ width: 16, height: 16, minWidth: 16, minHeight: 16 });
    expect(getSpacerSized(undefined, extras({ tokens: {} }))).toEqual({ width: 0, height: 0, minWidth: 0, minHeight: 0 });
  });

  it("radius sizing uses the radius token, falling back to `true`", () => {
    expect(getRadiusSized(null, extras())).toBeNull();
    expect(getRadiusSized(3, extras())).toEqual({ borderRadius: 3 });
    expect(getRadiusSized("$2", extras())).toEqual({ borderRadius: 6 });
    expect(getRadiusSized("$3", extras())).toEqual({ borderRadius: 9 });
    expect(getRadiusSized("$3", extras({ tokens: {} }))).toEqual({ borderRadius: undefined });
  });

  it("space sizing pads from the space token and rounds from the radius token", () => {
    expect(getSpaceSized(null, extras())).toBeNull();
    expect(getSpaceSized(10, extras())).toEqual({ padding: 10, borderRadius: 5 });
    expect(getSpaceSized("$2", extras())).toEqual({ padding: 8, borderRadius: 6 });
    expect(getSpaceSized("$3", extras())).toEqual({ padding: 12, borderRadius: 9 });
    expect(getSpaceSized("$7", extras())).toEqual({ padding: 16, borderRadius: 9 });
    expect(getSpaceSized("$3", extras({ tokens: {} }))).toEqual({ padding: undefined, borderRadius: undefined });
  });

  it("steppedSpace steps the space scale from the given token, or keeps numbers", () => {
    expect(steppedSpace(tokens, "$4", -1)).toBe(14);
    expect(steppedSpace(tokens, undefined, -2)).toBe(12);
    expect(steppedSpace(tokens, 7, -1)).toBe(7);
  });
});

describe("getFontSized", () => {
  it("passes the value through when no font is in effect", () => {
    expect(getFontSized("$4", extras())).toEqual({ fontSize: "$4" });
    expect(getFontSized(undefined, extras())).toEqual({ fontSize: "$true" });
  });

  it("uses literal numbers as the font size", () => {
    expect(getFontSized(18, extras({ font }))).toEqual({ fontSize: 18 });
  });

  it("reads every table the font defines for the key", () => {
    expect(getFontSized("$4", extras({ font }))).toEqual({ fontSize: 14, lineHeight: 20, fontWeight: "500" });
    expect(getFontSized("$2", extras({ font }))).toEqual({ fontSize: 12, letterSpacing: 0.5 });
    expect(getFontSized("$9", extras({ font }))).toEqual({});
  });

  it("maps `$true` to the font's default size key", () => {
    expect(getFontSized("$true", extras({ font }))).toEqual({ fontSize: 14, lineHeight: 20, fontWeight: "500" });
  });
});

describe("elevation", () => {
  it("derives a shadow from the size token `true` aliases", () => {
    expect(getSizedElevation(true, extras())).toEqual({ shadowColor: "$shadowColor", shadowRadius: 24, shadowOffset: { height: 12, width: 0 } });
    expect(getSizedElevation(true, extras({ tokens: {} }))).toMatchObject({ shadowRadius: 7, shadowOffset: { height: 4, width: 0 } });
  });

  it("accepts size tokens, bare numeric strings and numbers", () => {
    expect(getSizedElevation("$2", extras())).toMatchObject({ shadowRadius: 18, shadowOffset: { height: 9, width: 0 } });
    expect(getSizedElevation("$12", extras())).toMatchObject({ shadowRadius: 8, shadowOffset: { height: 4, width: 0 } });
    expect(getSizedElevation(20, extras())).toMatchObject({ shadowRadius: 12, shadowOffset: { height: 6, width: 0 } });
  });

  it("returns null for zero, false and unparseable values", () => {
    expect(getSizedElevation(0, extras())).toBeNull();
    expect(getSizedElevation(false, extras())).toBeNull();
    expect(getSizedElevation("$nope", extras())).toBeNull();
  });

  it("falls back to a translucent black when the theme has no shadowColor", () => {
    expect(getSizedElevation(4, extras({ theme: {} }))?.shadowColor).toBe("rgba(0,0,0,0.15)");
  });

  it("getElevation ignores falsy values", () => {
    expect(getElevation(false, extras())).toBeNull();
    expect(getElevation(undefined, extras())).toBeNull();
    expect(getElevation("$4", extras())).toMatchObject({ shadowRadius: 24 });
  });
});

describe("themeableVariants", () => {
  const variant = (name: string, key: string) => (themeableVariants[name] as Record<string, Function>)[key];

  it("circular rounds fully and squares the element to its size", () => {
    expect(variant("circular", "true")(true, extras())).toEqual({ borderRadius: 100_000, padding: 0 });
    expect(variant("circular", "true")(true, extras({ props: { size: null } }))).toEqual({ borderRadius: 100_000, padding: 0 });
    expect(variant("circular", "true")(true, extras({ props: { size: "$2" } }))).toMatchObject({ width: 32, height: 32, maxWidth: 32, minHeight: 32 });
    expect(variant("circular", "true")(true, extras({ props: { size: "3em" } }))).toMatchObject({ width: "3em", height: "3em" });
  });

  it("elevate shadows by the element's size, or the default size", () => {
    expect(variant("elevate", "true")(true, extras({ props: { size: "$2" } }))).toMatchObject({ shadowRadius: 18 });
    expect(variant("elevate", "true")(true, extras())).toMatchObject({ shadowRadius: 24 });
  });

  it("bordered accepts a numeric width", () => {
    expect(variant("bordered", ":number")(3)).toEqual({ borderWidth: 3, borderStyle: "solid", borderColor: "$borderColor" });
  });
});
