import { assert, when, $, type Term } from "@jam/core";
import type { TokenCategory, TokenConfig } from "./types";

/**
 * Assert token facts into the database.
 * Each token becomes: ["token", category, key, value]
 */
export function createTokens(config: TokenConfig): void {
  for (const category of Object.keys(config) as TokenCategory[]) {
    const values = config[category];
    if (!values) continue;
    for (const [key, value] of Object.entries(values)) {
      assert("token", category, key, value as Term);
    }
  }
}

/**
 * Get a single token value by category and key.
 */
export function getToken(category: TokenCategory, key: string): string | number | undefined {
  const results = when(["token", category, key, $.value]);
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
  if (dotIndex === -1) return undefined; // Theme ref like "$background", not a token

  const category = ref.slice(1, dotIndex) as TokenCategory;
  const key = ref.slice(dotIndex + 1);
  return getToken(category, key);
}

/**
 * Check if a string is a token reference (starts with $ and contains a dot).
 */
export function isTokenRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("$") && value.includes(".");
}

/**
 * Check if a string is a theme reference (starts with $ but no dot).
 */
export function isThemeRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("$") && !value.includes(".");
}
