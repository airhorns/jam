// Ceremonies run the way an agent runs them: through the accessibility
// outline (`describeUI()`) and `drive()`/`press()`, not selectors.

import { expect, test } from "@playwright/test";
import { driveNode, find, findAll, pressNode } from "@jam/ui/playwright";

test.describe("Jam Notes smoke tests", () => {
  test("loads the seeded notes app", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("notes-app")).toBeVisible();
    await expect(page.getByTestId("note-list-item")).toHaveCount(2);
    await expect(page.getByTestId("note-title-input")).toHaveValue("Project ideas");
    await expect(page.getByTestId("outgoing-links-panel")).toContainText("[[Welcome]]");
  });

  test("names every note and control for an agent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("notes-app")).toBeVisible();

    const notes = await findAll(page, { role: "button", within: (await find(page, { role: "navigation", name: "Notes" })).id });
    expect(notes.map((n) => [n.name, n.state.current ?? false])).toEqual([["Project ideas", true], ["Welcome", false]]);
    const unnamed = (await findAll(page, { role: "button" })).concat(await findAll(page, { role: "textbox" })).filter((n) => !n.name);
    expect(unnamed).toEqual([]);
  });

  test("creates and edits a note", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("notes-app")).toBeVisible();

    await pressNode(page, { role: "button", name: "+ New note" });
    await find(page, { role: "button", name: "Untitled note", state: { current: true } });
    await expect(page.getByTestId("note-list-item")).toHaveCount(3);
    await expect(page.getByTestId("note-title-input")).toHaveValue("Untitled note");

    await driveNode(page, { role: "textbox", name: "Note title" }, "value", "Ideas");
    await driveNode(page, { role: "textbox", name: "Body" }, "value", "# Ideas\n\nLinking back to [[Welcome]] from this note.");

    await find(page, { role: "button", name: "Ideas", state: { current: true } });
    await expect(page.locator('[data-note-id="note-3"]')).toContainText("Ideas");
    await expect(page.getByTestId("outline-panel")).toContainText("# Ideas");
    await find(page, { role: "button", name: "[[Welcome]]" });
  });

  test("selects notes and shows backlinks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("notes-app")).toBeVisible();

    await pressNode(page, { role: "button", name: "+ New note" });
    await driveNode(page, { role: "textbox", name: "Note title" }, "value", "Ideas");
    await driveNode(page, { role: "textbox", name: "Body" }, "value", "# Ideas\n\nLink back to [[Welcome]] and keep exploring.");

    await pressNode(page, { role: "button", name: "[[Welcome]]" });

    await find(page, { role: "textbox", name: "Note title", state: { value: "Welcome" } });
    await find(page, { role: "button", name: "Welcome", state: { current: true } });
    await expect(page.getByTestId("backlinks-panel")).toContainText("Ideas");
  });
});
