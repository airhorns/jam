import {
  blue, blueDark, gray, grayDark, green, greenDark, orange, orangeDark, pink, pinkDark,
  purple, purpleDark, red, redDark, teal, tealDark, yellow, yellowDark,
} from "./colors";
import { opacify } from "./color-utils";
import {
  buildThemes,
  PALETTE_BACKGROUND_OFFSET,
  type GetThemeProps,
  type Palette,
  type SchemePalette,
  type Template,
  type Templates,
  type ThemeDefinition,
  type ThemeSet,
} from "./theme-builder";

// ---- Templates (ported from @tamagui/themes v5) ----

function baseTemplates(scheme: "light" | "dark") {
  const isLight = scheme === "light";
  const lighten = isLight ? -1 : 1;
  const darken = -lighten;

  const background = PALETTE_BACKGROUND_OFFSET;
  const borderColor = background + 2;
  const color = -background;

  // Surfaces compute hover/press/focus relative to their own elevated background.
  const makeSurface = (offset: number, colorOffset = 0): Template => {
    const clr = color - colorOffset;
    const bg = background + offset;
    const brdr = borderColor + offset;
    return {
      color: clr,
      colorHover: clr + (isLight ? 0 : lighten),
      colorPress: clr,
      colorFocus: clr + darken,
      background: bg,
      backgroundHover: bg + lighten,
      backgroundPress: bg + darken,
      backgroundFocus: bg + offset,
      backgroundActive: bg,
      borderColor: brdr,
      borderColorHover: brdr + lighten,
      borderColorFocus: brdr,
      borderColorPress: brdr + darken,
    };
  };

  const base: Template = {
    accentBackground: 0,
    accentColor: -0,
    background0: 1,
    background02: 2,
    background04: 3,
    background06: 4,
    background08: 5,
    color1: background,
    color2: background + 1,
    color3: background + 2,
    color4: background + 3,
    color5: background + 4,
    color6: background + 5,
    color7: background + 6,
    color8: background + 7,
    color9: background + 8,
    color10: background + 9,
    color11: background + 10,
    color12: background + 11,
    color0: -1,
    color02: -2,
    color04: -3,
    color06: -4,
    color08: -5,
    // The base theme sits one step above color1 so generic surfaces differ from the page background.
    ...makeSurface(1),
    placeholderColor: color - 3,
    colorTransparent: -1,
  };

  const accent: Template = Object.fromEntries(
    Object.entries(base).map(([key, index]) => [key, -(index as number)]),
  );

  return {
    base,
    surface1: makeSurface(2, 1),
    surface2: makeSurface(3, 1),
    surface3: makeSurface(5, 1),
    accent,
  };
}

export const defaultTemplates: Templates = (() => {
  const out: Templates = {};
  for (const scheme of ["light", "dark"] as const) {
    for (const [name, template] of Object.entries(baseTemplates(scheme))) {
      out[`${scheme}_${name}`] = template;
    }
  }
  return out;
})();

// ---- Palettes ----

export const defaultDarkPalette: Palette = [
  "#090909", "#151515", "#191919", "#232323", "#333", "#444",
  "#666", "#777", "#858585", "#aaa", "#ccc", "#ffffff",
];

export const defaultLightPalette: Palette = [
  "#fff", "#f8f8f8", "hsl(0, 0%, 93%)", "hsl(0, 0%, 85%)", "hsl(0, 0%, 80%)", "hsl(0, 0%, 70%)",
  "hsl(0, 0%, 59%)", "hsl(0, 0%, 45%)", "hsl(0, 0%, 30%)", "hsl(0, 0%, 20%)", "hsl(0, 0%, 14%)", "hsl(0, 0%, 2%)",
];

