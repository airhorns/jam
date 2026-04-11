import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db, set } from "@jam/core";
import { createMedia, useMedia, disposeMedia } from "../media";

beforeEach(() => {
  db.clear();
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
  });
});

describe("useMedia", () => {
  it("returns an empty object when no media is configured", () => {
    expect(useMedia()).toEqual({});
  });

  it("returns all configured breakpoints", () => {
    // Directly set media facts for testing without matchMedia
    set("media", "sm", true);
    set("media", "md", false);
    set("media", "lg", false);

    const media = useMedia();
    expect(media.sm).toBe(true);
    expect(media.md).toBe(false);
    expect(media.lg).toBe(false);
  });
});
