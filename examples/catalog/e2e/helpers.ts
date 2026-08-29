import type { Page } from "@playwright/test";
import type { ShotRecipe } from "../src/types";

export type CatalogDemo = { title: string; shot?: ShotRecipe };
export type CatalogEntry = { name: string; group: string; demos: CatalogDemo[] };

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
  await page.mouse.move(0, 0);
  await page.waitForSelector(`[data-component="${name}"]`);
  await page.evaluate(() => document.fonts?.ready);
}

/** Perform a demo's shot recipe (click/hover/focus by test id). */
export async function performRecipe(page: Page, recipe: ShotRecipe) {
  for (const id of [recipe.click ?? []].flat()) await page.getByTestId(id).click();
  if (recipe.hover) await page.getByTestId(recipe.hover).hover();
  if (recipe.focus) await page.getByTestId(recipe.focus).focus();
  await page.waitForTimeout(recipe.wait ?? 400);
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
