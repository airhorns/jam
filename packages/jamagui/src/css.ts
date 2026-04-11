import { camelToKebab, formatCSSValue } from "./style-props";

/**
 * Track injected CSS class names to avoid duplicates.
 */
const injectedClasses = new Set<string>();

/**
 * The <style> element we inject into.
 */
let styleElement: HTMLStyleElement | null = null;

function getStyleElement(): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;
  if (styleElement) return styleElement;
  styleElement = document.createElement("style");
  styleElement.id = "jamagui-styles";
  document.head.appendChild(styleElement);
  return styleElement;
}

/**
 * Simple deterministic hash for generating class names.
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generate a deterministic CSS class name from a style object.
 */
export function generateClassName(styles: Record<string, string>): string {
  const sorted = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));
  const key = sorted.map(([k, v]) => `${k}:${v}`).join(";");
  return `_jui_${hashString(key)}`;
}

/**
 * Convert a resolved style object to a CSS declarations string.
 */
export function stylesToCSS(styles: Record<string, unknown>): Record<string, string> {
  const css: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    if (value == null || value === undefined) continue;
    const cssValue = formatCSSValue(prop, value);
    if (cssValue === "") continue;
    css[camelToKebab(prop)] = cssValue;
  }
  return css;
}

/**
 * Inject a CSS rule for a class name if not already injected.
 */
export function injectStyleRule(className: string, cssProperties: Record<string, string>): void {
  if (injectedClasses.has(className)) return;
  injectedClasses.add(className);

  const el = getStyleElement();
  if (!el) return;

  const declarations = Object.entries(cssProperties)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  el.sheet?.insertRule(`.${className} { ${declarations} }`, el.sheet.cssRules.length);
}

/**
 * Inject a pseudo-state CSS rule (e.g., :hover, :active, :focus).
 */
export function injectPseudoRule(
  className: string,
  pseudo: string,
  cssProperties: Record<string, string>,
): void {
  const key = `${className}:${pseudo}`;
  if (injectedClasses.has(key)) return;
  injectedClasses.add(key);

  const el = getStyleElement();
  if (!el) return;

  const declarations = Object.entries(cssProperties)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  el.sheet?.insertRule(
    `.${className}:${pseudo} { ${declarations} }`,
    el.sheet.cssRules.length,
  );
}

/**
 * Inject a media query CSS rule.
 */
export function injectMediaRule(
  className: string,
  mediaQuery: string,
  cssProperties: Record<string, string>,
): void {
  const key = `${className}@${mediaQuery}`;
  if (injectedClasses.has(key)) return;
  injectedClasses.add(key);

  const el = getStyleElement();
  if (!el) return;

  const declarations = Object.entries(cssProperties)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  el.sheet?.insertRule(
    `@media ${mediaQuery} { .${className} { ${declarations} } }`,
    el.sheet.cssRules.length,
  );
}

/**
 * Clear all injected styles (useful for testing).
 */
export function clearInjectedStyles(): void {
  injectedClasses.clear();
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}
