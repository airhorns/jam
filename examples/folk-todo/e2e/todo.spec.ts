import { test, expect } from "@playwright/test";

test.describe("Folk Todo App", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app to mount
    await expect(page.locator("h1")).toHaveText("todos");
  });

  test("renders the app shell", async ({ page }) => {
    await expect(page.locator(".todo-app")).toBeVisible();
    await expect(page.locator(".new-todo")).toBeVisible();
    await expect(page.locator(".info")).toContainText("0 items left");
  });

  test("adds a todo via Enter key", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    await expect(page.locator(".todo-item")).toHaveCount(1);
    await expect(page.locator(".todo-item .title")).toHaveText("Buy milk");
    await expect(page.locator(".info")).toContainText("1 items left");
  });

  test("adds multiple todos", async ({ page }) => {
    const input = page.locator(".new-todo");

    await input.fill("Buy milk");
    await input.press("Enter");
    await input.fill("Walk dog");
    await input.press("Enter");
    await input.fill("Write tests");
    await input.press("Enter");

    await expect(page.locator(".todo-item")).toHaveCount(3);
    await expect(page.locator(".info")).toContainText("3 items left");
  });

  test("clears input after adding", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    await expect(input).toHaveValue("");
  });

  test("ignores empty input", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("   ");
    await input.press("Enter");

    await expect(page.locator(".todo-item")).toHaveCount(0);
  });

  test("toggles a todo done", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    // Click the toggle button
    await page.locator(".todo-item .toggle").click();

    // Should have "done" class
    await expect(page.locator(".todo-item")).toHaveClass(/done/);
    // Counter should show 0 items left
    await expect(page.locator(".info")).toContainText("0 items left");
  });

  test("toggles a todo back to active", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    // Toggle done
    await page.locator(".todo-item .toggle").click();
    await expect(page.locator(".todo-item")).toHaveClass(/done/);

    // Toggle back
    await page.locator(".todo-item .toggle").click();
    await expect(page.locator(".todo-item")).not.toHaveClass(/done/);
    await expect(page.locator(".info")).toContainText("1 items left");
  });

  test("deletes a todo", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");
    await input.fill("Walk dog");
    await input.press("Enter");

    await expect(page.locator(".todo-item")).toHaveCount(2);

    // Hover to reveal delete button, then click
    await page.locator(".todo-item").first().hover();
    await page.locator(".todo-item .delete").first().click();

    await expect(page.locator(".todo-item")).toHaveCount(1);
    await expect(page.locator(".todo-item .title")).toHaveText("Walk dog");
  });

  test("updates item count correctly through add/toggle/delete", async ({ page }) => {
    const input = page.locator(".new-todo");

    // Add 3 todos
    await input.fill("A");
    await input.press("Enter");
    await input.fill("B");
    await input.press("Enter");
    await input.fill("C");
    await input.press("Enter");
    await expect(page.locator(".info")).toContainText("3 items left");

    // Toggle first done
    await page.locator(".todo-item .toggle").first().click();
    await expect(page.locator(".info")).toContainText("2 items left");

    // Delete second (still active)
    await page.locator(".todo-item").nth(1).hover();
    await page.locator(".todo-item .delete").nth(1).click();
    await expect(page.locator(".info")).toContainText("1 items left");
  });

  test("fact database contains todo state", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Buy milk");
    await input.press("Enter");

    // Query the fact database directly via window.__db
    const factCount = await page.evaluate(() => {
      const db = (window as any).__db;
      return db.facts.size;
    });

    // Should have at least 2 facts: [todo, 1, title, "Buy milk"] and [todo, 1, done, false]
    expect(factCount).toBeGreaterThanOrEqual(2);

    // Query for the todo title fact
    const titles = await page.evaluate(() => {
      const db = (window as any).__db;
      const facts: any[] = [];
      for (const fact of db.facts.values()) {
        if (fact[0] === "todo" && fact[2] === "title") {
          facts.push(fact[3]);
        }
      }
      return facts;
    });

    expect(titles).toContain("Buy milk");
  });

  test("toggling updates facts in the database", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Test item");
    await input.press("Enter");

    // Check initial done state
    const doneBefore = await page.evaluate(() => {
      const db = (window as any).__db;
      for (const fact of db.facts.values()) {
        if (fact[0] === "todo" && fact[2] === "done") return fact[3];
      }
      return undefined;
    });
    expect(doneBefore).toBe(false);

    // Toggle
    await page.locator(".todo-item .toggle").click();

    // Check updated done state
    const doneAfter = await page.evaluate(() => {
      const db = (window as any).__db;
      for (const fact of db.facts.values()) {
        if (fact[0] === "todo" && fact[2] === "done") return fact[3];
      }
      return undefined;
    });
    expect(doneAfter).toBe(true);
  });

  test("deleting removes facts from the database", async ({ page }) => {
    const input = page.locator(".new-todo");
    await input.fill("Ephemeral");
    await input.press("Enter");

    // Verify facts exist
    let todoFacts = await page.evaluate(() => {
      const db = (window as any).__db;
      let count = 0;
      for (const fact of db.facts.values()) {
        if (fact[0] === "todo") count++;
      }
      return count;
    });
    expect(todoFacts).toBe(2); // title + done

    // Delete
    await page.locator(".todo-item").hover();
    await page.locator(".todo-item .delete").click();

    // Facts should be gone
    todoFacts = await page.evaluate(() => {
      const db = (window as any).__db;
      let count = 0;
      for (const fact of db.facts.values()) {
        if (fact[0] === "todo") count++;
      }
      return count;
    });
    expect(todoFacts).toBe(0);
  });
});
