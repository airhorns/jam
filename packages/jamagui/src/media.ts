import { set, when, $ } from "@jam/core";
import type { MediaConfig, MediaQueryConfig } from "./types";

const listeners: Array<() => void> = [];

/**
 * Set up media query listeners and assert facts for each breakpoint.
 * Each breakpoint becomes: ["media", name, true/false]
 */
export function createMedia(config: MediaConfig): void {
  // Clean up any previous listeners
  for (const cleanup of listeners) cleanup();
  listeners.length = 0;

  if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
    // SSR or test environment: just set all to false
    for (const name of Object.keys(config)) {
      set("media", name, false);
    }
    return;
  }

  for (const [name, query] of Object.entries(config)) {
    const mediaQuery = buildMediaQuery(query);
    const mql = window.matchMedia(mediaQuery);

    // Set initial value
    set("media", name, mql.matches);

    // Listen for changes
    const handler = (e: MediaQueryListEvent) => {
      set("media", name, e.matches);
    };
    mql.addEventListener("change", handler);
    listeners.push(() => mql.removeEventListener("change", handler));
  }
}

/**
 * Build a CSS media query string from a config object.
 */
function buildMediaQuery(config: MediaQueryConfig): string {
  const conditions: string[] = [];
  if (config.minWidth != null) conditions.push(`(min-width: ${config.minWidth}px)`);
  if (config.maxWidth != null) conditions.push(`(max-width: ${config.maxWidth}px)`);
  if (config.minHeight != null) conditions.push(`(min-height: ${config.minHeight}px)`);
  if (config.maxHeight != null) conditions.push(`(max-height: ${config.maxHeight}px)`);
  return conditions.join(" and ") || "all";
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

/**
 * Default media breakpoints (matching Tamagui defaults).
 */
export const defaultMediaConfig: MediaConfig = {
  xs: { maxWidth: 660 },
  sm: { maxWidth: 860 },
  md: { maxWidth: 1020 },
  lg: { maxWidth: 1280 },
  xl: { maxWidth: 1420 },
  gtXs: { minWidth: 661 },
  gtSm: { minWidth: 861 },
  gtMd: { minWidth: 1021 },
  gtLg: { minWidth: 1281 },
  short: { maxHeight: 820 },
};

/**
 * Clean up all media query listeners.
 */
export function disposeMedia(): void {
  for (const cleanup of listeners) cleanup();
  listeners.length = 0;
}