/** Neutral grey with sufficient contrast on both white and black backgrounds. */
const neutralPalette: Palette = [
  "hsl(0, 0%, 68%)", "hsl(0, 0%, 65%)", "hsl(0, 0%, 62%)", "hsl(0, 0%, 59%)", "hsl(0, 0%, 56%)", "hsl(0, 0%, 53%)",
  "hsl(0, 0%, 50%)", "hsl(0, 0%, 47%)", "hsl(0, 0%, 44%)", "hsl(0, 0%, 41%)", "hsl(0, 0%, 38%)", "hsl(0, 0%, 32%)",
];

export const defaultChildrenThemes: Record<string, SchemePalette> = {
  gray: { light: gray, dark: grayDark },
  blue: { light: blue, dark: blueDark },
  red: { light: red, dark: redDark },
  yellow: { light: yellow, dark: yellowDark },
  green: { light: green, dark: greenDark },
  orange: { light: orange, dark: orangeDark },
  pink: { light: pink, dark: pinkDark },
  purple: { light: purple, dark: purpleDark },
  teal: { light: teal, dark: tealDark },
  neutral: { light: neutralPalette, dark: neutralPalette },
};

export const defaultGrandChildrenThemes = {
  accent: { template: "accent" },
  surface1: { template: "surface1" },
  surface2: { template: "surface2" },
};

export const defaultComponentThemes = {
  Button: { template: "surface2" },
  Checkbox: { template: "surface2" },
  Input: { template: "surface1" },
  Progress: { template: "surface1" },
  ProgressIndicator: { template: "accent" },
  RadioGroupItem: { template: "surface2" },
  Slider: { template: "surface1" },
  SliderActive: { template: "surface3" },
  SliderThumb: { template: "surface2" },
  Switch: { template: "surface2" },
  TextArea: { template: "surface1" },
  Tooltip: { template: "accent" },
  SwitchThumb: { template: "accent" },
};

// ---- Extra (non-inherited) values on the base themes ----

function namedScale(name: string, palette: Palette): ThemeDefinition {
  return Object.fromEntries(palette.map((color, i) => [`${name}${i + 1}`, color]));
}

const whiteBlack: ThemeDefinition = {
  white: "rgba(255,255,255,1)",
  white0: "rgba(255,255,255,0)",
  white02: "rgba(255,255,255,0.2)",
  white04: "rgba(255,255,255,0.4)",
  white06: "rgba(255,255,255,0.6)",
  white08: "rgba(255,255,255,0.8)",
  black: "rgba(0,0,0,1)",
  black0: "rgba(0,0,0,0)",
  black02: "rgba(0,0,0,0.2)",
  black04: "rgba(0,0,0,0.4)",
  black06: "rgba(0,0,0,0.6)",
  black08: "rgba(0,0,0,0.8)",
};

const shadows = {
  dark: {
    shadow1: "rgba(0,0,0,0.15)", shadow2: "rgba(0,0,0,0.23)", shadow3: "rgba(0,0,0,0.33)", shadow4: "rgba(0,0,0,0.45)",
    shadow5: "rgba(0,0,0,0.65)", shadow6: "rgba(0,0,0,0.8)", shadow7: "rgba(0,0,0,0.9)", shadow8: "rgba(0,0,0,1)",
  },
  light: {
    shadow1: "rgba(0,0,0,0.04)", shadow2: "rgba(0,0,0,0.08)", shadow3: "rgba(0,0,0,0.12)", shadow4: "rgba(0,0,0,0.22)",
    shadow5: "rgba(0,0,0,0.33)", shadow6: "rgba(0,0,0,0.44)", shadow7: "rgba(0,0,0,0.6)", shadow8: "rgba(0,0,0,0.75)",
  },
};

const highlights = {
  dark: {
    highlight1: "rgba(255,255,255,0.1)", highlight2: "rgba(255,255,255,0.2)", highlight3: "rgba(255,255,255,0.3)",
    highlight4: "rgba(255,255,255,0.45)", highlight5: "rgba(255,255,255,0.65)", highlight6: "rgba(255,255,255,0.85)",
    highlight7: "rgba(255,255,255,0.95)", highlight8: "rgba(255,255,255,1)",
  },
  light: {
    highlight1: "rgba(255,255,255,0.05)", highlight2: "rgba(255,255,255,0.1)", highlight3: "rgba(255,255,255,0.15)",
    highlight4: "rgba(255,255,255,0.3)", highlight5: "rgba(255,255,255,0.4)", highlight6: "rgba(255,255,255,0.55)",
    highlight7: "rgba(255,255,255,0.7)", highlight8: "rgba(255,255,255,0.85)",
  },
};

