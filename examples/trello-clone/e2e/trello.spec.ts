import { test, expect } from "@playwright/test";

test.describe("Jam trello clone", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("board-title")).toHaveText("Product Launch Board");
  });

  test("renders the board shell with columns and an inspector", async ({ page }) => {
    await expect(page.getByTestId("trello-clone-app")).toBeVisible();
    await expect(page.getByTestId("board-stats")).toContainText("3");
    await expect(page.getByTestId("column-column-backlog")).toBeVisible();
    await expect(page.getByTestId("column-column-doing")).toBeVisible();
    await expect(page.getByTestId("column-column-done")).toBeVisible();
    await expect(page.getByTestId("card-detail-panel")).toBeVisible();
  });

  test("adds a card and opens it in the inspector", async ({ page }) => {
    await page.getByTestId("add-card-title-column-backlog").fill("Write smoke tests");
    await page
      .getByTestId("add-card-description-column-backlog")
      .fill("Cover add card, move card, and inspector basics.");
    await page.getByTestId("add-card-button-column-backlog").click();

    await expect(page.getByTestId("card-card-4")).toContainText("Write smoke tests");
    await expect(page.getByTestId("selected-card-title")).toHaveText("Write smoke tests");
    await expect(page.getByTestId("selected-card-description")).toContainText(
      "Cover add card, move card, and inspector basics.",
    );
  });

  test("moves a card between columns using inline controls", async ({ page }) => {
    const card = page.getByTestId("card-card-1");
    await expect(page.getByTestId("column-card-list-column-backlog").getByTestId("card-card-1")).toBeVisible();

    await card.getByTestId("move-right-card-1").click();

    await expect(page.getByTestId("column-card-list-column-doing").getByTestId("card-card-1")).toBeVisible();
  });

  test("shows db on window for debugging", async ({ page }) => {
    const hasDb = await page.evaluate(() => Boolean((window as any).__db));
    expect(hasDb).toBe(true);
  });

  test("detail move buttons move the selected card across the board", async ({ page }) => {
    await page.getByTestId("card-card-2").click();
    await expect(page.getByTestId("selected-card-title")).toHaveText("Polish onboarding flow");

    await page.getByTestId("detail-move-right").click();

    await expect(page.getByTestId("selected-card-column")).toContainText("Done");
    await expect(page.getByTestId("column-card-list-column-done").getByTestId("card-card-2")).toBeVisible();
  });
});
