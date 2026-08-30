import { opacify } from "./color-utils";

/** A 12-step color scale ordered from background to foreground. */
export type Palette = readonly string[];
export type SchemePalette = { light: Palette; dark: Palette };

/**
 * A template maps theme keys to indexes into a padded palette. Positive
 * indexes count from the start, negative from the end (-1 is the last entry).
 * String values are used verbatim.
 */
export type Template = Record<string, number | string>;
export type Templates = Record<string, Template>;

export type ThemeDefinition = Record<string, string>;
export type ThemeSet = Record<string, ThemeDefinition>;

export type GetThemeProps = {
  name: string;
  scheme: "light" | "dark";
  palette: readonly string[];
  theme: ThemeDefinition;
};

export type BuildThemesOptions = {
  base: SchemePalette;
  /** Palette for the `accent` sub-theme. Defaults to the inverted base palette. */
  accent?: SchemePalette | false;
  /** Color sub-themes (`light_blue`, `dark_blue`, …) built from their own palettes. */
  childrenThemes?: Record<string, SchemePalette>;
  /** Template-only sub-themes nested under every color theme (`light_blue_surface1`). */
  grandChildrenThemes?: Record<string, { template: string }>;
  /** Per-component themes (`light_Button`) applied automatically by `styled({ name })`. */
  componentThemes?: Record<string, { template: string }> | false;
  templates: Templates;
  /** Values only present on the two base themes (color scales, shadows, …). */
  extra?: { light: ThemeDefinition; dark: ThemeDefinition };
  /** Add computed values to every generated theme. */
  getTheme?: (props: GetThemeProps) => ThemeDefinition;
};

/** Number of entries padded before the first palette color (accent bg + 5 transparents). */
export const PALETTE_BACKGROUND_OFFSET = 6;

const transparentSteps = [0, 0.2, 0.4, 0.6, 0.8];

function withTransparents(colors: Palette): string[] {
  const background = colors[0];
  const foreground = colors[colors.length - 1];
  const bg = transparentSteps.map((a) => opacify(background, a));
  const fg = transparentSteps.map((a) => opacify(foreground, a)).reverse();
  return [...bg, ...colors, ...fg];
}

/**
 * Pad a scheme palette the way tamagui's theme builder does:
 * `[accentBg, bg0, bg02, bg04, bg06, bg08, ...colors, fg08, fg06, fg04, fg02, fg0, accentFg]`
 */
function padPalettes(own: SchemePalette, opposite: SchemePalette): { light: string[]; dark: string[] } {
  const ownLight = withTransparents(own.light);
  const ownDark = withTransparents(own.dark);
  const oppLight = withTransparents(opposite.light);
  const oppDark = withTransparents(opposite.dark);
  const bgOffset = 7;
  return {
    light: [oppLight[bgOffset], ...ownLight, oppLight[oppLight.length - bgOffset - 1]],
    dark: [oppDark[oppDark.length - bgOffset - 1], ...ownDark, oppDark[bgOffset]],
  };
}

function paletteValue(palette: readonly string[], offset: number | string): string {
  if (typeof offset === "string") return offset;
  const max = palette.length - 1;
  const isPositive = offset === 0 ? !Object.is(offset, -0) : offset > 0;
  const index = isPositive ? offset : max + offset;
  return palette[Math.min(Math.max(0, index), max)];
}

function applyTemplate(palette: readonly string[], template: Template): ThemeDefinition {
  const theme: ThemeDefinition = {};
  for (const [key, offset] of Object.entries(template)) {
    theme[key] = paletteValue(palette, offset);
  }
  return theme;
}

type PendingTheme = { paletteName: string; template: string; extra?: ThemeDefinition };

const schemeOf = (name: string): "light" | "dark" => (name.startsWith("dark") ? "dark" : "light");
const parentOf = (name: string): string => name.slice(0, Math.max(0, name.lastIndexOf("_")));

/**
 * Build a full set of nested themes from palettes and templates. Produces the
 * tamagui theme naming scheme: `light`, `dark`, `light_accent`, `light_blue`,
 * `light_blue_surface1`, `light_Button`, `light_blue_Button`, …
 */
export function buildThemes(options: BuildThemesOptions): ThemeSet {
  const { base, childrenThemes = {}, grandChildrenThemes = {}, componentThemes = false, templates, extra, getTheme } = options;
  const accent: SchemePalette | undefined =
    options.accent === false ? undefined : options.accent ?? { light: base.dark, dark: base.light };

  const palettes: Record<string, string[]> = {};
  const addPalettes = (name: string, own: SchemePalette, opposite: SchemePalette) => {
    const padded = padPalettes(own, opposite);
    palettes[name === "base" ? "light" : `light_${name}`] = padded.light;
    palettes[name === "base" ? "dark" : `dark_${name}`] = padded.dark;
  };
  addPalettes("base", base, accent ?? base);
  if (accent) addPalettes("accent", accent, base);
  for (const [name, palette] of Object.entries(childrenThemes)) {
    addPalettes(name, palette, accent ?? base);
  }

  const accentValues = (scheme: "light" | "dark"): ThemeDefinition => {
    const palette = palettes[`${scheme}_accent`];
    if (!palette) return {};
    const values: ThemeDefinition = {};
    for (let i = 0; i < 12; i++) values[`accent${i + 1}`] = palette[PALETTE_BACKGROUND_OFFSET + i];
    return values;
  };

  const pending = new Map<string, PendingTheme>();
  pending.set("light", { paletteName: "light", template: "base", extra: { ...extra?.light, ...accentValues("light") } });
  pending.set("dark", { paletteName: "dark", template: "base", extra: { ...extra?.dark, ...accentValues("dark") } });

  const addChildren = (
    children: Record<string, { template: string; palette?: string }>,
    avoidNestingWithin: string[],
  ) => {
    const parents = [...pending.keys()];
    for (const parent of parents) {
      if (avoidNestingWithin.some((avoid) => parent.startsWith(avoid) || parent.endsWith(avoid))) continue;
      for (const [subName, def] of Object.entries(children)) {
        const fullName = `${parent}_${subName}`;
        if (parent.endsWith(`_${subName}`) || pending.has(fullName)) continue;
        const paletteName = def.palette ? `${schemeOf(parent)}_${def.palette}` : pending.get(parent)!.paletteName;
        pending.set(fullName, { paletteName, template: def.template });
      }
    }
  };

  if (accent) {
    addChildren({ accent: { template: "base", palette: "accent" } }, []);
  }
  addChildren(
    Object.fromEntries(Object.keys(childrenThemes).map((name) => [name, { template: "base", palette: name }])),
    ["accent"],
  );
  addChildren(grandChildrenThemes, ["accent"]);
  if (componentThemes) {
    addChildren(componentThemes, Object.keys(grandChildrenThemes));
  }

  const out: ThemeSet = {};
  for (const [name, def] of pending) {
    const scheme = schemeOf(name);
    const palette = palettes[def.paletteName];
    const template = templates[def.template] ?? templates[`${scheme}_${def.template}`];
    if (!template) {
      throw new Error(`No template "${def.template}" for theme "${name}" (have: ${Object.keys(templates).join(", ")})`);
    }
    const theme = { ...applyTemplate(palette, template), ...def.extra };
    out[name] = getTheme ? { ...theme, ...getTheme({ name, scheme, palette, theme }) } : theme;
  }
  return out;
}

/** The parent theme name of a nested theme (`light_blue_Button` → `light_blue`), or "" for a base theme. */
export function getParentThemeName(name: string): string {
  return parentOf(name);
}