// The base theme's background sits at palette index 7 (one above color1).
const BG_OFFSET = PALETTE_BACKGROUND_OFFSET + 1;

function computedValues({ palette, scheme }: GetThemeProps): ThemeDefinition {
  const bg = palette[BG_OFFSET];
  const fg = palette[palette.length - 2];
  // Far enough from the base background for a ~3:1 focus ring in both schemes (dark palettes step more slowly).
  const outlineStep = scheme === "dark" ? 8 : 7;
  return {
    color01: opacify(fg, 0.1),
    color0075: opacify(fg, 0.075),
    color005: opacify(fg, 0.05),
    color0025: opacify(fg, 0.025),
    color002: opacify(fg, 0.02),
    color001: opacify(fg, 0.01),
    background01: opacify(bg, 0.1),
    background0075: opacify(bg, 0.075),
    background005: opacify(bg, 0.05),
    background0025: opacify(bg, 0.025),
    background002: opacify(bg, 0.02),
    background001: opacify(bg, 0.01),
    background02: opacify(bg, 0.2),
    background04: opacify(bg, 0.4),
    background06: opacify(bg, 0.6),
    background08: opacify(bg, 0.8),
    outlineColor: opacify(palette[BG_OFFSET + outlineStep], 0.6),
  };
}

export type CreateDefaultThemesOptions = {
  darkPalette?: Palette;
  lightPalette?: Palette;
  /** Custom accent palette; defaults to the inverted base palette. */
  accent?: SchemePalette;
  /** Color sub-themes; pass `{}` for none. */
  childrenThemes?: Record<string, SchemePalette>;
  grandChildrenThemes?: Record<string, { template: string }>;
  componentThemes?: Record<string, { template: string }> | false;
  getTheme?: (props: GetThemeProps) => ThemeDefinition;
};

/**
 * Create the default theme set: light/dark bases, an accent theme, color
 * sub-themes for every Radix scale, surface and accent grandchildren, and
 * component themes. Equivalent to tamagui's `createV5Theme()`.
 */
export function createDefaultThemes(options: CreateDefaultThemesOptions = {}): ThemeSet {
  const {
    darkPalette = defaultDarkPalette,
    lightPalette = defaultLightPalette,
    accent,
    childrenThemes = defaultChildrenThemes,
    grandChildrenThemes = defaultGrandChildrenThemes,
    componentThemes = defaultComponentThemes,
    getTheme,
  } = options;

  const scales = { ...namedScale("black", darkPalette), ...namedScale("white", lightPalette), ...whiteBlack };
  const extra = {
    light: { ...scales, ...shadows.light, ...highlights.light, shadowColor: shadows.light.shadow3 },
    dark: { ...scales, ...shadows.dark, ...highlights.dark, shadowColor: shadows.dark.shadow3 },
  };
  for (const [name, theme] of Object.entries(childrenThemes)) {
    Object.assign(extra.light, namedScale(name, theme.light));
    Object.assign(extra.dark, namedScale(name, theme.dark));
  }

  return buildThemes({
    base: { light: lightPalette, dark: darkPalette },
    accent: accent ?? { light: darkPalette, dark: lightPalette },
    childrenThemes: {
      black: { light: darkPalette, dark: darkPalette },
      white: { light: lightPalette, dark: lightPalette },
      ...childrenThemes,
    },
    grandChildrenThemes,
    componentThemes,
    templates: defaultTemplates,
    extra,
    getTheme: (props) => ({ ...computedValues(props), ...getTheme?.(props) }),
  });
}
