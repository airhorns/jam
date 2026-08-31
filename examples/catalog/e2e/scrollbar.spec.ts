import { test, expect } from "@playwright/test";
import { showComponent } from "./helpers";

// Headless Chromium hides scrollbars by default; give the page a real one so hiding it could shift the layout.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.describe("modal dialogs with a classic scrollbar", () => {
  test("locking scroll keeps the layout where the scrollbar was", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 400 });
    await showComponent(page, "Dialog");
    const gutter = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
    expect(gutter).toBeGreaterThan(0);
    const demoWidth = () => page.locator('[data-component="Dialog"]').evaluate((el) => el.getBoundingClientRect().width);
    const before = await demoWidth();

    await page.getByTestId("open-dialog").click();
    await expect(page.getByTestId("dialog-content")).toBeVisible();
    expect(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)).toBe(0);
    expect(await page.evaluate(() => document.body.style.paddingRight)).toBe(`${gutter}px`);
    expect(await demoWidth()).toBe(before);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dialog-content")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.paddingRight)).toBe("");
    expect(await demoWidth()).toBe(before);
  });
});
