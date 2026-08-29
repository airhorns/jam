import { createDefaultThemes, defaultChildrenThemes } from "./default-themes";
import type { FontConfig, JamUIConfig, MediaConfig, TokenConfig } from "./types";

// ---- Tokens (ported from @tamagui/themes v5) ----

// Sizes roughly map to control heights at each step; space is a fixed fraction of size.
export const size: Record<string, number> = {
  "0": 0,
  "0.25": 2,
  "0.5": 4,
  "0.75": 8,
  "1": 20,
  "1.5": 24,
  "2": 28,
  "2.5": 32,
  "3": 36,
  "3.5": 40,
  "4": 44,
  true: 44,
  "4.5": 48,
  "5": 52,
  "6": 64,
  "7": 74,
  "8": 84,
  "9": 94,
  "10": 104,
  "11": 124,
  "12": 144,
  "13": 164,
  "14": 184,
  "15": 204,
  "16": 224,
  "17": 224,
  "18": 244,
  "19": 264,
  "20": 284,
};

function sizeToSpace(v: number): number {
  if (v === 0) return 0;
  if (v === 2) return 0.5;
  if (v === 4) return 1;
  if (v === 8) return 1.5;
  if (v <= 16) return Math.round(v * 0.333);
  return Math.floor(v * 0.7 - 12);
}

export const space: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(size)) out[key] = sizeToSpace(value);
  for (const [key, value] of Object.entries(size)) {
    if (key === "0") continue;
    out[`-${key}`] = -sizeToSpace(value);
  }
  return out;
})();

export const radius: Record<string, number> = {
  "0": 0,
  "1": 3,
  "2": 5,
  "3": 7,
  "4": 9,
  true: 9,
  "5": 10,
  "6": 16,
  "7": 19,
  "8": 22,
  "9": 26,
  "10": 34,
  "11": 42,
  "12": 50,
};

export const zIndex: Record<string, number> = {
  "0": 0,
  "1": 100,
  "2": 200,
  "3": 300,
  "4": 400,
  "5": 500,
};

/** Every Radix scale as `blue1Light`/`blue1Dark` … so palettes are addressable outside of themes. */
export const color: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [name, scale] of Object.entries(defaultChildrenThemes)) {
    scale.light.forEach((v, i) => (out[`${name}${i + 1}Light`] = v));
    scale.dark.forEach((v, i) => (out[`${name}${i + 1}Dark`] = v));
  }
  out.white = "#fff";
  out.black = "#000";
  return out;
})();

export const defaultTokens: TokenConfig = { size, space, radius, zIndex, color };

// ---- Fonts ----

const fontSizes: Record<string, number> = {
  "1": 12,
  "2": 13,
  "3": 14,
  "4": 15,
  true: 15,
  "5": 16,
  "6": 18,
  "7": 22,
  "8": 26,
  "9": 30,
  "10": 40,
  "11": 46,
  "12": 52,
  "13": 60,
  "14": 70,
  "15": 85,
  "16": 100,
};

// Body line height tapers from 150% at small sizes to ~142% at 40px.
const bodyLineHeight = (fontSize: number) => Math.round(fontSize * (1.5 - Math.max(0, (fontSize - 20) * 0.004)));
const headingLineHeight = (fontSize: number) => Math.round(fontSize * 1.12 + 5);

const systemFamily = '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const monoFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

function mapSizes(fn: (fontSize: number) => number): Record<string, number> {
  return Object.fromEntries(Object.entries(fontSizes).map(([k, v]) => [k, fn(v)]));
}

export function createSystemFont(overrides: Partial<FontConfig> & { sizeLineHeight?: (fontSize: number) => number } = {}): FontConfig {
  const { sizeLineHeight = bodyLineHeight, ...font } = overrides;
  const sizes = { ...fontSizes, ...font.size };
  return {
    family: systemFamily,
    lineHeight: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, sizeLineHeight(v)])),
    weight: { "1": "400" },
    letterSpacing: { "4": 0 },
    ...font,
    size: sizes,
  };
}

export const defaultFonts: Record<string, FontConfig> = {
  body: createSystemFont(),
  heading: createSystemFont({
    weight: { "0": "600", "6": "700", "9": "800" },
    sizeLineHeight: headingLineHeight,
  }),
  mono: createSystemFont({
    family: monoFamily,
    size: mapSizes((v) => Math.round(v * 0.92)),
  }),
};

// ---- Media ----

export const breakpoints = {
  xxxs: 260,
  xxs: 340,
  xs: 460,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
};

// Order matters: later entries win when several queries match, so max-width
// queries go large-to-small and min-width queries come after them.
export const defaultMedia: MediaConfig = {
  "max-xxl": { maxWidth: breakpoints.xxl - 0.02 },
  "max-xl": { maxWidth: breakpoints.xl - 0.02 },
  "max-lg": { maxWidth: breakpoints.lg - 0.02 },
  "max-md": { maxWidth: breakpoints.md - 0.02 },
  "max-sm": { maxWidth: breakpoints.sm - 0.02 },
  "max-xs": { maxWidth: breakpoints.xs - 0.02 },
  "max-xxs": { maxWidth: breakpoints.xxs - 0.02 },
  "max-xxxs": { maxWidth: breakpoints.xxxs - 0.02 },
  xxxs: { minWidth: breakpoints.xxxs },
  xxs: { minWidth: breakpoints.xxs },
  xs: { minWidth: breakpoints.xs },
  sm: { minWidth: breakpoints.sm },
  md: { minWidth: breakpoints.md },
  lg: { minWidth: breakpoints.lg },
  xl: { minWidth: breakpoints.xl },
  xxl: { minWidth: breakpoints.xxl },
  "max-height-lg": { maxHeight: breakpoints.lg - 0.02 },
  "max-height-md": { maxHeight: breakpoints.md - 0.02 },
  "max-height-sm": { maxHeight: breakpoints.sm - 0.02 },
  "height-sm": { minHeight: breakpoints.sm },
  "height-md": { minHeight: breakpoints.md },
  "height-lg": { minHeight: breakpoints.lg },
  hoverable: { hover: "hover" },
  touchable: { pointer: "coarse" },
};

// ---- Animations (CSS transitions) ----

const easeOut = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const bouncy = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";

export const defaultAnimations: Record<string, string> = {
  "0ms": "0ms linear",
  "50ms": "50ms linear",
  "100ms": "100ms ease-out",
  "200ms": "200ms ease-out",
  "300ms": "300ms ease-out",
  "500ms": "500ms ease-out",
  superBouncy: "300ms cubic-bezier(0.175, 0.885, 0.32, 1.5)",
  bouncy: `350ms ${bouncy}`,
  kindaBouncy: "400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  lazy: `500ms ${easeOut}`,
  medium: `300ms ${easeOut}`,
  slow: `450ms ${easeOut}`,
  quick: `150ms ${easeOut}`,
  tooltip: "200ms cubic-bezier(0.175, 0.885, 0.32, 1.1)",
  quicker: `120ms ${easeOut}`,
  quickest: `80ms ${easeOut}`,
};

// ---- Config ----

/**
 * The batteries-included configuration: tamagui v5 tokens, Radix color
 * scales, generated light/dark/color/surface/component themes, system fonts,
 * responsive breakpoints and named transitions.
 */
export const defaultConfig: JamUIConfig = {
  tokens: defaultTokens,
  themes: createDefaultThemes(),
  fonts: defaultFonts,
  media: defaultMedia,
  animations: defaultAnimations,
  defaultTheme: "light",
  defaultFont: "body",
};
