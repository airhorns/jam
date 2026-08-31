import { test, expect, type Page } from "@playwright/test";
import { GROUPS, loadRegistry, performRecipe, trackErrors } from "./helpers";

/**
 * Mount every demo, drive its recipe, then unmount it by navigating away in-page
 * (no reload, so the fact database survives) and check nothing was left behind:
 * component-scoped facts, dismissable layers, the body scroll lock, or timers.
 */

/** Entities that legitimately outlive a demo: catalog navigation and demo-level app state. */
const APP_ENTITIES = new Set(["catalog", "demo", "toasts", "media"]);

type Snapshot = {
  facts: string[];
  overflow: string;
  layers: number;
  timers: string[];
};

declare global {
  interface Window {
    __timers: { pending(): string[] };
  }
}

async function installTimerTracker(page: Page) {
  await page.addInitScript(() => {
    const pending = new Map<number, string>();
    const originalSet = window.setTimeout;
    const originalClear = window.clearTimeout;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const stack = new Error().stack ?? "";
      const id = originalSet(
        () => {
          pending.delete(id);
          if (typeof fn === "function") fn(...args);
        },
        ms,
      );
      pending.set(id, stack);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number | string) => {
      if (id != null) pending.delete(Number(id));
      originalClear(id as number);
    }) as typeof window.clearTimeout;
    window.__timers = {
      pending: () =>
        Array.from(pending.values())
          .filter((stack) => /packages\/(ui|core)|examples\/catalog\/src/.test(stack))
          .map((stack) => stack.split("\n").slice(1, 4).join(" | ")),
    };
  });
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => ({
    facts: Array.from((window as any).__db.facts.keys() as Iterable<string>),
    overflow: document.body.style.overflow,
    layers: document.querySelectorAll("[data-layer]").length,
    timers: window.__timers.pending(),
  }));
}

async function showInPage(page: Page, component: string, demo: number | null = null) {
  await page.evaluate(([c, d]) => (window as any).__catalog.show(c, "light", d), [component, demo] as const);
  await page.mouse.move(0, 0);
}

async function hideInPage(page: Page) {
  await showInPage(page, "none");
  await page.getByText("Unknown component").waitFor();
  // Layer teardown clears its positioning facts in a microtask; give it a frame.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

function leakedFacts(before: Snapshot, after: Snapshot): string[] {
  const baseline = new Set(before.facts);
  return after.facts.filter((key) => {
    if (baseline.has(key)) return false;
    const entity = (JSON.parse(key) as unknown[])[0];
    return !(typeof entity === "string" && APP_ENTITIES.has(entity));
  });
}

for (const group of GROUPS) {
  test(`${group} demos leave nothing behind when unmounted`, async ({ page }) => {
    test.setTimeout(120_000);
    await installTimerTracker(page);
    const errors = trackErrors(page);
    const registry = (await loadRegistry(page)).filter((entry) => entry.group === group);
    expect(registry.length, `${group} has registered components`).toBeGreaterThan(0);

    await hideInPage(page);
    for (const entry of registry) {
      for (const [i, demo] of entry.demos.entries()) {
        const label = `${entry.name} › ${demo.title}`;
        const before = await snapshot(page);

        await showInPage(page, entry.name, i);
        await page.waitForSelector(`[data-component="${entry.name}"]`);
        if (demo.shot) await performRecipe(page, demo.shot);
        await hideInPage(page);

        const after = await snapshot(page);
        expect.soft(leakedFacts(before, after), `${label} leaked facts`).toEqual([]);
        expect.soft(after.overflow, `${label} left the body scroll lock on`).toBe("");
        expect.soft(after.layers, `${label} left dismissable layers mounted`).toBe(0);
        expect.soft(after.timers, `${label} left timers pending`).toEqual([]);
      }
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("the groups list covers every registered component", async ({ page }) => {
  const registry = await loadRegistry(page);
  expect(new Set(registry.map((entry) => entry.group))).toEqual(new Set(GROUPS));
});
