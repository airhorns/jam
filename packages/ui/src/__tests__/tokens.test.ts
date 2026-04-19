import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { createTokens, getToken, resolveTokenValue, isTokenRef, isThemeRef } from "../tokens";

beforeEach(() => {
  db.clear();
});

describe("createTokens", () => {
  it("asserts size tokens as facts", () => {
    createTokens({ size: { "1": 5, "2": 10, "3": 15 } });
    expect(getToken("size", "1")).toBe(5);
    expect(getToken("size", "2")).toBe(10);
    expect(getToken("size", "3")).toBe(15);
  });

  it("asserts space tokens as facts", () => {
    createTokens({ space: { "1": 4, "2": 8, "3": 12 } });
    expect(getToken("space", "1")).toBe(4);
    expect(getToken("space", "2")).toBe(8);
  });

  it("asserts color tokens as facts", () => {
    createTokens({ color: { blue: "#0000ff", red: "#ff0000" } });
    expect(getToken("color", "blue")).toBe("#0000ff");
    expect(getToken("color", "red")).toBe("#ff0000");
  });

  it("asserts radius tokens as facts", () => {
    createTokens({ radius: { "1": 3, "2": 6 } });
    expect(getToken("radius", "1")).toBe(3);
  });

  it("asserts zIndex tokens as facts", () => {
    createTokens({ zIndex: { "1": 100, "2": 200 } });
    expect(getToken("zIndex", "1")).toBe(100);
  });

  it("handles multiple categories at once", () => {
    createTokens({
      size: { "4": 20 },
      space: { "4": 16 },
      color: { primary: "#007AFF" },
    });
    expect(getToken("size", "4")).toBe(20);
    expect(getToken("space", "4")).toBe(16);
    expect(getToken("color", "primary")).toBe("#007AFF");
  });

  it("returns undefined for missing tokens", () => {
    createTokens({ size: { "1": 5 } });
    expect(getToken("size", "99")).toBeUndefined();
    expect(getToken("color", "nonexistent")).toBeUndefined();
  });
});

describe("resolveTokenValue", () => {
  beforeEach(() => {
    createTokens({
      size: { "4": 20 },
      space: { "2": 8 },
      color: { blue: "#0000ff" },
    });
  });

  it("resolves $category.key format", () => {
    expect(resolveTokenValue("$size.4")).toBe(20);
    expect(resolveTokenValue("$space.2")).toBe(8);
    expect(resolveTokenValue("$color.blue")).toBe("#0000ff");
  });

  it("returns undefined for missing token refs", () => {
    expect(resolveTokenValue("$size.99")).toBeUndefined();
  });

  it("returns undefined for theme refs (no dot)", () => {
    expect(resolveTokenValue("$background")).toBeUndefined();
  });

  it("passes through non-token strings", () => {
    expect(resolveTokenValue("red")).toBe("red");
    expect(resolveTokenValue("10px")).toBe("10px");
  });

  it("passes through numbers", () => {
    expect(resolveTokenValue(10)).toBe(10);
    expect(resolveTokenValue(0)).toBe(0);
  });

  it("returns undefined for non-string non-number", () => {
    expect(resolveTokenValue(null)).toBeUndefined();
    expect(resolveTokenValue(undefined)).toBeUndefined();
  });
});

describe("isTokenRef / isThemeRef", () => {
  it("identifies token refs", () => {
    expect(isTokenRef("$size.4")).toBe(true);
    expect(isTokenRef("$color.blue")).toBe(true);
    expect(isTokenRef("$background")).toBe(false);
    expect(isTokenRef("red")).toBe(false);
    expect(isTokenRef(10)).toBe(false);
  });

  it("identifies theme refs", () => {
    expect(isThemeRef("$background")).toBe(true);
    expect(isThemeRef("$color")).toBe(true);
    expect(isThemeRef("$size.4")).toBe(false);
    expect(isThemeRef("red")).toBe(false);
    expect(isThemeRef(10)).toBe(false);
  });
});
