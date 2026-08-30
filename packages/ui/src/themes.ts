import { assert, retract, set, transaction, when, $, _ } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import type { ThemeValues } from "./types";

// Facts are the source of truth (["theme", name, key, value]); these caches
// make the per-render lookups cheap. They're rebuilt whenever themes change.
const themeNames = new Set<string>();
const themeKeys = new Set<string>();
const resolvedCache = new Map<string, Record<string, string>>();
const injectedThemes = new Set<string>();

let themeClassTarget: "html" | "body" | false = "html";

const parentOf = (name: string): string | undefined => {
  const i = name.lastIndexOf("_");
  return i > 0 ? name.slice(0, i) : undefined;
};

function registerTheme(name: string, values: ThemeValues): void {
  themeNames.add(name);
  for (const key of Object.keys(values)) themeKeys.add(key);
  resolvedCache.clear();
}

/**
 * Assert theme facts into the database.
 * Each theme value becomes: ["theme", themeName, key, value]
 */
export function createThemes(themes: Record<string, ThemeValues>): void {
  transaction(() => {
    for (const [name, values] of Object.entries(themes)) {
      registerTheme(name, values);
      for (const [key, value] of Object.entries(values)) {
        assert("theme", name, key, value);
      }
    }
  });
}

/** Add a new theme at runtime. */
export function addTheme(name: string, values: ThemeValues): void {
  createThemes({ [name]: values });
}

/** Update an existing theme's values at runtime; injected CSS is refreshed. */
export function updateTheme(name: string, values: Partial<ThemeValues>): void {
  transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) continue;
      retract("theme", name, key, _);
      assert("theme", name, key, value);
    }
  });
  registerTheme(name, values as ThemeValues);
  if (injectedThemes.has(name)) rewriteThemeRule(name);
}

/** Forget cached theme metadata (call after clearing the database). */
export function resetThemeCache(): void {
  themeNames.clear();
  themeKeys.clear();
  resolvedCache.clear();
  injectedThemes.clear();
}

export function hasTheme(name: string): boolean {
  return themeNames.has(name);
}

export function getThemeNames(): string[] {
  return [...themeNames];
}

/** Whether any registered theme defines this key (so `$key` is a theme ref). */
export function isThemeKey(key: string): boolean {
  return themeKeys.has(key);
}

/** The values a theme defines itself, without parent fallback. */
export function getThemeValues(name: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const r of when(["theme", name, $.key, $.value])) {
    values[r.key as string] = r.value as string;
  }
  return values;
}

/** A theme's values merged over its parents (`dark_blue_Button` ← `dark_blue` ← `dark`). */
export function getResolvedThemeValues(name: string): Record<string, string> {
  const cached = resolvedCache.get(name);
  if (cached) return cached;
  const parent = parentOf(name);
  const resolved = { ...(parent ? getResolvedThemeValues(parent) : {}), ...getThemeValues(name) };
  resolvedCache.set(name, resolved);
  return resolved;
}

// ---- Active theme ----

/** Set the root theme by name. Writes the theme class onto the configured root element. */
export function setTheme(name: string): void {
  set("ui", "theme", name);
  applyRootThemeClass(name);
}

export function getActiveThemeName(): string | undefined {
  const results = when(["ui", "theme", $.name]);
  return results.length > 0 ? (results[0].name as string) : undefined;
}

export function setThemeClassTarget(target: "html" | "body" | false): void {
  themeClassTarget = target;
}

function applyRootThemeClass(name: string): void {
  if (typeof document === "undefined" || !themeClassTarget) return;
  const el = themeClassTarget === "body" ? document.body : document.documentElement;
  if (!el) return;
  for (const cls of Array.from(el.classList)) {
    if (cls.startsWith("t_")) el.classList.remove(cls);
  }
  for (const cls of themeClassNames(name).split(" ")) el.classList.add(cls);
  ensureThemeCSS(name);
  ensureBodyRule();
}

let bodyRuleInjected = false;

// The page itself picks up the root theme's colors, like tamagui's reset.
function ensureBodyRule(): void {
  if (bodyRuleInjected) return;
  const sheet = getThemeStyleElement()?.sheet;
  if (!sheet) return;
  bodyRuleInjected = true;
  sheet.insertRule("body { background-color: var(--background); color: var(--color); }", 0);
}

// ---- Context ----

/** The theme name in effect for the component being rendered (undefined outside any Theme). */
export const ThemeContext = createContext<string | undefined>(undefined);

/** The theme name in effect for the current component: nearest Theme/theme prop, else the root theme. */
export function useThemeName(): string | undefined {
  return useContext(ThemeContext) ?? getActiveThemeName();
}

/** Resolved values of the theme in effect for the current component. */
export function useTheme(): Record<string, string> {
  const name = useThemeName();
  if (!name) return {};
  // Track the facts so callers re-run when the theme's values change.
  when(["theme", name, $.key, $.value]);
  return getResolvedThemeValues(name);
}

/** Resolve a theme reference like "$background" to its concrete value. */
export function resolveThemeValue(ref: string, themeName?: string): string | undefined {
  const name = themeName ?? useThemeName();
  if (!name) return undefined;
  const key = ref.startsWith("$") ? ref.slice(1) : ref;
  return getResolvedThemeValues(name)[key];
}

// ---- Name resolution ----

function invertScheme(name: string): string | undefined {
  if (name.startsWith("light")) return `dark${name.slice(5)}`;
  if (name.startsWith("dark")) return `light${name.slice(4)}`;
  return undefined;
}

