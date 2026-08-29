import type { VariantExtras, VariantFunction, VariantSpec } from "./styled";

type StyleObject = Record<string, unknown>;

const tokenKey = (value: unknown): string => (typeof value === "string" && value.startsWith("$") ? value.slice(1) : String(value));

/** Numeric value of a token in a category, or the number itself. */
export function tokenValue(tokens: VariantExtras["tokens"], category: string, value: unknown): number | undefined {
  if (typeof value === "number") return value;
  const v = tokens[category]?.[tokenKey(value)];
  return typeof v === "number" ? v : undefined;
}

/**
 * Step a token up or down its category's scale: `stepToken(tokens, "size", "$4", 1)` → "$4.5".
 * `true` is skipped over so a shift of ±1 always lands on a different value.
 */
export function stepToken(tokens: VariantExtras["tokens"], category: string, current: unknown, shift: number): string {
  const table = tokens[category] ?? {};
  const keys = Object.keys(table)
    .filter((k) => !k.startsWith("$") && k !== "true")
    .sort((a, b) => (table[a] as number) - (table[b] as number));
  let key = tokenKey(current);
  if (key === "true") {
    const trueValue = table.true;
    key = keys.find((k) => table[k] === trueValue) ?? key;
  }
  const index = keys.indexOf(key);
  if (index === -1) return `$${key}`;
  return `$${keys[Math.min(keys.length - 1, Math.max(0, index + shift))]}`;
}

/** Pick the specific size key that `true` aliases (so `$true` → `$4`). */
export function defaultSizeKey(table: Record<string, unknown> | undefined): string {
  if (!table) return "4";
  const trueValue = table.true;
  if (trueValue === undefined) return "4";
  return Object.keys(table).find((k) => k !== "true" && !k.startsWith("$") && table[k] === trueValue) ?? "true";
}

// ---- Sizing ----

/**
 * Button-like sizing from a size token: horizontal padding from the matching
 * space token, height from the size token, radius from the matching radius token.
 */
export const getButtonSized: VariantFunction = (value, { tokens, props }) => {
  if (value == null || props.circular) return null;
  if (typeof value === "number") {
    return { paddingHorizontal: value * 0.25, height: value, borderRadius: value * 0.2 };
  }
  const key = tokenKey(value);
  return {
    paddingHorizontal: tokens.space?.[key] ?? tokens.space?.true,
    height: tokens.size?.[key] ?? tokens.size?.true,
    borderRadius: tokens.radius?.[key] ?? tokens.radius?.true,
  };
};

/** Square sizing: width and height from a size token (Avatar, Square, Checkbox…). */
export const getSquareSized: VariantFunction = (value, { tokens }) => {
  const size = tokenValue(tokens, "size", value) ?? value;
  if (size == null) return null;
  return { width: size, height: size, minWidth: size, minHeight: size };
};

/** Padding from the matching space token, radius from the matching radius token (Card, ListItem…). */
export const getSpaceSized: VariantFunction = (value, { tokens }) => {
  if (value == null) return null;
  if (typeof value === "number") return { padding: value, borderRadius: value * 0.5 };
  const key = tokenKey(value);
  return {
    padding: tokens.space?.[key] ?? tokens.space?.true,
    borderRadius: tokens.radius?.[key] ?? tokens.radius?.true,
  };
};

/**
 * Text sizing from a font size token: fontSize, lineHeight, fontWeight and
 * letterSpacing from the font in effect. `$true` maps to the font's default size.
 */
export const getFontSized: VariantFunction = (value = "$true", { font }) => {
  if (!font) return { fontSize: value };
  if (typeof value === "number") return { fontSize: value };
  const key = tokenKey(value) === "true" ? defaultSizeKey(font.size) : tokenKey(value);
  const style: StyleObject = {};
  const fontSize = font.size[key];
  const lineHeight = font.lineHeight[key];
  const fontWeight = font.weight[key];
  const letterSpacing = font.letterSpacing[key];
  if (fontSize !== undefined) style.fontSize = fontSize;
  if (lineHeight !== undefined) style.lineHeight = lineHeight;
  if (fontWeight !== undefined) style.fontWeight = fontWeight;
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing;
  return style;
};

// ---- Elevation ----

export function getSizedElevation(value: number | boolean | string, { tokens, theme }: VariantExtras): StyleObject | null {
  let num: number;
  if (value === true) {
    num = tokenValue(tokens, "size", "true") ?? 10;
  } else if (typeof value === "string") {
    num = tokenValue(tokens, "size", value) ?? Number(value.replace("$", ""));
  } else {
    num = Number(value);
  }
  if (!num || Number.isNaN(num)) return null;
  const height = Math.round(num / 4 + 1);
  const shadowRadius = Math.round(num / 2 + 2);
  return {
    shadowColor: theme.shadowColor ?? "rgba(0,0,0,0.15)",
    shadowRadius,
    shadowOffset: { height, width: 0 },
  };
}

/** `elevation` variant: a size token or number becomes a soft drop shadow. */
export const getElevation: VariantFunction = (value, extras) => {
  if (!value) return null;
  return getSizedElevation(value as number | string | boolean, extras);
};

// ---- Themeable variants (shared by Card, ListItem, Button …) ----

const chromelessStyle: StyleObject = {
  backgroundColor: "transparent",
  borderColor: "transparent",
  shadowColor: "transparent",
  hoverStyle: { borderColor: "transparent" },
};

export const themeableVariants: Record<string, VariantSpec> = {
  circular: {
    true: (_: boolean, { props, tokens }) => {
      const circular: StyleObject = { borderRadius: 100_000, padding: 0 };
      if (!("size" in props) || props.size == null) return circular;
      const size = tokenValue(tokens, "size", props.size) ?? props.size;
      return { ...circular, width: size, height: size, maxWidth: size, maxHeight: size, minWidth: size, minHeight: size };
    },
  },
  elevate: {
    true: (_: boolean, extras) => getElevation(extras.props.size ?? true, extras),
  },
  elevation: {
    "...size": getElevation,
    ":number": getElevation,
  },
  bordered: {
    true: { borderWidth: 1, borderStyle: "solid", borderColor: "$borderColor" },
    ":number": (value: number) => ({ borderWidth: value, borderStyle: "solid", borderColor: "$borderColor" }),
  },
  transparent: {
    true: { backgroundColor: "transparent" },
  },
  chromeless: {
    true: chromelessStyle,
    all: {
      ...chromelessStyle,
      hoverStyle: chromelessStyle,
      pressStyle: chromelessStyle,
      focusStyle: chromelessStyle,
    },
  },
  fullscreen: {
    true: { position: "absolute", inset: 0 },
  },
};
