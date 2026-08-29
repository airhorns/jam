import { set, when, $ } from "@jam/core";
import type { MediaConfig, MediaQueryConfig } from "./types";

const listeners: Array<() => void> = [];

// Config (not state): the query string and precedence of each media key.
const mediaQueries = new Map<string, string>();

/**
 * Register media queries. Each key gets a `["media", name, matches]` fact kept
 * in sync with `matchMedia`, and a CSS query string for `$name={{ … }}` props.
 * Later keys take precedence over earlier ones when several match.
 */
export function createMedia(config: MediaConfig): void {
  disposeMedia();
  mediaQueries.clear();

  const canMatch = typeof window !== "undefined" && typeof window.matchMedia === "function";
  for (const [name, query] of Object.entries(config)) {
    const queryString = buildMediaQuery(query);
    mediaQueries.set(name, queryString);
    if (!canMatch) {
      set("media", name, false);
      continue;
    }
    const mql = window.matchMedia(queryString);
    set("media", name, mql.matches);
    const handler = (e: MediaQueryListEvent) => set("media", name, e.matches);
    mql.addEventListener("change", handler);
    listeners.push(() => mql.removeEventListener("change", handler));
  }
}

/** Build a CSS media query string from a config object. */
export function buildMediaQuery(config: MediaQueryConfig): string {
  const conditions: string[] = [];
  if (config.minWidth != null) conditions.push(`(min-width: ${config.minWidth}px)`);
  if (config.maxWidth != null) conditions.push(`(max-width: ${config.maxWidth}px)`);
  if (config.minHeight != null) conditions.push(`(min-height: ${config.minHeight}px)`);
  if (config.maxHeight != null) conditions.push(`(max-height: ${config.maxHeight}px)`);
  if (config.hover != null) conditions.push(`(hover: ${config.hover})`);
  if (config.pointer != null) conditions.push(`(pointer: ${config.pointer})`);
  if (config.orientation != null) conditions.push(`(orientation: ${config.orientation})`);
  if (config.prefersColorScheme != null) conditions.push(`(prefers-color-scheme: ${config.prefersColorScheme})`);
  return conditions.join(" and ") || "all";
}

/** The CSS query string registered for a media key, if any. */
export function getMediaQuery(name: string): string | undefined {
  return mediaQueries.get(name);
}

/** Position of a media key in the config; later keys override earlier ones. */
export function getMediaPrecedence(name: string): number {
  let i = 0;
  for (const key of mediaQueries.keys()) {
    if (key === name) return i;
    i++;
  }
  return -1;
}

export function isMediaKey(name: string): boolean {
  return mediaQueries.has(name);
}

/**
 * Get the current media query state as a reactive object.
 * Returns { breakpointName: boolean, ... }
 */
export function useMedia(): Record<string, boolean> {
  const results = when(["media", $.name, $.value]);
  const media: Record<string, boolean> = {};
  for (const r of results) {
    media[r.name as string] = r.value as boolean;
  }
  return media;
}

/** Clean up all media query listeners. */
export function disposeMedia(): void {
  for (const cleanup of listeners) cleanup();
  listeners.length = 0;
}
