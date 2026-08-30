export { stylesToCSS } from "./style-props";

/** Rule keys already inserted, so each atomic rule is emitted exactly once. */
const injected = new Set<string>();

let styleElement: HTMLStyleElement | null = null;

function getStyleElement(): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;
  if (styleElement?.isConnected) return styleElement;
  styleElement = document.getElementById("jam-ui-styles") as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "jam-ui-styles";
    document.head.appendChild(styleElement);
  }
  return styleElement;
}

function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const abbrevCache = new Map<string, string>();

// "border-top-left-radius" → "bortoplefrad": readable in devtools, short in the DOM.
function abbreviate(cssProp: string): string {
  let out = abbrevCache.get(cssProp);
  if (out === undefined) {
    out = cssProp.replace(/^--/, "").split("-").map((s) => s.slice(0, 3)).join("");
    abbrevCache.set(cssProp, out);
  }
  return out;
}

export type AtomicOptions = {
  /** Selector suffix like ":hover" or "::placeholder". */
  pseudo?: string;
  /** Media query string; the rule is wrapped in `@media`. */
  media?: string;
  /** Index of the media key in the config; later keys get higher specificity. */
  mediaPrecedence?: number;
};

/**
 * Deterministic class name for one declaration in one context. The same
 * declaration always yields the same class, so rules dedupe across the page.
 */
export function atomicClassName(cssProp: string, value: string, options: AtomicOptions = {}): string {
  const context = `${options.pseudo ?? ""}|${options.media ?? ""}`;
  const suffix = options.pseudo ? `-${options.pseudo.replace(/[^a-z]/gi, "")}` : options.media ? "-m" : "";
  return `_${abbreviate(cssProp)}${suffix}-${hashString(`${cssProp}:${value}|${context}`)}`;
}

/** How many `:root`s prefix a pseudo rule: press beats hover, focus beats press, disabled beats all. */
const pseudoPriority: Record<string, number> = {
  "::placeholder": 1,
  ":hover": 2,
  ":active": 3,
  ":focus": 4,
  ":focus-visible": 4,
  ":focus-within": 4,
  ":disabled": 5,
};

// Media rules start above every pseudo rule, and each media precedence step is
// wider than the whole pseudo range so a later media key always wins.
const MEDIA_ROOTS = 7;
const MEDIA_STEP = 7;

/**
 * Ensure a rule exists for one declaration and return its class name.
 *
 * Specificity comes from repeated `:root` prefixes rather than insertion order:
 * pseudo rules are ranked by `pseudoPriority`, and media rules sit above them,
 * with later media keys beating earlier ones.
 */
export function injectAtomic(cssProp: string, value: string, options: AtomicOptions = {}): string {
  const className = atomicClassName(cssProp, value, options);
  if (injected.has(className)) return className;
  injected.add(className);

  const el = getStyleElement();
  if (!el?.sheet) return className;

  const declaration = `${cssProp}: ${value}`;
  const pseudo = options.pseudo ?? "";
  const priority = pseudoPriority[pseudo] ?? 0;
  const selectors = pseudo === ":disabled"
    ? [`.${className}:disabled`, `.${className}[aria-disabled="true"]`]
    : [`.${className}${pseudo}`];
  let rule: string;
  if (options.media) {
    const prefix = ":root".repeat(MEDIA_ROOTS + MEDIA_STEP * Math.max(0, options.mediaPrecedence ?? 0) + priority);
    rule = `@media ${options.media} { ${selectors.map((sel) => `${prefix} ${sel}`).join(", ")} { ${declaration} } }`;
  } else {
    const prefix = priority ? `${":root".repeat(priority)} ` : "";
    rule = `${selectors.map((sel) => `${prefix}${sel}`).join(", ")} { ${declaration} }`;
  }
  try {
    el.sheet.insertRule(rule, el.sheet.cssRules.length);
  } catch {
    // An invalid declaration (e.g. a bad custom value) shouldn't take down the render.
  }
  return className;
}

/** Insert an arbitrary rule once, keyed by `key` (for keyframes, resets, …). */
export function injectRule(key: string, ruleText: string): void {
  if (injected.has(key)) return;
  injected.add(key);
  const el = getStyleElement();
  if (!el?.sheet) return;
  try {
    el.sheet.insertRule(ruleText, el.sheet.cssRules.length);
  } catch {
    // ignore invalid rules
  }
}

/**
 * Clear all injected styles (useful for testing).
 */
export function clearInjectedStyles(): void {
  injected.clear();
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}
