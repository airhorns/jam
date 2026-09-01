import { describe, it, expect, beforeEach } from "vitest";
import { resetUI } from "../testing";
import {
  createThemes,
  setTheme,
  getActiveThemeName,
  getThemeNames,
  getThemeValues,
  useTheme,
  resolveThemeValue,
  resolveThemeName,
  addTheme,
  updateTheme,
  ensureThemeCSS,
  injectThemeCSS,
} from "../themes";

beforeEach(() => {
  resetUI();
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
    expect(getThemeNames()).toEqual(["light", "dark"]);
  });
});

describe("without a document", () => {
  it("setting a theme and injecting CSS are no-ops", () => {
    createThemes({ light: { background: "#fff" }, light_blue: { background: "#eef" } });
    setTheme("light_blue");
    expect(getActiveThemeName()).toBe("light_blue");
    expect(() => ensureThemeCSS("light_blue")).not.toThrow();
    expect(() => injectThemeCSS()).not.toThrow();
  });
});

describe("resolveThemeName", () => {
  beforeEach(() => {
    createThemes({
      light: {},
      dark: {},
      light_blue: {},
      dark_blue: {},
      light_blue_Button: {},
      light_Button: {},
      dark_Button: {},
      light_Card: {},
      custom: {},
    });
  });

  it("nests a sub-theme under the parent and prefers a component theme inside it", () => {
    expect(resolveThemeName("light", "blue")).toBe("light_blue");
    expect(resolveThemeName("light", "$blue")).toBe("light_blue");
    expect(resolveThemeName("light", "blue", "Button")).toBe("light_blue_Button");
    expect(resolveThemeName("light_blue", undefined, "Button")).toBe("light_blue_Button");
    expect(resolveThemeName("light_Card", undefined, "Button")).toBe("light_Button");
    expect(resolveThemeName("light", "red")).toBe("light");
  });

  it("resolves full names without a parent, including component themes", () => {
    expect(resolveThemeName(undefined, "dark")).toBe("dark");
    expect(resolveThemeName(undefined, "dark", "Button")).toBe("dark_Button");
    expect(resolveThemeName("light", "dark_blue")).toBe("dark_blue");
    expect(resolveThemeName(undefined, "nope")).toBeUndefined();
  });

  it("inverts the scheme when the counterpart exists", () => {
    expect(resolveThemeName("light_blue", undefined, undefined, true)).toBe("dark_blue");
    expect(resolveThemeName("dark", undefined, undefined, true)).toBe("light");
    expect(resolveThemeName("light_Card", undefined, undefined, true)).toBe("light_Card");
    expect(resolveThemeName("custom", undefined, undefined, true)).toBe("custom");
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
  it("returns empty object when no theme is set", () => {
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

  it("accepts bare keys and an explicit theme name", () => {
    createThemes({ light: { background: "#fff" }, dark: { background: "#000" } });
    setTheme("light");
    expect(resolveThemeValue("background")).toBe("#fff");
    expect(resolveThemeValue("$background", "dark")).toBe("#000");
  });

  it("returns undefined when no theme is set", () => {
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

  it("skips null and undefined values when updating", () => {
    createThemes({ light: { background: "#fff", color: "#000" } });
    setTheme("light");
    updateTheme("light", { background: undefined, color: "#222" });
    expect(useTheme()).toEqual({ background: "#fff", color: "#222" });
  });
});
