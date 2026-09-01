import { describe, it, expect } from "vitest";
import { buildThemes, getParentThemeName, PALETTE_BACKGROUND_OFFSET } from "../theme-builder";

const base = { light: ["#fff", "#888", "#000"], dark: ["#000", "#777", "#fff"] };
const blue = { light: ["#eef", "#88f", "#008"], dark: ["#008", "#44c", "#eef"] };
const templates = { base: { background: PALETTE_BACKGROUND_OFFSET, color: -PALETTE_BACKGROUND_OFFSET, outline: "2px solid" } };

describe("buildThemes", () => {
  it("builds light and dark bases from the padded palettes, with verbatim template strings", () => {
    const themes = buildThemes({ base, templates, accent: false });
    expect(Object.keys(themes)).toEqual(["light", "dark"]);
    expect(themes.light).toEqual({ background: "#fff", color: "#000", outline: "2px solid" });
    expect(themes.dark).toEqual({ background: "#000", color: "#fff", outline: "2px solid" });
  });

  it("pads color themes against the base when there is no accent", () => {
    const themes = buildThemes({ base, templates, accent: false, childrenThemes: { blue } });
    expect(Object.keys(themes)).toEqual(["light", "dark", "light_blue", "dark_blue"]);
    expect(themes.light_blue).toEqual({ background: "#eef", color: "#008", outline: "2px solid" });
    expect(themes.light_blue).not.toHaveProperty("accent1");
  });

  it("defaults the accent to the inverted base and exposes its scale on the bases", () => {
    const themes = buildThemes({ base, templates });
    expect(themes.light_accent.background).toBe("#000");
    expect(themes.dark_accent.background).toBe("#fff");
    expect(themes.light).toMatchObject({ accent1: "#000", accent2: "#777", accent3: "#fff" });
  });

  it("uses an explicit accent palette", () => {
    const themes = buildThemes({ base, templates, accent: blue });
    expect(themes.light_accent.background).toBe("#eef");
    expect(themes.light.accent1).toBe("#eef");
  });

  it("nests color, grandchild and component themes the way tamagui does", () => {
    const themes = buildThemes({
      base,
      templates: { ...templates, surface: { background: PALETTE_BACKGROUND_OFFSET + 1 } },
      childrenThemes: { blue },
      grandChildrenThemes: { surface1: { template: "surface" } },
      componentThemes: { Button: { template: "base" } },
    });
    const names = Object.keys(themes);
    expect(names).toEqual(expect.arrayContaining(["light_blue", "dark_blue", "light_blue_surface1", "light_surface1", "light_Button", "light_blue_Button"]));
    expect(names).not.toContain("light_accent_surface1");
    expect(names).not.toContain("light_blue_surface1_Button");
    expect(themes.light_blue.background).toBe("#eef");
    expect(themes.dark_blue.background).toBe("#008");
    expect(themes.light_blue_surface1.background).toBe("#88f");
    expect(themes.light_blue_Button.background).toBe("#eef");
  });

  it("merges extra values and getTheme output into every theme", () => {
    const themes = buildThemes({
      base,
      templates,
      accent: false,
      extra: { light: { shadow: "rgba(0,0,0,0.1)" }, dark: { shadow: "rgba(0,0,0,0.6)" } },
      getTheme: ({ name, scheme, palette, theme }) => ({ label: `${name}/${scheme}/${palette.length}/${theme.background}` }),
    });
    expect(themes.light.shadow).toBe("rgba(0,0,0,0.1)");
    expect(themes.dark.label).toBe("dark/dark/15/#000");
  });

  it("throws when a theme's template is missing", () => {
    expect(() => buildThemes({ base, templates: {}, accent: false })).toThrow(/No template "base" for theme "light"/);
  });
});

describe("getParentThemeName", () => {
  it("strips the last segment, or returns an empty string for a base theme", () => {
    expect(getParentThemeName("light_blue_Button")).toBe("light_blue");
    expect(getParentThemeName("light")).toBe("");
  });
});
