import { assert, retract, set, when, $, _ } from "@jam/core";
import type { ThemeValues } from "./types";

/**
 * Assert theme facts into the database.
 * Each theme value becomes: ["theme", themeName, key, value]
 */
export function createThemes(themes: Record<string, ThemeValues>): void {
  for (const [name, values] of Object.entries(themes)) {
    for (const [key, value] of Object.entries(values)) {
      assert("theme", name, key, value);
    }
  }
}

/**
 * Set the active theme by name.
 */
export function setTheme(name: string): void {
  set("ui", "theme", name);
}

/**
 * Get the active theme name.
 */
export function getActiveThemeName(): string | undefined {
  const results = when(["ui", "theme", $.name]);
  return results.length > 0 ? (results[0].name as string) : undefined;
}

/**
 * Get all values for a specific theme.
 */
export function getThemeValues(name: string): Record<string, string> {
  const results = when(["theme", name, $.key, $.value]);
  const values: Record<string, string> = {};
  for (const r of results) {
    values[r.key as string] = r.value as string;
  }
  return values;
}

/**
 * Resolve a theme key with fallback through the underscore nesting chain.
 * E.g. "dark_green_Button" -> "dark_green" -> "dark" -> undefined
 */
function resolveThemeKey(themeName: string, key: string): string | undefined {
  let current: string | undefined = themeName;
  while (current) {
    const results = when(["theme", current, key, $.value]);
    if (results.length > 0) return results[0].value as string;
    // Walk up: "dark_green_Button" -> "dark_green" -> "dark"
    const lastUnderscore = current.lastIndexOf("_");
    current = lastUnderscore > 0 ? current.slice(0, lastUnderscore) : undefined;
  }
  return undefined;
}

/**
 * Get the current theme values with nesting resolution.
 * Reads the active theme name, then resolves all keys from that theme
 * with fallback through underscore nesting.
 */
export function useTheme(): Record<string, string> {
  const activeTheme = getActiveThemeName();
  if (!activeTheme) return {};

  // Get all keys defined across the theme and its parents
  const allKeys = new Set<string>();
  let current: string | undefined = activeTheme;
  while (current) {
    const results = when(["theme", current, $.key, $.value]);
    for (const r of results) allKeys.add(r.key as string);
    const lastUnderscore = current.lastIndexOf("_");
    current = lastUnderscore > 0 ? current.slice(0, lastUnderscore) : undefined;
  }

  const resolved: Record<string, string> = {};
  for (const key of allKeys) {
    const value = resolveThemeKey(activeTheme, key);
    if (value !== undefined) resolved[key] = value;
  }
  return resolved;
}

/**
 * Resolve a single theme reference like "$background" to its current value.
 */
export function resolveThemeValue(ref: string): string | undefined {
  const activeTheme = getActiveThemeName();
  if (!activeTheme) return undefined;
  const key = ref.slice(1); // Remove leading $
  return resolveThemeKey(activeTheme, key);
}

/**
 * Add a new theme at runtime.
 */
export function addTheme(name: string, values: ThemeValues): void {
  for (const [key, value] of Object.entries(values)) {
    assert("theme", name, key, value);
  }
}

/**
 * Update an existing theme's values at runtime.
 */
export function updateTheme(name: string, values: Partial<ThemeValues>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value == null) continue;
    // Retract old value for this key if it exists
    retract("theme", name, key, _);
    assert("theme", name, key, value);
  }
}

/**
 * Inject CSS custom properties for all themes.
 * Each theme gets a CSS class `.t_{themeName}` with variables.
 */
export function injectThemeCSS(): void {
  if (typeof document === "undefined") return;

  let styleEl = document.getElementById("jamagui-themes") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "jamagui-themes";
    document.head.appendChild(styleEl);
  }

  // Find all theme names
  const themeResults = when(["theme", $.name, $.key, $.value]);
  const themes = new Map<string, Map<string, string>>();
  for (const r of themeResults) {
    const name = r.name as string;
    if (!themes.has(name)) themes.set(name, new Map());
    themes.get(name)!.set(r.key as string, r.value as string);
  }

  const rules: string[] = [];
  for (const [name, values] of themes) {
    const vars = Array.from(values.entries())
      .map(([key, value]) => `--${key}: ${value}`)
      .join("; ");
    rules.push(`.t_${name} { ${vars} }`);
  }

  styleEl.textContent = rules.join("\n");
}
