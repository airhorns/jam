import type { Page } from "@playwright/test";

export type CatalogEntry = { name: string; group: string; demos: string[] };

/** Load the catalog once and return the registered components. */
export async function loadRegistry(page: Page): Promise<CatalogEntry[]> {
  await page.goto("/?c=Button&chrome=0");
  await page.waitForSelector("[data-component]");
  return page.evaluate(() => (window as any).__catalog.components as CatalogEntry[]);
}

/** Navigate to one component page without the sidebar. */
export async function showComponent(page: Page, name: string, theme: "light" | "dark" = "light", demo?: number) {
  const params = new URLSearchParams({ c: name, theme, chrome: "0" });
  if (demo != null) params.set("demo", String(demo));
  await page.goto(`/?${params}`);
  await page.waitForSelector(`[data-component="${name}"]`);
  await page.evaluate(() => document.fonts?.ready);
}

/** Collect console errors and uncaught exceptions for the life of the page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
