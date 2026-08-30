// Standalone mode: PGlite seeds itself from `?seed=` and core's sync() keeps
// jam_facts in the browser. Assertions read facts, so they hold in Electric mode too.

import { test, expect, type Page } from "@playwright/test";
import { byTitle, expectCount, factKey, flushToDisk, issuesInMemory, newestFirst, query, sql, watchErrors } from "./helpers";

test.skip(!!process.env.VITE_ELECTRIC_URL, "standalone-only: the database is seeded by the page");

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
  await expect(page.locator(".issue-count")).toContainText(`of ${total} issues`, { timeout: 15000 });
}

test.describe("LinearLite", () => {
  test.beforeEach(({ page }) => watchErrors(page));

  test("redirects to the first project and renders its issues", async ({ page }) => {
    await visit(page, "/");
    await expect(page).toHaveURL(new RegExp(`/${WEB}`));
    await expect(page.locator(".page-title")).toHaveText("All issues");
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    await expect(page.locator(".issue-row")).toHaveCount(PER_PROJECT);
    await expect(page.locator(".project-menu .project-name")).toHaveText("Web App");
    await expect(page.locator(".sync-badge")).toContainText("Local database");
  });

  test("keeps only the current project's issues in memory", async ({ page }) => {
    await open(page);
    expect((await issuesInMemory(page, WEB)).length).toBe(PER_PROJECT);
    expect(await issuesInMemory(page, "mobile")).toEqual([]);
    expect((await query(page, ["project", "?id", "name", "?name"])).map((p) => p.id).sort()).toEqual([...PROJECTS].sort());

    await page.locator(".project-menu .menu-trigger").click();
    await page.locator(".project-item", { hasText: "Mobile" }).click();
    await expect(page).toHaveURL(/\/mobile$/);
    await expect(page.locator(".project-menu .project-name")).toHaveText("Mobile");
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    expect((await issuesInMemory(page, "mobile")).length).toBe(PER_PROJECT);
    await expect.poll(async () => (await issuesInMemory(page, WEB)).length).toBe(0);
    await expect(page.locator(".nav-link", { hasText: "Board" })).toHaveAttribute("href", "/mobile/board");
  });

  test("renders icons as real SVG", async ({ page }) => {
    await open(page);
    const icon = page.locator(".issue-row svg.status-icon").first();
    await expect(icon).toHaveAttribute("viewBox", "0 0 16 16");
    expect(await icon.evaluate((el) => el.namespaceURI)).toBe("http://www.w3.org/2000/svg");
    expect(await icon.locator("circle").first().evaluate((el) => el.namespaceURI)).toBe("http://www.w3.org/2000/svg");
  });

  test("filters by status from the filter menu and shows chips", async ({ page }) => {
    await open(page);
    const todo = (await issuesInMemory(page, WEB)).filter((i) => i.status === "todo").length;

    await page.locator(".filter-menu .menu-trigger").click();
    await page.locator(".menu-item", { hasText: "To Do" }).click();
    await expect(page).toHaveURL(/status=todo/);
    await expectCount(page, todo, PER_PROJECT);
    await expect(page.locator(".issue-row")).toHaveCount(todo);
    await expect(page.locator(".chip[data-filter='status'][data-value='todo']")).toBeVisible();

    await page.locator(".chip[data-filter='status'][data-value='todo']").click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.locator(".issue-row")).toHaveCount(PER_PROJECT);
  });

  test("sidebar views apply status filters", async ({ page }) => {
    await open(page);
    await page.locator(".nav-link", { hasText: "Backlog" }).click();
    await expect(page).toHaveURL(new RegExp(`/${WEB}\\?status=backlog`));
    await expect(page.locator(".page-title")).toHaveText("Backlog");
    const n = (await issuesInMemory(page, WEB)).filter((i) => i.status === "backlog").length;
    await expect(page.locator(".issue-row")).toHaveCount(n);
    await expect(page.locator(".issue-row svg.status-backlog")).toHaveCount(n);
  });

  test("sorts by title from the sort menu", async ({ page }) => {
    await open(page);
    await page.locator(".sort-menu .menu-trigger").click();
    await page.locator(".menu-item", { hasText: "Title" }).click();
    await expect(page).toHaveURL(/orderBy=title/);
    await page.locator(".sort-menu .menu-trigger").click();
    await page.locator(".menu-item", { hasText: "Ascending" }).click();
    await expect(page).toHaveURL(/orderDirection=asc/);

    const expected = (await issuesInMemory(page, WEB)).sort(byTitle).slice(0, 5);
    await expect(page.locator(".issue-row-title").first()).toHaveText(expected[0].title!);
    const titles = await page.locator(".issue-row-title").allTextContents();
    expect(titles.slice(0, 5)).toEqual(expected.map((r) => r.title));
  });

  test("search narrows the list as you type", async ({ page }) => {
    await open(page, `/${WEB}/search`);
    const issues = await issuesInMemory(page, WEB);
    const word = issues.sort(newestFirst)[0].title!.split(/\W+/).find((w) => w.length > 4)!;
    const n = issues.filter((i) => `${i.title}\n${i.description}`.toLowerCase().includes(word.toLowerCase())).length;

    await page.locator(".search-input").fill(word);
    await expect(page).toHaveURL(new RegExp(`query=${word}`));
    await expectCount(page, n, PER_PROJECT);
    await expect(page.locator(".issue-row")).toHaveCount(n);
    await expect(page.locator(".search-input")).toHaveValue(word);
  });

  test("edits are stored and survive a reload", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    await row.locator(".issue-row-title").click();
    await expect(page).toHaveURL(`/${WEB}/issue/${id}`);

    await page.locator(".issue-title").fill("Renamed from the e2e suite");
    await page.locator(".issue-description").fill("A new description.");
    await expect
      .poll(async () => (await sql<{ scope: string }>(page, `SELECT scope FROM jam_facts WHERE key = $1`, [factKey(["issue", id, "title", "Renamed from the e2e suite"])]))[0]?.scope)
      .toBe(`project:${WEB}`);
    await flushToDisk(page);

    await page.reload();
    await expect(page.locator(".issue-title")).toHaveValue("Renamed from the e2e suite", { timeout: 15000 });
    await expect(page.locator(".issue-description")).toHaveValue("A new description.");
    await expect(page.locator(".nav-link.recent")).toHaveText(["Renamed from the e2e suite"]);
    await expect(page.locator(".nav-link.recent")).toHaveAttribute("href", `/${WEB}/issue/${id}`);
  });

  test("changes status and priority from the row menus", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = await row.getAttribute("data-issue-id");

    await row.locator(".status-menu .menu-trigger").click();
    await page.locator(".menu-item", { hasText: "Done" }).click();
    await expect(row.locator("svg.status-done")).toBeVisible();
    await expect(page.locator(".menu-dropdown")).toHaveCount(0);

    await row.locator(".priority-menu .menu-trigger").click();
    await page.locator(".menu-item", { hasText: "Urgent" }).click();
    await expect(row.locator("svg.priority-urgent")).toBeVisible();

    await expect
      .poll(async () => (await sql<{ key: string }>(page, `SELECT key FROM jam_facts WHERE key IN ($1, $2) ORDER BY key`, [factKey(["issue", id, "status", "done"]), factKey(["issue", id, "priority", "urgent"])])).length)
      .toBe(2);
  });

  test("creates an issue from the modal and shows it at the top of the list", async ({ page }) => {
    await open(page);
    await page.locator(".new-issue-button").click();
    const modal = page.locator(".modal");
    await expect(modal).toBeVisible();
    await modal.locator(".new-issue-title").fill("Brand new issue");
    await modal.locator(".new-issue-description").fill("Created by Playwright");
    await modal.locator(".priority-menu .menu-trigger").click();
    await modal.locator(".menu-item", { hasText: "High" }).click();
    await modal.locator(".save-issue-button").click();

    await expect(modal).toHaveCount(0);
    await expect(page.locator(".issue-row-title").first()).toHaveText("Brand new issue");
    await expect(page.locator(".issue-row").first().locator("svg.priority-high")).toBeVisible();
    await expectCount(page, PER_PROJECT + 1, PER_PROJECT + 1);
    const [issue] = (await issuesInMemory(page, WEB)).filter((i) => i.title === "Brand new issue");
    expect(issue).toMatchObject({ project: WEB, priority: "high", status: "backlog", username: "you", description: "Created by Playwright" });
  });

  test("creates a project and works inside it", async ({ page }) => {
    await open(page);
    page.once("dialog", (dialog) => dialog.accept("Ops Tooling"));
    await page.locator(".project-menu .menu-trigger").click();
    await page.locator(".project-item.new-project").click();
    await expect(page).toHaveURL(/\/ops-tooling$/);
    await expect(page.locator(".project-menu .project-name")).toHaveText("Ops Tooling");
    await expectCount(page, 0, 0);
    await expect(page.locator(".empty-state")).toBeVisible();

    await page.locator(".new-issue-button").click();
    await page.locator(".modal .new-issue-title").fill("First ops issue");
    await page.locator(".modal .save-issue-button").click();
    await expectCount(page, 1, 1);
    expect((await issuesInMemory(page, "ops-tooling")).map((i) => i.title)).toEqual(["First ops issue"]);

    await page.locator(".project-menu .menu-trigger").click();
    await page.locator(".project-item", { hasText: "Web App" }).click();
    await expectCount(page, PER_PROJECT, PER_PROJECT);
  });

  test("deletes an issue after confirming", async ({ page }) => {
    await open(page);
    const id = await page.locator(".issue-row").first().getAttribute("data-issue-id");
    await visit(page, `/${WEB}/issue/${id}`);
    await expect(page.locator(".issue-title")).not.toHaveValue("", { timeout: 15000 });

    await page.locator(".delete-button").click();
    await page.locator(".confirm-delete-button").click();
    await expect(page).toHaveURL(`/${WEB}`);
    await expectCount(page, PER_PROJECT - 1, PER_PROJECT - 1);
    await expect(page.locator(`.issue-row[data-issue-id='${id}']`)).toHaveCount(0);
    await expect.poll(async () => (await sql(page, `SELECT 1 FROM jam_facts WHERE key LIKE $1`, [`["issue","${id}",%`])).length).toBe(0);
  });

  test("adds a comment", async ({ page }) => {
    await open(page);
    const id = await page.locator(".issue-row").first().getAttribute("data-issue-id");
    await visit(page, `/${WEB}/issue/${id}`);
    await expect(page.locator(".comments-heading")).toBeVisible({ timeout: 15000 });
    const before = await page.locator(".comment").count();

    await page.locator(".comment-input").fill("Looks good to me");
    await page.locator(".comment-form button[type=submit]").click();
    await expect(page.locator(".comment")).toHaveCount(before + 1);
    await expect(page.locator(".comment").last().locator(".comment-text")).toHaveText("Looks good to me");
    await expect(page.locator(".comment").last().locator(".comment-author")).toHaveText("you");
    await expect(page.locator(".comment-input")).toHaveValue("");
    const mine = await query(page, ["comment", "?id", "issue", id!], ["comment", "?id", "username", "you"]);
    expect(mine).toHaveLength(1);
    await expect
      .poll(async () => (await sql<{ scope: string }>(page, `SELECT scope FROM jam_facts WHERE key = $1`, [factKey(["comment", mine[0].id, "body", "Looks good to me"])]))[0]?.scope)
      .toBe(`project:${WEB}`);
  });

  test("board shows every status column and drag-and-drop moves an issue", async ({ page }) => {
    await open(page, `/${WEB}/board`);
    await expect(page.locator(".board-column")).toHaveCount(5);
    const issues = await issuesInMemory(page, WEB);
    const count = (status: string) => issues.filter((i) => i.status === status).length;
    for (const status of ["backlog", "todo", "in_progress", "done", "canceled"]) {
      await expect(page.locator(`.board-column[data-status='${status}'] .board-column-count`)).toHaveText(String(count(status)));
    }

    const card = page.locator(".board-column[data-status='backlog'] .issue-card").first();
    const id = await card.getAttribute("data-issue-id");
    await card.dragTo(page.locator(".board-column[data-status='todo'] .board-cards"));

    await expect(page.locator(`.board-column[data-status='todo'] .issue-card[data-issue-id='${id}']`)).toBeVisible();
    await expect(page.locator(".board-column[data-status='todo'] .board-column-count")).toHaveText(String(count("todo") + 1));
    expect(await query(page, ["issue", id!, "status", "?status"])).toEqual([{ status: "todo" }]);
  });

  test("a write straight into jam_facts shows up in the UI", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    const [{ title }] = await query(page, ["issue", id!, "title", "?title"]);

    await sql(page, `DELETE FROM jam_facts WHERE key = $1`, [factKey(["issue", id, "title", title])]);
    await sql(page, `INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", id, "title", "Changed behind jam's back"]), `project:${WEB}`]);
    await expect(row.locator(".issue-row-title")).toHaveText("Changed behind jam's back");

    const remote = "00000000-0000-4000-8000-000000000001";
    const facts = { project: WEB, title: "Arrived from elsewhere", description: "", priority: "low", status: "todo", created: "2026-08-01T00:00:00.000Z", modified: "2026-08-01T00:00:00.000Z", kanbanorder: "zz", username: "remote" };
    await sql(page, `INSERT INTO jam_facts (key, scope) SELECT key, $2 FROM json_to_recordset($1) AS t(key TEXT)`, [
      JSON.stringify(Object.entries(facts).map(([col, val]) => ({ key: factKey(["issue", remote, col, val]) }))),
      `project:${WEB}`,
    ]);
    await expect(page.locator(".issue-row-title").first()).toHaveText("Arrived from elsewhere");
    await expectCount(page, PER_PROJECT + 1, PER_PROJECT + 1);

    await sql(page, `INSERT INTO jam_facts (key, scope) VALUES ($1, $2)`, [factKey(["issue", "elsewhere", "project", "mobile"]), "project:mobile"]);
    await page.waitForTimeout(300);
    expect(await issuesInMemory(page, "mobile")).toEqual([]);
  });

  test("keeps only a window of rows in the DOM while scrolling a long list", async ({ page }) => {
    const seed = 1200;
    const perProject = seed / PROJECTS.length;
    await visit(page, `/${WEB}`, seed);
    await expect(page.locator(".issue-count")).toHaveText(`${perProject} of ${perProject} issues`, { timeout: 30000 });
    await expect(page.locator(".issue-row")).toHaveCount(100);
    const expected = (await issuesInMemory(page, WEB)).sort(newestFirst)[250];

    await page.locator(".issue-list-scroll").evaluate((el) => (el.scrollTop = 250 * 36));
    await expect(page.locator(`.issue-row-title`, { hasText: expected.title! })).toBeVisible();
    await expect(page.locator(".issue-row")).toHaveCount(100);
    await expect(page.locator(".issue-list-scroll")).toHaveJSProperty("scrollHeight", perProject * 36);
  });
});
