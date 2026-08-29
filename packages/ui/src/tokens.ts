import { remember, when, $, type Term } from "@jam/core";
import type { TokenCategory, TokenConfig } from "./types";

const knownCategories = new Set<string>(["size", "space", "radius", "color", "zIndex"]);

// Snapshot of every token keyed both as "4" and "$4", handed to functional variants.
let tokenSnapshot: Record<string, Record<string, string | number>> | null = null;

/**
 * Assert token facts into the database.
 * Each token becomes: ["token", category, key, value]
 */
export function createTokens(config: TokenConfig): void {
  tokenSnapshot = null;
  for (const category of Object.keys(config) as TokenCategory[]) {
    const values = config[category];
    if (!values) continue;
    knownCategories.add(category);
    for (const [key, value] of Object.entries(values)) {
      remember("token", category, key, value as Term);
    }
  }
}

/**
 * Get a single token value by category and key. Accepts keys with or without
 * the leading `$`.
 */
export function getToken(category: TokenCategory | string, key: string): string | number | undefined {
  const k = key.startsWith("$") ? key.slice(1) : key;
  const results = when(["token", category, k, $.value]);
  return results.length > 0 ? (results[0].value as string | number) : undefined;
}

/**
 * Resolve a token reference string like "$size.4" or "$color.blue" to its value.
 * Returns undefined if the reference is invalid or the token doesn't exist.
 * Non-token strings are returned as-is.
 */
export function resolveTokenValue(ref: unknown): string | number | undefined {
  if (typeof ref === "number") return ref;
  if (typeof ref !== "string") return undefined;
  if (!ref.startsWith("$")) return ref as string;

  const dotIndex = ref.indexOf(".");
  if (dotIndex === -1) return undefined;

  const category = ref.slice(1, dotIndex);
  const key = ref.slice(dotIndex + 1);
  return getToken(category, key);
}

/**
 * Resolve a bare token like "$4", "$true" or "$-2" against a specific category.
 * Fully-qualified refs ("$space.4") resolve regardless of category.
 */
export function resolveTokenIn(category: TokenCategory | string, ref: string): string | number | undefined {
  if (isTokenRef(ref)) return resolveTokenValue(ref);
  if (!ref.startsWith("$")) return undefined;
  return getToken(category, ref.slice(1));
}

/**
 * Check if a string is a fully-qualified token reference: `$<category>.<key>`
 * where the category is a known token category. Bare tokens like "$0.5" are
 * not qualified refs.
 */
export function isTokenRef(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("$")) return false;
  const dot = value.indexOf(".");
  return dot > 1 && knownCategories.has(value.slice(1, dot));
}

/**
 * Check if a string is a theme or bare-token reference (starts with `$` and is
 * not a qualified token ref).
 */
export function isThemeRef(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("$") && value.length > 1 && !isTokenRef(value);
}

/** Drop the cached token snapshot (call after clearing the database). */
export function resetTokenCache(): void {
  tokenSnapshot = null;
}

/** Every token as `{ size: { "4": 44, "$4": 44, … }, … }`; used by functional variants. */
export function getTokens(): Record<string, Record<string, string | number>> {
  if (tokenSnapshot) return tokenSnapshot;
  const out: Record<string, Record<string, string | number>> = {};
  for (const r of when(["token", $.category, $.key, $.value])) {
    const cat = (out[r.category as string] ??= {});
    cat[r.key as string] = r.value as string | number;
    cat[`$${r.key as string}`] = r.value as string | number;
  }
  tokenSnapshot = out;
  return out;
}
