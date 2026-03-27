import { test, expect } from "@playwright/test";

test.describe("Strikethrough Program (external decoration via claims)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("todos");
  });

  test("active todo does not have strikethrough class", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Active item");
    await input.press("Enter");

    const item = page.locator(".todo-item");
    await expect(item).not.toHaveClass(/strikethrough/);
  });

  test("toggling done adds strikethrough class from external program", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    await page.locator(".todo-item .toggle").click();

    // The strikethrough program claims the "strikethrough" class on the element
    const item = page.locator(".todo-item");
    await expect(item).toHaveClass(/strikethrough/);
  });

  test("done todo title is visually struck through", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Walk dog");
    await input.press("Enter");

    const title = page.locator(".todo-item .title");
    let textDecoration = await title.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    expect(textDecoration).toBe("none");

    await page.locator(".todo-item .toggle").click();

    textDecoration = await title.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    expect(textDecoration).toBe("line-through");
  });

  test("toggling back removes strikethrough class", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Only item");
    await input.press("Enter");

    await page.locator(".todo-item .toggle").click();
    await expect(page.locator(".todo-item")).toHaveClass(/strikethrough/);

    await page.locator(".todo-item .toggle").click();
    await expect(page.locator(".todo-item")).not.toHaveClass(/strikethrough/);
  });

  test("strikethrough is per-item — only done items get it", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("A");
    await input.press("Enter");
    await input.fill("B");
    await input.press("Enter");

    // Toggle only the first item done
    await page.locator(".todo-item .toggle").first().click();

    // First item has strikethrough, second does not
    await expect(page.locator(".todo-item").first()).toHaveClass(/strikethrough/);
    await expect(page.locator(".todo-item").nth(1)).not.toHaveClass(/strikethrough/);
  });

  test("strikethrough class is a vdom claim in the fact DB", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Test item");
    await input.press("Enter");

    await page.locator(".todo-item .toggle").click();

    // The strikethrough program's claim should be in db.facts (unified map)
    const hasClaim = await page.evaluate(() => {
      const db = (window as any).__db;
      for (const fact of db.facts.values()) {
        if (fact[1] === "class" && fact[2] === "strikethrough") return true;
      }
      return false;
    });
    expect(hasClaim).toBe(true);
  });
});
