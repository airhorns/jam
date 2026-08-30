import { expect, test, type Page } from "@playwright/test";

async function gotoApp(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => {
    const db = (window as any).__db;
    return Boolean(db?.replace && db?.insert && db?.drop);
  });
}

test("git viewer shows dense status and expands details", async ({ page }) => {
  await page.route("**/__puddy/git-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        branch: "harrymees/har-93-add-git-viewer",
        upstream: "origin/main",
        head: "abc1234",
        ahead: 2,
        behind: 0,
        dirty: true,
        staged: 1,
        unstaged: 1,
        untracked: 0,
        files: [
          {
            path: "examples/puddy-vite/src/programs/git-viewer.tsx",
            kind: "modified",
            index: " ",
            workingTree: "M",
          },
        ],
        commits: [{ hash: "abc1234", subject: "Add git viewer" }],
        lastCommit: "abc1234 Add git viewer",
        updatedAt: "2026-04-19T22:30:00Z",
      }),
    });
  });

  await gotoApp(page);

  await page.evaluate(() => {
    const db = (window as any).__db;

    db.replace("connection", "status", "connected");
    db.replace("connection", "hostname", "localhost");
  });

  const trigger = page.getByTestId("git-viewer-trigger");
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("harrymees/har-93-add-git-viewer");
  await expect(trigger).toContainText("dirty");
  await expect(trigger).toContainText("+2");

  await trigger.click();

  const panel = page.getByTestId("git-viewer-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Branch");
  await expect(panel).toContainText("origin/main");
  await expect(panel).toContainText("1 staged, 1 modified");
  await expect(panel).toContainText("examples/puddy-vite/src/programs/git-viewer.tsx");
});
