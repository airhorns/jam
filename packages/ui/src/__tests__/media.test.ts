import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resetUI } from "../testing";
import { replace } from "@jam/core";
import { createMedia, useMedia, disposeMedia, buildMediaQuery, getMediaQuery, getMediaPrecedence, isMediaKey } from "../media";

beforeEach(() => {
  resetUI();
  disposeMedia();
});

afterEach(() => {
  disposeMedia();
  vi.restoreAllMocks();
});

describe("createMedia", () => {
  it("sets media facts to false in test environment (no window.matchMedia)", () => {
    // vitest has a node environment by default, no matchMedia
    const originalMatchMedia = globalThis.window?.matchMedia;
    if (globalThis.window) {
      // @ts-ignore
      delete globalThis.window.matchMedia;
    }

    createMedia({
      sm: { maxWidth: 860 },
      gtSm: { minWidth: 861 },
    });

    const media = useMedia();
    expect(media.sm).toBe(false);
    expect(media.gtSm).toBe(false);

    // Restore
    if (globalThis.window && originalMatchMedia) {
      globalThis.window.matchMedia = originalMatchMedia;
    }
  });

  it("works with mock matchMedia", () => {
    const listeners = new Map<string, (e: { matches: boolean }) => void>();

    // Mock matchMedia
    const mockMatchMedia = vi.fn((query: string) => ({
      matches: query.includes("max-width: 860px"), // Pretend viewport <= 860
      media: query,
      addEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
        listeners.set(query, handler);
      },
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // @ts-ignore
    globalThis.window = globalThis.window || {};
    // @ts-ignore
    globalThis.window.matchMedia = mockMatchMedia;

    createMedia({
      sm: { maxWidth: 860 },
      lg: { maxWidth: 1280 },
    });

    const media = useMedia();
    expect(media.sm).toBe(true); // viewport <= 860
    expect(media.lg).toBe(false); // query doesn't match our mock

    listeners.get("(max-width: 860px)")!({ matches: false });
    listeners.get("(max-width: 1280px)")!({ matches: true });
    expect(useMedia()).toEqual({ sm: false, lg: true });
  });

  it("records each key's query string and precedence", () => {
    createMedia({ sm: { maxWidth: 860 }, portrait: { orientation: "portrait" }, dark: { prefersColorScheme: "dark" } });
    expect(getMediaQuery("sm")).toBe("(max-width: 860px)");
    expect(getMediaQuery("portrait")).toBe("(orientation: portrait)");
    expect(getMediaQuery("dark")).toBe("(prefers-color-scheme: dark)");
    expect(getMediaQuery("xl")).toBeUndefined();
    expect(getMediaPrecedence("sm")).toBe(0);
    expect(getMediaPrecedence("dark")).toBe(2);
    expect(getMediaPrecedence("xl")).toBe(-1);
    expect(isMediaKey("portrait")).toBe(true);
    expect(isMediaKey("xl")).toBe(false);
  });
});

describe("buildMediaQuery", () => {
  it("joins every condition with `and`, or matches everything when there are none", () => {
    expect(buildMediaQuery({ minWidth: 100, maxWidth: 200, minHeight: 300, maxHeight: 400, hover: "hover", pointer: "fine" })).toBe(
      "(min-width: 100px) and (max-width: 200px) and (min-height: 300px) and (max-height: 400px) and (hover: hover) and (pointer: fine)",
    );
    expect(buildMediaQuery({})).toBe("all");
  });
});

describe("useMedia", () => {
  it("returns an empty object when no media is configured", () => {
    expect(useMedia()).toEqual({});
  });

  it("returns all configured breakpoints", () => {
    // Directly set media facts for testing without matchMedia
    replace("media", "sm", true);
    replace("media", "md", false);
    replace("media", "lg", false);

    const media = useMedia();
    expect(media.sm).toBe(true);
    expect(media.md).toBe(false);
    expect(media.lg).toBe(false);
  });
});
