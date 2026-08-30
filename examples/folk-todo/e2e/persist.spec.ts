import { test, expect, type Page } from "@playwright/test";

async function waitForFlush(page: Page) {
  await page.evaluate(() => (window as any).__persist.flush());
}

test.describe("Persistence", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[browser] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("todos");
  });

  test("todos survive a reload", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");
    await input.fill("Walk dog");
    await input.press("Enter");
    await page.locator(".todo-item").nth(0).locator(".toggle").click();
    await expect(page.locator(".todo-item.done")).toHaveCount(1);
    await waitForFlush(page);

    await page.reload();
    await expect(page.locator("h1")).toHaveText("todos");

    await expect(page.locator(".todo-item")).toHaveCount(2);
    await expect(page.locator(".todo-item .title")).toHaveText(["Buy milk", "Walk dog"]);
    await expect(page.locator(".todo-item.done")).toHaveCount(1);
    await expect(page.locator(".info")).toContainText("1 items left");
  });

  test("deleted todos stay deleted after a reload", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");
    await input.fill("Walk dog");
    await input.press("Enter");
    await waitForFlush(page);

    const first = page.locator(".todo-item").nth(0);
    await first.hover();
    await first.locator(".delete").click();
    await expect(page.locator(".todo-item")).toHaveCount(1);
    await waitForFlush(page);

    await page.reload();
    await expect(page.locator("h1")).toHaveText("todos");

    await expect(page.locator(".todo-item")).toHaveCount(1);
    await expect(page.locator(".todo-item .title")).toHaveText("Walk dog");
  });
});
