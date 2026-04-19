import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import {
  createThemes,
  setTheme,
  getActiveThemeName,
  getThemeValues,
  useTheme,
  resolveThemeValue,
  addTheme,
  updateTheme,
} from "../themes";

beforeEach(() => {
  db.clear();
});

describe("createThemes", () => {
  it("asserts theme facts", () => {
    createThemes({
      light: { background: "#fff", color: "#000" },
      dark: { background: "#000", color: "#fff" },
    });

    expect(getThemeValues("light")).toEqual({
      background: "#fff",
      color: "#000",
    });
    expect(getThemeValues("dark")).toEqual({
      background: "#000",
      color: "#fff",
    });
  });
});

describe("setTheme / getActiveThemeName", () => {
  it("sets and gets the active theme", () => {
    createThemes({
      light: { background: "#fff" },
      dark: { background: "#000" },
    });
    expect(getActiveThemeName()).toBeUndefined();

    setTheme("dark");
    expect(getActiveThemeName()).toBe("dark");

    setTheme("light");
    expect(getActiveThemeName()).toBe("light");
  });
});

describe("useTheme", () => {
  it("returns empty object when no theme is remember", () => {
    expect(useTheme()).toEqual({});
  });

  it("returns values for the active theme", () => {
    createThemes({
      light: { background: "#fff", color: "#000" },
      dark: { background: "#111", color: "#eee" },
    });
    setTheme("light");
    expect(useTheme()).toEqual({ background: "#fff", color: "#000" });

    setTheme("dark");
    expect(useTheme()).toEqual({ background: "#111", color: "#eee" });
  });

  it("resolves nested themes via underscore fallback", () => {
    createThemes({
      dark: {
        background: "#000",
        color: "#fff",
        borderColor: "#333",
      },
      dark_green: {
        background: "#001100",
        color: "#00ff00",
      },
      dark_green_Button: {
        background: "#002200",
      },
    });

    setTheme("dark_green_Button");
    const theme = useTheme();
    // Button-specific
    expect(theme.background).toBe("#002200");
    // Falls back to dark_green
    expect(theme.color).toBe("#00ff00");
    // Falls back to dark
    expect(theme.borderColor).toBe("#333");
  });
});

describe("resolveThemeValue", () => {
  it("resolves theme refs from the active theme", () => {
    createThemes({
      light: { background: "#fff", color: "#000" },
    });
    setTheme("light");

    expect(resolveThemeValue("$background")).toBe("#fff");
    expect(resolveThemeValue("$color")).toBe("#000");
  });

  it("resolves with fallback through nesting", () => {
    createThemes({
      dark: { background: "#000", borderColor: "#333" },
      dark_alt: { background: "#111" },
    });
    setTheme("dark_alt");

    expect(resolveThemeValue("$background")).toBe("#111");
    expect(resolveThemeValue("$borderColor")).toBe("#333");
  });

  it("returns undefined for missing keys", () => {
    createThemes({ light: { background: "#fff" } });
    setTheme("light");
    expect(resolveThemeValue("$nonexistent")).toBeUndefined();
  });

  it("returns undefined when no theme is remember", () => {
    createThemes({ light: { background: "#fff" } });
    expect(resolveThemeValue("$background")).toBeUndefined();
  });
});

describe("addTheme / updateTheme", () => {
  it("adds a new theme at runtime", () => {
    addTheme("custom", { background: "#abc", color: "#def" });
    setTheme("custom");
    expect(useTheme()).toEqual({ background: "#abc", color: "#def" });
  });

  it("updates an existing theme", () => {
    createThemes({ light: { background: "#fff", color: "#000" } });
    setTheme("light");
    expect(useTheme().background).toBe("#fff");

    updateTheme("light", { background: "#f0f0f0" });
    expect(useTheme().background).toBe("#f0f0f0");
    // Unchanged key remains
    expect(useTheme().color).toBe("#000");
  });
});
