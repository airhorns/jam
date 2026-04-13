import { expect, test } from "@playwright/test";

test.describe("Jam Notes smoke tests", () => {
  test("loads the seeded notes app", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("notes-app")).toBeVisible();
    await expect(page.getByTestId("note-list-item")).toHaveCount(2);
    await expect(page.getByTestId("note-title-input")).toHaveValue("Project ideas");
    await expect(page.getByTestId("outgoing-links-panel")).toContainText("[[Welcome]]");
  });

  test("creates and edits a note", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("create-note").click();
    await expect(page.getByTestId("note-list-item")).toHaveCount(3);
    await expect(page.getByTestId("note-title-input")).toHaveValue("Untitled note");

    await page.getByTestId("note-title-input").fill("Ideas");
    await page
      .getByTestId("note-body-input")
      .fill("# Ideas\n\nLinking back to [[Welcome]] from this note.");

    await expect(page.locator('[data-note-id="note-3"]')).toContainText("Ideas");
    await expect(page.getByTestId("outline-panel")).toContainText("# Ideas");
    await expect(page.getByTestId("outgoing-links-panel")).toContainText("[[Welcome]]");
  });

  test("selects notes and shows backlinks", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("create-note").click();
    await page.getByTestId("note-title-input").fill("Ideas");
    await page
      .getByTestId("note-body-input")
      .fill("# Ideas\n\nLink back to [[Welcome]] and keep exploring.");

    await page.getByTestId("outgoing-link").filter({ hasText: "[[Welcome]]" }).click();

    await expect(page.getByTestId("note-title-input")).toHaveValue("Welcome");
    await expect(page.getByTestId("backlinks-panel")).toContainText("Ideas");
  });
});
