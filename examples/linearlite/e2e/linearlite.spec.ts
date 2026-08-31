// Standalone mode: PGlite seeds itself from `?seed=` and core's sync() keeps
// jam_facts in the browser. Assertions read facts, so they hold in Electric mode too.
//
// Ceremonies are performed the way an agent performs them: by reading the
// accessibility outline from `describeUI()` and pressing or driving what it
// names. Selectors stay only where the DOM itself is what is under test.

import { test, expect, type Page } from "@playwright/test";
import { describe, drive, driveNode, find, findAll, flatten, pressNode } from "@jam/ui/playwright";
import { byTitle, expectCount, factKey, flushToDisk, issuesInMemory, newestFirst, query, sql, watchErrors } from "./helpers";

test.skip(!!process.env.VITE_SYNC_URL, "standalone-only: the database is seeded by the page");

const SEED = 100;
const PROJECTS = ["web", "mobile", "api", "design"];
const PER_PROJECT = SEED / PROJECTS.length;
const WEB = PROJECTS[0];

/** Full navigation that keeps the seed size, so a reload before the fresh database reaches IndexedDB re-seeds identically. */
async function visit(page: Page, path: string, seed = SEED) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("seed", String(seed));
  await page.goto(url.pathname + url.search);
}

async function open(page: Page, path = `/${WEB}`, total = PER_PROJECT) {
  await visit(page, path);
  await expect(page.getByTestId("issue-count")).toContainText(`of ${total} issues`, { timeout: 15000 });
}

