import { describe, it, expect } from "vitest";
import { createDefaultThemes, defaultDarkPalette, defaultLightPalette } from "../default-themes";

describe("createDefaultThemes", () => {
  it("inverts the base palettes for the accent theme and nests every default color theme", () => {
    const themes = createDefaultThemes();
    expect(themes.light_accent.background).toBe(themes.dark.background);
    expect(themes.dark_accent.background).toBe(themes.light.background);
    expect(Object.keys(themes)).toEqual(expect.arrayContaining(["light_blue", "dark_blue_surface1", "light_red_Button", "light_black", "dark_white"]));
    expect(themes.light.color01).toMatch(/^rgba\(/);
  });

  it("layers a custom getTheme over the computed values", () => {
    const themes = createDefaultThemes({
      accent: { light: defaultLightPalette, dark: defaultDarkPalette },
      childrenThemes: {},
      grandChildrenThemes: {},
      componentThemes: false,
      getTheme: ({ name, scheme }) => ({ label: `${name}:${scheme}`, color01: "transparent" }),
    });
    expect(Object.keys(themes).sort()).toEqual(["dark", "dark_accent", "dark_black", "dark_white", "light", "light_accent", "light_black", "light_white"]);
    expect(themes.light_accent.background).toBe(themes.light.background);
    expect(themes.light.label).toBe("light:light");
    expect(themes.dark_accent.label).toBe("dark_accent:dark");
    expect(themes.light.color01).toBe("transparent");
  });
});