/**
 * Work out which theme applies given the parent theme plus an optional
 * `theme` prop and component name, the way tamagui nests themes:
 *
 *   resolveThemeName("light", "blue")               → "light_blue"
 *   resolveThemeName("light_blue", undefined, "Button") → "light_blue_Button"
 *   resolveThemeName("light_blue", "accent")        → "light_blue_accent"
 *   resolveThemeName("light_blue_Button", "red")    → "light_red" (walks up the parent chain)
 *   resolveThemeName("light_Card", undefined, "Button") → "light_Button" (component themes never nest)
 *   resolveThemeName("light", "dark_blue")          → "dark_blue" (full names win)
 *
 * Returns the parent when nothing more specific exists.
 */
export function resolveThemeName(
  parent: string | undefined,
  name?: string,
  componentName?: string,
  inverse?: boolean,
): string | undefined {
  let base = parent;
  if (inverse && base) {
    const inverted = invertScheme(base);
    if (inverted && hasTheme(inverted)) base = inverted;
  }
  if (name?.startsWith("$")) name = name.slice(1);
  const scope = base && (name || componentName) ? withoutComponentTheme(base) : base;

  if (name) {
    const parts = scope ? scope.split("_") : [];
    for (let i = parts.length; i >= 1; i--) {
      const prefix = parts.slice(0, i).join("_");
      if (componentName && hasTheme(`${prefix}_${name}_${componentName}`)) return `${prefix}_${name}_${componentName}`;
      if (hasTheme(`${prefix}_${name}`)) return `${prefix}_${name}`;
    }
    if (componentName && hasTheme(`${name}_${componentName}`)) return `${name}_${componentName}`;
    if (hasTheme(name)) return name;
  }
  if (componentName && scope && hasTheme(`${scope}_${componentName}`)) return `${scope}_${componentName}`;
  return base;
}

/** Component theme segments start with a capital: "light_blue_Button" → "light_blue". */
function withoutComponentTheme(themeName: string): string {
  const parts = themeName.split("_");
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last && last[0] !== last[0].toLowerCase()) parts.pop();
  return parts.join("_");
}

// ---- CSS ----

/** The class chain for a theme: "t_light t_light_blue t_light_blue_Button". */
export function themeClassNames(name: string): string {
  const parts = name.split("_");
  const classes: string[] = [];
  for (let i = 1; i <= parts.length; i++) classes.push(`t_${parts.slice(0, i).join("_")}`);
  return classes.join(" ");
}

let themeStyleEl: HTMLStyleElement | null = null;

function getThemeStyleElement(): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;
  if (themeStyleEl?.isConnected) return themeStyleEl;
  themeStyleEl = document.getElementById("jamagui-themes") as HTMLStyleElement | null;
  if (!themeStyleEl) {
    themeStyleEl = document.createElement("style");
    themeStyleEl.id = "jamagui-themes";
    document.head.appendChild(themeStyleEl);
  }
  return themeStyleEl;
}

function themeRuleText(name: string): string {
  const vars = Object.entries(getThemeValues(name))
    .map(([key, value]) => `--${key}: ${value}`)
    .join("; ");
  return `.t_${name} { ${vars} }`;
}

/**
 * Inject the CSS variables for a theme (and its parents, first) if not
 * already present. Parents come first so a child's `.t_light_blue` rule
 * overrides `.t_light` when both classes sit on the same element.
 */
export function ensureThemeCSS(name: string): void {
  if (injectedThemes.has(name) || !hasTheme(name)) return;
  const parent = parentOf(name);
  if (parent) ensureThemeCSS(parent);
  injectedThemes.add(name);
  const el = getThemeStyleElement();
  if (!el?.sheet) return;
  el.sheet.insertRule(themeRuleText(name), el.sheet.cssRules.length);
}

function rewriteThemeRule(name: string): void {
  const sheet = getThemeStyleElement()?.sheet;
  if (!sheet) return;
  const selector = `.t_${name}`;
  for (let i = 0; i < sheet.cssRules.length; i++) {
    const rule = sheet.cssRules[i] as CSSStyleRule;
    if (rule.selectorText === selector) {
      sheet.deleteRule(i);
      sheet.insertRule(themeRuleText(name), i);
      return;
    }
  }
}

/** Inject CSS variables for every registered theme up front. */
export function injectThemeCSS(): void {
  for (const name of themeNames) ensureThemeCSS(name);
}

/** Remove injected theme CSS (for tests). */
export function clearThemeCSS(): void {
  injectedThemes.clear();
  bodyRuleInjected = false;
  if (themeStyleEl) {
    themeStyleEl.remove();
    themeStyleEl = null;
  }
}

// ---- Theme component ----

export type ThemeProps = {
  /** Sub-theme name ("blue", "accent", "dark_red"); resolved relative to the parent theme. */
  name?: string;
  /** Swap light and dark for this subtree. */
  inverse?: boolean;
  children?: VChild | VChild[];
};

/**
 * Apply a theme to a subtree. Renders a `display: contents` span carrying
 * the theme classes and provides the theme name to descendants.
 */
export function Theme(props: ThemeProps): VNode {
  const parent = useThemeName();
  const resolved = resolveThemeName(parent, props.name, undefined, props.inverse);
  const kids = Array.isArray(props.children) ? props.children : props.children == null ? [] : [props.children];
  if (!resolved || resolved === parent) {
    return h("span", { style: "display: contents" }, ...kids);
  }
  ensureThemeCSS(resolved);
  return h(
    "span",
    { class: `${themeClassNames(resolved)} is_Theme`, style: "display: contents; color: var(--color)" },
    h(ThemeContext.Provider, { value: resolved }, ...kids),
  );
}
Theme.displayName = "Theme";
