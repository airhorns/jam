import { test, expect } from "@playwright/test";

test.describe("Strikethrough Program (external decoration)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("todos");
  });

  test("no strikethrough style tag when no todos are done", async ({ page }) => {
    // Add an active todo
    const input = page.locator(".new-todo");
    await input.fill("Active item");
    await input.press("Enter");

    // The strikethrough program's <style> should not be in the DOM
    const styleTag = page.locator('style[data-program="strikethrough"]');
    await expect(styleTag).toHaveCount(0);
  });

  test("injects strikethrough style when a todo is toggled done", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    // Toggle done
    await page.locator(".todo-item .toggle").click();

    // The strikethrough program should have injected its <style>
    const styleTag = page.locator('style[data-program="strikethrough"]');
    await expect(styleTag).toHaveCount(1);
    const css = await styleTag.textContent();
    expect(css).toContain("text-decoration: line-through");
  });

  test("done todo title is visually struck through", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Walk dog");
    await input.press("Enter");

    // Before toggle — no strikethrough
    const title = page.locator(".todo-item .title");
    let textDecoration = await title.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    expect(textDecoration).toBe("none");

    // Toggle done
    await page.locator(".todo-item .toggle").click();

    // After toggle — strikethrough applied by the external program
    textDecoration = await title.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    expect(textDecoration).toBe("line-through");
  });

  test("removes strikethrough style when all todos are toggled back", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Only item");
    await input.press("Enter");

    // Toggle done
    await page.locator(".todo-item .toggle").click();
    await expect(page.locator('style[data-program="strikethrough"]')).toHaveCount(1);

    // Toggle back to active
    await page.locator(".todo-item .toggle").click();
    await expect(page.locator('style[data-program="strikethrough"]')).toHaveCount(0);
  });

  test("strikethrough persists when one of many todos is still done", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("A");
    await input.press("Enter");
    await input.fill("B");
    await input.press("Enter");

    // Toggle both done
    await page.locator(".todo-item .toggle").first().click();
    await page.locator(".todo-item .toggle").nth(1).click();
    await expect(page.locator('style[data-program="strikethrough"]')).toHaveCount(1);

    // Toggle first back — second still done, style should remain
    await page.locator(".todo-item .toggle").first().click();
    await expect(page.locator('style[data-program="strikethrough"]')).toHaveCount(1);

    // Toggle second back — none done, style should be removed
    await page.locator(".todo-item .toggle").nth(1).click();
    await expect(page.locator('style[data-program="strikethrough"]')).toHaveCount(0);
  });
});
