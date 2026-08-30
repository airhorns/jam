import { test, expect, type Page } from "@playwright/test";

const SEED = 100;

declare global {
  interface Window {
    __pg: { query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; syncToDisk(): Promise<void> };
    __persist: { flush(): Promise<void> };
  }
}

/** Full navigation that keeps the seed size, so a reload before the fresh database reaches IndexedDB re-seeds identically. */
async function visit(page: Page, path: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("seed", String(SEED));
  await page.goto(url.pathname + url.search);
}

async function open(page: Page, path = "/") {
  await visit(page, path);
  await expect(page.locator(".issue-count")).toContainText(`of ${SEED} issues`, { timeout: 15000 });
}

async function sql<T = Record<string, unknown>>(page: Page, query: string, params: unknown[] = []): Promise<T[]> {
  return page.evaluate(([q, p]) => window.__pg.query(q as string, p as unknown[]).then((r) => r.rows), [query, params]) as Promise<T[]>;
}

/** Wait for debounced fact→SQL writes to land and force them to durable storage before a reload. */
async function flushToDisk(page: Page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__persist.flush());
  await page.evaluate(() => window.__pg.syncToDisk());
}

test.describe("LinearLite", () => {
  test.beforeEach(({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message !== "ErrnoError") console.log(`[pageerror] ${err.message}`);
    });
  });

  test("renders the seeded issue list with counts", async ({ page }) => {
    await open(page);
    await expect(page.locator(".page-title")).toHaveText("All issues");
    await expect(page.locator(".issue-count")).toHaveText(`${SEED} of ${SEED} issues`);
    await expect(page.locator(".issue-row")).toHaveCount(SEED);
    await expect(page.locator(".sync-badge")).toContainText("Local database");
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
    const [{ n: todo }] = await sql<{ n: number }>(page, `SELECT count(*)::int AS n FROM issue WHERE status = 'todo'`);

    await page.locator(".filter-menu .menu-trigger").click();
    await page.locator(".menu-item", { hasText: "To Do" }).click();
    await expect(page).toHaveURL(/status=todo/);
    await expect(page.locator(".issue-count")).toHaveText(`${todo} of ${SEED} issues`);
    await expect(page.locator(".issue-row")).toHaveCount(todo);
    await expect(page.locator(".chip[data-filter='status'][data-value='todo']")).toBeVisible();

    await page.locator(".chip[data-filter='status'][data-value='todo']").click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.locator(".issue-row")).toHaveCount(SEED);
  });

  test("sidebar views apply status filters", async ({ page }) => {
    await open(page);
    await page.locator(".nav-link", { hasText: "Backlog" }).click();
    await expect(page.locator(".page-title")).toHaveText("Backlog");
    const [{ n }] = await sql<{ n: number }>(page, `SELECT count(*)::int AS n FROM issue WHERE status = 'backlog'`);
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

    const expected = await sql<{ title: string }>(page, `SELECT title FROM issue ORDER BY title ASC, id ASC LIMIT 5`);
    await expect(page.locator(".issue-row-title").first()).toHaveText(expected[0].title);
    const titles = await page.locator(".issue-row-title").allTextContents();
    expect(titles.slice(0, 5)).toEqual(expected.map((r) => r.title));
  });

  test("full-text search narrows the list as you type", async ({ page }) => {
    await open(page, "/search");
    const [{ title }] = await sql<{ title: string }>(page, `SELECT title FROM issue ORDER BY created DESC LIMIT 1`);
    const word = title.split(/\W+/).find((w) => w.length > 4)!;
    const [{ n }] = await sql<{ n: number }>(
      page,
      `SELECT count(*)::int AS n FROM issue WHERE (setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B')) @@ plainto_tsquery('simple', $1)`,
      [word],
    );

    await page.locator(".search-input").fill(word);
    await expect(page).toHaveURL(new RegExp(`query=${word}`));
    await expect(page.locator(".issue-count")).toHaveText(`${n} of ${SEED} issues`);
    await expect(page.locator(".issue-row")).toHaveCount(n);
    await expect(page.locator(".search-input")).toHaveValue(word);
  });

  test("edits persist to the database and survive a reload", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    await row.locator(".issue-row-title").click();
    await expect(page).toHaveURL(`/issue/${id}`);

    await page.locator(".issue-title").fill("Renamed from the e2e suite");
    await page.locator(".issue-description").fill("A new description.");
    await expect
      .poll(async () => (await sql<{ title: string }>(page, `SELECT title FROM issue WHERE id = $1`, [id]))[0].title)
      .toBe("Renamed from the e2e suite");
    await flushToDisk(page);

    await page.reload();
    await expect(page.locator(".issue-title")).toHaveValue("Renamed from the e2e suite", { timeout: 15000 });
    await expect(page.locator(".issue-description")).toHaveValue("A new description.");
    await expect(page.locator(".nav-link.recent")).toHaveText(["Renamed from the e2e suite"]);
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
      .poll(async () => (await sql(page, `SELECT status, priority FROM issue WHERE id = $1`, [id]))[0])
      .toEqual({ status: "done", priority: "urgent" });
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
    await expect(page.locator(".issue-count")).toHaveText(`${SEED + 1} of ${SEED + 1} issues`);
    const [row] = await sql(page, `SELECT priority, status, username FROM issue WHERE title = 'Brand new issue'`);
    expect(row).toEqual({ priority: "high", status: "backlog", username: "you" });
  });

  test("deletes an issue after confirming", async ({ page }) => {
    await open(page);
    const id = await page.locator(".issue-row").first().getAttribute("data-issue-id");
    await visit(page, `/issue/${id}`);
    await expect(page.locator(".issue-title")).not.toHaveValue("", { timeout: 15000 });

    await page.locator(".delete-button").click();
    await page.locator(".confirm-delete-button").click();
    await expect(page).toHaveURL("/");
    await expect(page.locator(".issue-count")).toHaveText(`${SEED - 1} of ${SEED - 1} issues`);
    await expect(page.locator(`.issue-row[data-issue-id='${id}']`)).toHaveCount(0);
    await expect.poll(async () => (await sql(page, `SELECT 1 FROM issue WHERE id = $1`, [id])).length).toBe(0);
  });

  test("adds a comment", async ({ page }) => {
    await open(page);
    const id = await page.locator(".issue-row").first().getAttribute("data-issue-id");
    await visit(page, `/issue/${id}`);
    await expect(page.locator(".comments-heading")).toBeVisible({ timeout: 15000 });
    const before = await page.locator(".comment").count();

    await page.locator(".comment-input").fill("Looks good to me");
    await page.locator(".comment-form button[type=submit]").click();
    await expect(page.locator(".comment")).toHaveCount(before + 1);
    await expect(page.locator(".comment").last().locator(".comment-text")).toHaveText("Looks good to me");
    await expect(page.locator(".comment").last().locator(".comment-author")).toHaveText("you");
    await expect(page.locator(".comment-input")).toHaveValue("");
    await expect
      .poll(async () => (await sql(page, `SELECT body FROM comment WHERE issue_id = $1 AND username = 'you'`, [id])).length)
      .toBe(1);
  });

  test("board shows every status column and drag-and-drop moves an issue", async ({ page }) => {
    await open(page, "/board");
    await expect(page.locator(".board-column")).toHaveCount(5);
    const counts = await sql<{ status: string; n: number }>(page, `SELECT status, count(*)::int AS n FROM issue GROUP BY status`);
    for (const { status, n } of counts) {
      await expect(page.locator(`.board-column[data-status='${status}'] .board-column-count`)).toHaveText(String(n));
    }

    const card = page.locator(".board-column[data-status='backlog'] .issue-card").first();
    const id = await card.getAttribute("data-issue-id");
    const todoBefore = counts.find((c) => c.status === "todo")!.n;
    await card.dragTo(page.locator(".board-column[data-status='todo'] .board-cards"));

    await expect(page.locator(`.board-column[data-status='todo'] .issue-card[data-issue-id='${id}']`)).toBeVisible();
    await expect(page.locator(".board-column[data-status='todo'] .board-column-count")).toHaveText(String(todoBefore + 1));
    await expect.poll(async () => (await sql(page, `SELECT status FROM issue WHERE id = $1`, [id]))[0]).toEqual({ status: "todo" });
  });

  test("a write straight into the table shows up in the UI", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = await row.getAttribute("data-issue-id");

    await sql(page, `UPDATE issue SET title = 'Changed behind jam''s back', status = 'canceled' WHERE id = $1`, [id]);
    await expect(row.locator(".issue-row-title")).toHaveText("Changed behind jam's back");
    await expect(row.locator("svg.status-canceled")).toBeVisible();

    await sql(page, `INSERT INTO issue (id, title, description, priority, status, created, modified, kanbanorder, username)
      VALUES ('00000000-0000-4000-8000-000000000001', 'Arrived from elsewhere', '', 'low', 'todo', now(), now(), 'zz', 'remote')`);
    await expect(page.locator(".issue-row-title").first()).toHaveText("Arrived from elsewhere");
    await expect(page.locator(".issue-count")).toHaveText(`${SEED + 1} of ${SEED + 1} issues`);
  });

  test("keeps only a window of rows in the DOM while scrolling a long list", async ({ page }) => {
    await page.goto("/?seed=400");
    await expect(page.locator(".issue-count")).toHaveText("400 of 400 issues", { timeout: 15000 });
    await expect(page.locator(".issue-row")).toHaveCount(100);
    const expected = await sql<{ title: string }>(page, `SELECT title FROM issue ORDER BY created DESC, id ASC OFFSET 300 LIMIT 1`);

    await page.locator(".issue-list-scroll").evaluate((el) => (el.scrollTop = 300 * 36));
    await expect(page.locator(`.issue-row-title`, { hasText: expected[0].title })).toBeVisible();
    await expect(page.locator(".issue-row")).toHaveCount(100);
    await expect(page.locator(".issue-list-scroll")).toHaveJSProperty("scrollHeight", 400 * 36);
  });
});
