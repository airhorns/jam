import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { trackErrors } from "./helpers";

/**
 * The homepage is the repository README: its title and lead as a hero above
 * the ways into the site, then the rest of the README rendered like a doc.
 */

const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

test.describe("homepage", () => {
  test("renders the README at the root URL", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await page.waitForSelector('[data-page="home"]');
    await expect(page).toHaveTitle("Jam");
    await expect(page.locator('[data-page="home"] h1')).toHaveText("Jam");
    await expect(page.locator('[data-page="home"] p').first()).toContainText("A reactive web framework");

    const article = page.locator('[data-docs="readme"]');
    const headings = await article.locator("h3").allInnerTexts();
    for (const heading of readme.match(/^## (.+)$/gm)!.map((line) => line.slice(3).replace(/`/g, "").trim())) {
      expect(headings, `section "${heading}"`).toContain(heading);
    }
    expect(await article.locator("pre").count()).toBe(readme.match(/^```/gm)!.length / 2);
    expect(await article.locator("table").count()).toBe(readme.match(/^\|---/gm)!.length);
    expect(await article.locator("text=/```/").count()).toBe(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("leads into the components, the guide and back home", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-components").click();
    await page.waitForSelector('[data-component="Button"]');
    expect(new URL(page.url()).searchParams.get("c")).toBe("all");
    await expect(page).toHaveTitle("All components · Jam");

    await page.locator('[data-nav="home"]').click();
    await page.waitForSelector('[data-page="home"]');
    expect(new URL(page.url()).searchParams.has("c")).toBe(false);
    await expect(page.locator('[data-nav="overview"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[aria-current='page']")).toHaveCount(1);

    await page.getByTestId("home-style-system").click();
    await page.waitForSelector('[data-guide="style-system"]');
    await expect(page).toHaveTitle("@jam/ui style system · Jam");
    await expect(page.getByTestId("home-github")).toHaveCount(0);
  });

  test("modifier clicks on in-site links are left to the browser", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForSelector('[data-page="home"]');
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByTestId("home-components").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] }),
    ]);
    await popup.waitForSelector('[data-component="Button"]');
    expect(new URL(popup.url()).searchParams.get("c")).toBe("all");
    await expect(page.locator('[data-page="home"]')).toHaveCount(1);
    await popup.close();
  });

  test("component pages title themselves after their doc", async ({ page }) => {
    await page.goto("/?c=Shapes");
    await page.waitForSelector('[data-component="Shapes"]');
    await expect(page).toHaveTitle("Square and Circle · Jam");
  });
});
