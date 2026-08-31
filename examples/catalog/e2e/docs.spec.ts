import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadRegistry, showComponent, trackErrors } from "./helpers";

/**
 * Every documented component page renders its reference doc from the jam-ui
 * skill's markdown beneath the demos: the same file an agent reads, with its
 * sections as headings, code as code and props as a table.
 */

const repoRoot = new URL("../../../", import.meta.url).pathname;

test.describe("catalog docs", () => {
  test("every component page renders its reference doc", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    const registry = (await loadRegistry(page)).filter((entry) => entry.group !== "Examples");
    const problems: string[] = [];

    for (const entry of registry) {
      if (!entry.doc) {
        problems.push(`${entry.name}: no doc path`);
        continue;
      }
      const source = readFileSync(`${repoRoot}${entry.doc}`, "utf8");
      await showComponent(page, entry.name);
      const article = page.locator(`[data-docs="${entry.name}"]`);
      if ((await article.count()) !== 1) {
        problems.push(`${entry.name}: docs article missing`);
        continue;
      }
      const headings = await article.locator("h3").allInnerTexts();
      for (const heading of source.match(/^## (.+)$/gm)?.map((line) => line.slice(3).trim()) ?? []) {
        if (!headings.includes(heading)) problems.push(`${entry.name}: section "${heading}" not rendered (has ${headings.join(", ")})`);
      }
      const codeBlocks = (source.match(/^```/gm)?.length ?? 0) / 2;
      const pres = await article.locator("pre").count();
      if (pres !== codeBlocks) problems.push(`${entry.name}: ${pres} code blocks rendered, ${codeBlocks} in the markdown`);
      const tables = source.match(/^\| --- /gm)?.length ?? 0;
      const rendered = await article.locator("table").count();
      if (rendered !== tables) problems.push(`${entry.name}: ${rendered} tables rendered, ${tables} in the markdown`);
      if (await article.locator("text=/```/").count()) problems.push(`${entry.name}: raw markdown fence visible`);
    }

    expect(problems).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the lead paragraph and page title come from the doc", async ({ page }) => {
    await showComponent(page, "Shapes");
    await expect(page.locator('[data-component="Shapes"] h2')).toHaveText("Square and Circle");
    const lead = page.locator('[data-component="Shapes"] p').first();
    await expect(lead).toContainText("Two fixed-size boxes");
    expect(await lead.locator("code").count()).toBeGreaterThan(0);
  });

  test("links between docs navigate within the catalog", async ({ page }) => {
    await showComponent(page, "AlertDialog");
    await page.locator('[data-docs] a[href="?c=Dialog"]').first().click();
    await page.waitForSelector('[data-component="Dialog"]');
    expect(new URLSearchParams(await page.evaluate(() => location.search)).get("c")).toBe("Dialog");
  });

  test("the all-components view shows demos without the docs", async ({ page }) => {
    await page.goto("/?c=all&chrome=0");
    await page.waitForSelector('[data-component="Button"]');
    expect(await page.locator("[data-docs]").count()).toBe(0);
  });
});
