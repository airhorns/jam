import { test, expect } from "@playwright/test";
import { loadRegistry, performRecipe, showComponent, trackErrors } from "./helpers";

test.describe("catalog smoke", () => {
  test("every component page renders all its demos without errors", async ({ page }) => {
    const errors = trackErrors(page);
    const registry = await loadRegistry(page);
    expect(registry.length).toBeGreaterThan(20);

    for (const entry of registry) {
      for (const theme of ["light", "dark"] as const) {
        await showComponent(page, entry.name, theme);
        const cards = page.locator("[data-demo]");
        await expect(cards, `${entry.name} (${theme}) demo count`).toHaveCount(entry.demos.length);
        for (let i = 0; i < entry.demos.length; i++) {
          const body = cards.nth(i).locator(":scope > :last-child");
          const childCount = await body.evaluate((el) => el.childNodes.length);
          expect(childCount, `${entry.name} demo "${entry.demos[i].title}" has content`).toBeGreaterThan(0);
        }
      }
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("every shot recipe can be performed without errors", async ({ page }) => {
    const errors = trackErrors(page);
    const registry = await loadRegistry(page);
    for (const entry of registry) {
      for (const [i, demo] of entry.demos.entries()) {
        if (!demo.shot) continue;
        await showComponent(page, entry.name, "light", i);
        await performRecipe(page, demo.shot);
      }
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the sidebar navigates between components and toggles theme", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await page.locator("[data-nav='Card']").click();
    await expect(page.locator("[data-component='Card']")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("c")).toBe("Card");

    await page.getByTestId("theme-toggle").click();
    expect(new URL(page.url()).searchParams.get("theme")).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe("rgb(255, 255, 255)");
  });

  test("the all-components page renders every registered component", async ({ page }) => {
    const registry = await loadRegistry(page);
    await page.goto("/?c=all&chrome=0");
    await expect(page.locator("[data-component]")).toHaveCount(registry.length);
  });
});