test.describe("LinearLite", () => {
  test.beforeEach(({ page }) => watchErrors(page));

  test("redirects to the first project and renders its issues", async ({ page }) => {
    await visit(page, "/");
    await expect(page).toHaveURL(new RegExp(`/${WEB}`));
    await expect(page.getByTestId("page-title")).toHaveText("All issues");
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    await expect(page.getByTestId("issue-row")).toHaveCount(PER_PROJECT);
    await expect(page.getByTestId("project-name")).toHaveText("Web App");
    await expect(page.getByTestId("sync-badge")).toContainText("Local database");
  });

  test("keeps only the current project's issues in memory", async ({ page }) => {
    await open(page);
    expect((await issuesInMemory(page, WEB)).length).toBe(PER_PROJECT);
    expect(await issuesInMemory(page, "mobile")).toEqual([]);
    expect((await query(page, ["project", "?id", "name", "?name"])).map((p) => p.id).sort()).toEqual([...PROJECTS].sort());

    await page.getByTestId("project-menu-trigger").click();
    await page.getByTestId("project-item").filter({ hasText: "Mobile" }).click();
    await expect(page).toHaveURL(/\/mobile$/);
    await expect(page.getByTestId("project-name")).toHaveText("Mobile");
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    expect((await issuesInMemory(page, "mobile")).length).toBe(PER_PROJECT);
    await expect.poll(async () => (await issuesInMemory(page, WEB)).length).toBe(0);
    await expect(page.getByTestId("nav-link").filter({ hasText: "Board" })).toHaveAttribute("href", "/mobile/board");
  });

  test("renders icons as real SVG", async ({ page }) => {
    await open(page);
    const icon = page.getByTestId("issue-row").first().locator("svg[data-testid='status-icon']");
    await expect(icon).toHaveAttribute("viewBox", "0 0 16 16");
    expect(await icon.evaluate((el) => el.namespaceURI)).toBe("http://www.w3.org/2000/svg");
    expect(await icon.locator("circle").first().evaluate((el) => el.namespaceURI)).toBe("http://www.w3.org/2000/svg");
  });

  test("describes itself to an agent and can be driven from the outline", async ({ page }) => {
    await open(page);
    const nodes = flatten(await describe(page, { interactive: true }));
    const controls = nodes.filter((n) => ["button", "link", "textbox", "menuitem", "menuitemradio", "menuitemcheckbox"].includes(n.role));
    expect(controls.length).toBeGreaterThan(PER_PROJECT * 2);
    expect(controls.filter((n) => !n.name)).toEqual([]);
    expect(nodes.filter((n) => n.role === "menu")).toEqual([]);

    const modal = await find(page, { role: "hidden", component: "NewIssueModal/Dialog/DialogPortal" });
    expect(modal.drive?.keys).toEqual({ open: false });
    await drive(page, modal.drive!.id, "open", true);
    await find(page, { role: "dialog", name: "New issue" });
    await expect(page.getByTestId("new-issue-modal")).toBeVisible();
    await drive(page, modal.drive!.id, "open", false);
    await expect(page.getByTestId("new-issue-modal")).toHaveCount(0);
  });

  test("filters by status from the filter menu and shows chips", async ({ page }) => {
    await open(page);
    const todo = (await issuesInMemory(page, WEB)).filter((i) => i.status === "todo").length;

    await pressNode(page, { role: "button", name: "Filter", state: { expanded: false } });
    await pressNode(page, { role: "menuitemcheckbox", name: "To Do", state: { checked: false } });
    await expect(page).toHaveURL(/status=todo/);
    await expectCount(page, todo, PER_PROJECT);
    await expect(page.getByTestId("issue-row")).toHaveCount(todo);
    const chip = page.locator("[data-testid='filter-chip'][data-filter='status'][data-value='todo']");
    await expect(chip).toBeVisible();

    await pressNode(page, { role: "button", name: "Remove To Do filter" });
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.getByTestId("issue-row")).toHaveCount(PER_PROJECT);
  });

  test("sidebar views apply status filters", async ({ page }) => {
    await open(page);
    await page.getByTestId("nav-link").filter({ hasText: "Backlog" }).click();
    await expect(page).toHaveURL(new RegExp(`/${WEB}\\?status=backlog`));
    await expect(page.getByTestId("page-title")).toHaveText("Backlog");
    const n = (await issuesInMemory(page, WEB)).filter((i) => i.status === "backlog").length;
    await expect(page.getByTestId("issue-row")).toHaveCount(n);
    await expect(page.locator("[data-testid='issue-row'] svg[data-status='backlog']")).toHaveCount(n);
  });

  test("sorts by title from the sort menu", async ({ page }) => {
    await open(page);
    await pressNode(page, { role: "button", name: "Sort" });
    await pressNode(page, { role: "menuitemradio", name: "Title" });
    await expect(page).toHaveURL(/orderBy=title/);
    await pressNode(page, { role: "button", name: "Sort", state: { expanded: false } });
    await pressNode(page, { role: "menuitemradio", name: "Ascending" });
    await expect(page).toHaveURL(/orderDirection=asc/);
    expect(await findAll(page, { role: "menu" })).toEqual([]);

    const expected = (await issuesInMemory(page, WEB)).sort(byTitle).slice(0, 5);
    await expect(page.getByTestId("issue-row-title").first()).toHaveText(expected[0].title!);
    const titles = await page.getByTestId("issue-row-title").allTextContents();
    expect(titles.slice(0, 5)).toEqual(expected.map((r) => r.title));
  });

  test("search narrows the list as you type", async ({ page }) => {
    await open(page, `/${WEB}/search`);
    const issues = await issuesInMemory(page, WEB);
    const word = issues.sort(newestFirst)[0].title!.split(/\W+/).find((w) => w.length > 4)!;
    const n = issues.filter((i) => `${i.title}\n${i.description}`.toLowerCase().includes(word.toLowerCase())).length;

    await page.getByTestId("search-input").fill(word);
    await expect(page).toHaveURL(new RegExp(`query=${word}`));
    await expectCount(page, n, PER_PROJECT);
    await expect(page.getByTestId("issue-row")).toHaveCount(n);
    await expect(page.getByTestId("search-input")).toHaveValue(word);
  });

  test("edits are stored and survive a reload", async ({ page }) => {
    await open(page);
    const row = page.getByTestId("issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    await row.getByTestId("issue-row-title").click();
    await expect(page).toHaveURL(`/${WEB}/issue/${id}`);

    await page.getByTestId("issue-title").fill("Renamed from the e2e suite");
    await page.getByTestId("issue-description").fill("A new description.");
    await expect
      .poll(async () => (await sql<{ scope: string }>(page, `SELECT scope FROM jam_facts WHERE key = $1`, [factKey(["issue", id, "title", "Renamed from the e2e suite"])]))[0]?.scope)
      .toBe(`project:${WEB}`);
    await flushToDisk(page);

    await page.reload();
    await expect(page.getByTestId("issue-title")).toHaveValue("Renamed from the e2e suite", { timeout: 15000 });
    await expect(page.getByTestId("issue-description")).toHaveValue("A new description.");
    await expect(page.getByTestId("recent-link")).toHaveText(["Renamed from the e2e suite"]);
    await expect(page.getByTestId("recent-link")).toHaveAttribute("href", `/${WEB}/issue/${id}`);
  });

  test("changes status and priority from the row menus", async ({ page }) => {
    await open(page);
    const row = page.getByTestId("issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    const [first] = await findAll(page, { role: "listitem" });

    await pressNode(page, { role: "button", name: /^status:/, within: first.id });
    await pressNode(page, { role: "menuitemradio", name: "Done" });
    await find(page, { role: "button", name: "status: Done", within: first.id });
    await expect(row.locator("svg[data-status='done']")).toBeVisible();
    expect(await findAll(page, { role: "menu" })).toEqual([]);

    await pressNode(page, { role: "button", name: /^priority:/, within: first.id });
    await pressNode(page, { role: "menuitemradio", name: "Urgent" });
    await find(page, { role: "button", name: "priority: Urgent", within: first.id });
    await expect(row.locator("svg[data-priority='urgent']")).toBeVisible();

    await expect
      .poll(async () => (await sql<{ key: string }>(page, `SELECT key FROM jam_facts WHERE key IN ($1, $2) ORDER BY key`, [factKey(["issue", id, "status", "done"]), factKey(["issue", id, "priority", "urgent"])])).length)
      .toBe(2);
  });

  test("creates an issue from the modal and shows it at the top of the list", async ({ page }) => {
    await open(page);
    await pressNode(page, { role: "button", name: "New issue" });
    const dialog = await find(page, { role: "dialog", name: "New issue" });
    await driveNode(page, { role: "textbox", name: "Issue title", within: dialog.id }, "value", "Brand new issue");
    await driveNode(page, { role: "textbox", name: "Description", within: dialog.id }, "value", "Created by Playwright");
    await pressNode(page, { role: "button", name: /^priority:/, within: dialog.id });
    await pressNode(page, { role: "menuitemradio", name: "High" });
    await find(page, { role: "button", name: "priority: High", within: dialog.id });
    await pressNode(page, { role: "button", name: "Save issue", within: dialog.id });

    await expect(page.getByTestId("new-issue-modal")).toHaveCount(0);
    await expect(page.getByTestId("issue-row-title").first()).toHaveText("Brand new issue");
    await expect(page.getByTestId("issue-row").first().locator("svg[data-priority='high']")).toBeVisible();
    await expectCount(page, PER_PROJECT + 1, PER_PROJECT + 1);
    const [issue] = (await issuesInMemory(page, WEB)).filter((i) => i.title === "Brand new issue");
    expect(issue).toMatchObject({ project: WEB, priority: "high", status: "backlog", username: "you", description: "Created by Playwright" });
  });

  test("creates a project and works inside it", async ({ page }) => {
    await open(page);
    page.once("dialog", (dialog) => dialog.accept("Ops Tooling"));
    await page.getByTestId("project-menu-trigger").click();
    await page.getByTestId("new-project-item").click();
    await expect(page).toHaveURL(/\/ops-tooling$/);
    await expect(page.getByTestId("project-name")).toHaveText("Ops Tooling");
    await expectCount(page, 0, 0);
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await page.getByTestId("new-issue-button").click();
    await page.getByTestId("new-issue-modal").getByTestId("new-issue-title").fill("First ops issue");
    await page.getByTestId("new-issue-modal").getByTestId("save-issue-button").click();
    await expectCount(page, 1, 1);
    expect((await issuesInMemory(page, "ops-tooling")).map((i) => i.title)).toEqual(["First ops issue"]);

    await page.getByTestId("project-menu-trigger").click();
    await page.getByTestId("project-item").filter({ hasText: "Web App" }).click();
    await expectCount(page, PER_PROJECT, PER_PROJECT);
  });

  test("deletes an issue after confirming", async ({ page }) => {
    await open(page);
    const id = await page.getByTestId("issue-row").first().getAttribute("data-issue-id");
    await visit(page, `/${WEB}/issue/${id}`);
    await expect(page.getByTestId("issue-title")).not.toHaveValue("", { timeout: 15000 });

    await pressNode(page, { role: "button", name: "Delete", state: { haspopup: "dialog" } });
    const confirm = await find(page, { role: "alertdialog", name: "Delete this issue?" });
    expect(confirm.description).toContain("Its comments go with it");
    await pressNode(page, { role: "button", name: "Delete", within: confirm.id });
    await expect(page).toHaveURL(`/${WEB}`);
    await expectCount(page, PER_PROJECT - 1, PER_PROJECT - 1);
    await expect(page.locator(`[data-testid='issue-row'][data-issue-id='${id}']`)).toHaveCount(0);
    await expect.poll(async () => (await sql(page, `SELECT 1 FROM jam_facts WHERE key LIKE $1`, [`["issue","${id}",%`])).length).toBe(0);
  });

  test("adds a comment", async ({ page }) => {
    await open(page);
    const id = await page.getByTestId("issue-row").first().getAttribute("data-issue-id");
    await visit(page, `/${WEB}/issue/${id}`);
    await expect(page.getByTestId("comments-heading")).toBeVisible({ timeout: 15000 });
    const before = await page.getByTestId("comment").count();

    await driveNode(page, { role: "textbox", name: "Comment" }, "value", "Looks good to me");
    await pressNode(page, { role: "button", name: "Comment" });
    await expect(page.getByTestId("comment")).toHaveCount(before + 1);
    await expect(page.getByTestId("comment").last().getByTestId("comment-text")).toHaveText("Looks good to me");
    await expect(page.getByTestId("comment").last().getByTestId("comment-author")).toHaveText("you");
    await expect(page.getByTestId("comment-input")).toHaveValue("");
    const mine = await query(page, ["comment", "?id", "issue", id!], ["comment", "?id", "username", "you"]);
    expect(mine).toHaveLength(1);
    await expect
      .poll(async () => (await sql<{ scope: string }>(page, `SELECT scope FROM jam_facts WHERE key = $1`, [factKey(["comment", mine[0].id, "body", "Looks good to me"])]))[0]?.scope)
      .toBe(`project:${WEB}`);
  });

  test("board shows every status column and drag-and-drop moves an issue", async ({ page }) => {
    await open(page, `/${WEB}/board`);
    await expect(page.getByTestId("board-column")).toHaveCount(5);
    const issues = await issuesInMemory(page, WEB);
    const count = (status: string) => issues.filter((i) => i.status === status).length;
    for (const status of ["backlog", "todo", "in_progress", "done", "canceled"]) {
      await expect(page.locator(`[data-testid='board-column'][data-status='${status}'] [data-testid='board-column-count']`)).toHaveText(String(count(status)));
    }

    const card = page.locator("[data-testid='board-column'][data-status='backlog'] [data-testid='issue-card']").first();
    const id = await card.getAttribute("data-issue-id");
    await card.dragTo(page.locator("[data-testid='board-column'][data-status='todo'] [data-testid='board-cards']"));

    await expect(page.locator(`[data-testid='board-column'][data-status='todo'] [data-testid='issue-card'][data-issue-id='${id}']`)).toBeVisible();
    await expect(page.locator("[data-testid='board-column'][data-status='todo'] [data-testid='board-column-count']")).toHaveText(String(count("todo") + 1));
    expect(await query(page, ["issue", id!, "status", "?status"])).toEqual([{ status: "todo" }]);
  });

  test("a write straight into jam_facts shows up in the UI", async ({ page }) => {
    await open(page);
    const row = page.getByTestId("issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    const [{ title }] = await query(page, ["issue", id!, "title", "?title"]);

    await sql(page, `DELETE FROM jam_facts WHERE key = $1`, [factKey(["issue", id, "title", title])]);
    await sql(page, `INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", id, "title", "Changed behind jam's back"]), `project:${WEB}`]);
    await expect(row.getByTestId("issue-row-title")).toHaveText("Changed behind jam's back");

    const remote = "00000000-0000-4000-8000-000000000001";
    const facts = { project: WEB, title: "Arrived from elsewhere", description: "", priority: "low", status: "todo", created: "2026-08-01T00:00:00.000Z", modified: "2026-08-01T00:00:00.000Z", kanbanorder: "a0", username: "remote" };
    await sql(page, `INSERT INTO jam_facts (key, scope) SELECT key, $2 FROM json_to_recordset($1) AS t(key TEXT)`, [
      JSON.stringify(Object.entries(facts).map(([col, val]) => ({ key: factKey(["issue", remote, col, val]) }))),
      `project:${WEB}`,
    ]);
    await expect(page.getByTestId("issue-row-title").first()).toHaveText("Arrived from elsewhere");
    await expectCount(page, PER_PROJECT + 1, PER_PROJECT + 1);

    await sql(page, `INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", "elsewhere", "project", "mobile"]), "project:mobile"]);
    await page.waitForTimeout(300);
    expect(await issuesInMemory(page, "mobile")).toEqual([]);
  });

  test("keeps only a window of rows in the DOM while scrolling a long list", async ({ page }) => {
    const seed = 1200;
    const perProject = seed / PROJECTS.length;
    await visit(page, `/${WEB}`, seed);
    await expect(page.getByTestId("issue-count")).toHaveText(`${perProject} of ${perProject} issues`, { timeout: 30000 });
    await expect(page.getByTestId("issue-row")).toHaveCount(100);
    const expected = (await issuesInMemory(page, WEB)).sort(newestFirst)[250];

    await page.getByTestId("issue-list-scroll").evaluate((el) => (el.scrollTop = 250 * 36));
    await expect(page.getByTestId("issue-row-title").filter({ hasText: expected.title! })).toBeVisible();
    await expect(page.getByTestId("issue-row")).toHaveCount(100);
    await expect(page.getByTestId("issue-list-scroll")).toHaveJSProperty("scrollHeight", perProject * 36);
  });
});
