import { remember, transaction, when, $ } from "@jam/core";
import type { FontConfig } from "./types";

const fontNames = new Set<string>();

/**
 * Create a font configuration and assert it as facts.
 * Facts: ["font", name, property, sizeKey, value]
 * Family fact: ["font", name, "family", familyString]
 */
export function createFont(name: string, config: FontConfig): void {
  fontNames.add(name);
  fontCache.delete(name);
  transaction(() => {
    remember("font", name, "family", config.family);

    for (const [key, value] of Object.entries(config.size)) {
      remember("font", name, "size", key, value);
    }

    const tables: Array<[string, Record<string, string | number> | undefined]> = [
      ["lineHeight", config.lineHeight],
      ["weight", config.weight],
      ["letterSpacing", config.letterSpacing],
    ];
    for (const [prop, values] of tables) {
      if (!values) continue;
      for (const [key, value] of Object.entries(fillSizes(config.size, values))) {
        remember("font", name, prop, key, value);
      }
    }

    if (config.face) {
      for (const [weight, faces] of Object.entries(config.face)) {
        remember("font", name, "face", weight, faces.normal);
        if (faces.italic) {
          remember("font", name, "faceItalic", weight, faces.italic);
        }
      }
    }
  });
}

/**
 * Fill a partial per-size map so every size key has a value. Missing keys
 * take the value of the previous defined key (in size-key order); keys before
 * the first defined key take the first defined value.
 */
export function fillSizes<T>(sizes: Record<string, number>, partial: Record<string, T>): Record<string, T> {
  const defined = Object.keys(partial);
  if (defined.length === 0) return {};
  const order = sortSizeKeys(Object.keys(sizes));
  const result: Record<string, T> = {};
  let last: T = partial[sortSizeKeys(defined)[0]];
  for (const key of order) {
    if (key in partial) last = partial[key];
    result[key] = last;
  }
  return result;
}

// Numeric keys ascending, then "true" and other names in insertion order.
function sortSizeKeys(keys: string[]): string[] {
  const numeric = keys.filter((k) => !Number.isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
  const named = keys.filter((k) => Number.isNaN(Number(k)));
  return [...numeric, ...named];
}

export function hasFont(name: string): boolean {
  return fontNames.has(name);
}

export function resetFontCache(): void {
  fontNames.clear();
  fontCache.clear();
}

export type ResolvedFont = {
  family: string;
  size: Record<string, number>;
  lineHeight: Record<string, number>;
  weight: Record<string, string>;
  letterSpacing: Record<string, number>;
};

const fontCache = new Map<string, ResolvedFont>();

/** A font's full tables, keyed both as "4" and "$4" (for functional variants). */
export function getFont(name: string): ResolvedFont | undefined {
  if (!fontNames.has(name)) return undefined;
  const cached = fontCache.get(name);
  if (cached) return cached;
  const font: ResolvedFont = { family: "", size: {}, lineHeight: {}, weight: {}, letterSpacing: {} };
  for (const r of when(["font", name, $.prop, $.key, $.value])) {
    const table = (font as unknown as Record<string, Record<string, unknown>>)[r.prop as string];
    if (!table) continue;
    table[r.key as string] = r.value;
    table[`$${r.key as string}`] = r.value;
  }
  font.family = getFontFamily(name) ?? "";
  fontCache.set(name, font);
  return font;
}

/** The `font-family` string for a configured font. */
export function getFontFamily(fontName: string): string | undefined {
  const results = when(["font", fontName, "family", $.value]);
  return results.length > 0 ? (results[0].value as string) : undefined;
}

export type FontProperty = "size" | "lineHeight" | "weight" | "letterSpacing";

/** One value from a font's per-size tables, e.g. `getFontValue("body", "size", "4")`. */
export function getFontValue(fontName: string, prop: FontProperty, sizeKey: string): string | number | undefined {
  const key = sizeKey.startsWith("$") ? sizeKey.slice(1) : sizeKey;
  const results = when(["font", fontName, prop, key, $.value]);
  return results.length > 0 ? (results[0].value as string | number) : undefined;
}

/**
 * Concrete text styles for a font at a size key, for use outside of `styled`.
 */
export function getFontStyles(
  fontName: string,
  sizeKey: string,
): {
  fontFamily: string;
  fontSize: number;
  lineHeight: number | undefined;
  fontWeight: string | undefined;
  letterSpacing: number | undefined;
} {
  return {
    fontFamily: getFontFamily(fontName) ?? "",
    fontSize: (getFontValue(fontName, "size", sizeKey) as number | undefined) ?? 14,
    lineHeight: getFontValue(fontName, "lineHeight", sizeKey) as number | undefined,
    fontWeight: getFontValue(fontName, "weight", sizeKey) as string | undefined,
    letterSpacing: getFontValue(fontName, "letterSpacing", sizeKey) as number | undefined,
  };
}
