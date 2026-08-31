import { test, expect } from "@playwright/test";
import { GROUPS, loadRegistry, performRecipe, showComponent, trackErrors } from "./helpers";

test.describe("catalog smoke", () => {
  for (const group of GROUPS) {
    test(`${group} pages render every demo in both themes without errors`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors = trackErrors(page);
      const registry = (await loadRegistry(page)).filter((entry) => entry.group === group);
      expect(registry.length, `${group} has registered components`).toBeGreaterThan(0);

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

    test(`${group} shot recipes can be performed without errors`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors = trackErrors(page);
      const registry = (await loadRegistry(page)).filter((entry) => entry.group === group);
      for (const entry of registry) {
        for (const [i, demo] of entry.demos.entries()) {
          if (!demo.shot) continue;
          await showComponent(page, entry.name, "light", i);
          await performRecipe(page, demo.shot);
        }
      }
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }

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
