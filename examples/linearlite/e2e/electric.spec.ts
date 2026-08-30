// Electric mode: the page streams facts out of Postgres through Electric and
// pushes its edits through the write server. Needs `pnpm backend:up` and
// `pnpm write-server`; run with `pnpm test:e2e:electric`.

import { test, expect, type Browser, type Page } from "@playwright/test";
import type postgres from "postgres";
import { connect } from "../db/connection";
import { insertSeedFacts, seedFacts } from "../src/seed";
import { expectCount, factKey, issuesInMemory, keysInMemory, query, watchErrors } from "./helpers";

test.skip(!process.env.VITE_ELECTRIC_URL, "needs the Electric backend: pnpm backend:up && pnpm write-server");
test.describe.configure({ mode: "serial" });

const WRITE_SERVER_URL = process.env.VITE_WRITE_SERVER_URL ?? "http://localhost:3001";
const SEED = 100;
const PER_PROJECT = 25;
const WEB = "web";
const MOBILE = "mobile";
const scopeOf = (project: string) => `project:${project}`;

let sql: postgres.Sql;

test.beforeAll(async () => {
  const health = await fetch(WRITE_SERVER_URL).catch(() => undefined);
  if (!health?.ok) throw new Error(`write server not reachable at ${WRITE_SERVER_URL}: run pnpm write-server`);
  sql = connect();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM jam_facts`;
    await insertSeedFacts((statement, params) => tx.unsafe(statement, params as never[]), seedFacts(SEED));
  });
});

test.afterAll(async () => {
  await sql?.end();
});

async function keysInPostgres(scope: string): Promise<string[]> {
  const rows = await sql<{ key: string }[]>`SELECT key FROM jam_facts WHERE scope = ${scope} ORDER BY key`;
  return rows.map((row) => row.key);
}

async function issueCountInPostgres(project: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM jam_facts WHERE scope = ${scopeOf(project)} AND t0 = '"issue"' AND t2 = '"project"'`;
  return n;
}

/** Wait until the page holds exactly the facts Postgres has in `scope`. */
async function expectMirrored(page: Page, scope: string) {
  const expected = await keysInPostgres(scope);
  await expect.poll(() => keysInMemory(page, scope), { timeout: 15000 }).toEqual(expected);
}

async function insertIssue(project: string, id: string, title: string, created = new Date().toISOString()) {
  const columns = { project, title, description: "", priority: "low", status: "todo", created, modified: created, kanbanorder: "a0", username: "remote" };
  await insertSeedFacts(
    (statement, params) => sql.unsafe(statement, params as never[]),
    Object.entries(columns).map(([column, value]) => ({ key: factKey(["issue", id, column, value]), scope: scopeOf(project) })),
  );
}

async function open(page: Page, path = `/${WEB}`) {
  watchErrors(page);
  await page.goto(path);
  await expect(page.locator(".sync-badge")).toHaveText("Synced with Electric", { timeout: 20000 });
}

async function openInFreshBrowser(browser: Browser, path = `/${WEB}`): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await open(page, path);
  return page;
}

test.describe("LinearLite on Electric", () => {
  test("loads projects and the current project's facts from Electric", async ({ page }) => {
    await open(page, "/");
    await expect(page).toHaveURL(new RegExp(`/${WEB}$`));
    await expect(page.locator(".project-menu .project-name")).toHaveText("Web App");
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    expect((await query(page, ["project", "?id", "name", "?name"])).map((p) => p.id).sort()).toEqual(["api", "design", "mobile", "web"]);
    await expectMirrored(page, scopeOf(WEB));
    expect(await issuesInMemory(page, MOBILE)).toEqual([]);
    expect(await keysInMemory(page, scopeOf(MOBILE))).toEqual([]);
  });

  test("pushes local edits to Postgres and reloads them from the local mirror", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = await row.getAttribute("data-issue-id");
    const [{ title: before }] = await query(page, ["issue", id!, "title", "?title"]);
    await row.locator(".issue-row-title").click();
    await expect(page).toHaveURL(`/${WEB}/issue/${id}`);

    await page.locator(".issue-title").fill("Renamed through Electric");
    await expect.poll(() => sql`SELECT scope FROM jam_facts WHERE key = ${factKey(["issue", id, "title", "Renamed through Electric"])}`).toEqual([{ scope: scopeOf(WEB) }]);
    await expect.poll(() => sql`SELECT 1 FROM jam_facts WHERE key = ${factKey(["issue", id, "title", before])}`).toEqual([]);
    await expect(page.locator(".sync-badge")).toHaveText("Synced with Electric");
    await expectMirrored(page, scopeOf(WEB));

    await page.reload();
    await expect(page.locator(".issue-title")).toHaveValue("Renamed through Electric", { timeout: 15000 });
    await expect(page.locator(".sync-badge")).toHaveText("Synced with Electric", { timeout: 20000 });
    await expectMirrored(page, scopeOf(WEB));
  });

  test("shows rows written straight into Postgres", async ({ page }) => {
    await open(page);
    const id = "00000000-0000-4000-8000-00000000e1ec";
    await insertIssue(WEB, id, "Arrived from Postgres");
    await expect(page.locator(".issue-row-title").first()).toHaveText("Arrived from Postgres");
    await expectCount(page, PER_PROJECT + 1, PER_PROJECT + 1);

    await sql.begin(async (tx) => {
      await tx`DELETE FROM jam_facts WHERE key = ${factKey(["issue", id, "title", "Arrived from Postgres"])}`;
      await tx`INSERT INTO jam_facts (key, scope) VALUES (${factKey(["issue", id, "title", "Retitled in Postgres"])}, ${scopeOf(WEB)})`;
    });
    await expect(page.locator(`.issue-row[data-issue-id='${id}'] .issue-row-title`)).toHaveText("Retitled in Postgres");
    await expectMirrored(page, scopeOf(WEB));

    await insertIssue(MOBILE, "00000000-0000-4000-8000-00000000e2ec", "Not this project");
    await expect.poll(() => issueCountInPostgres(MOBILE)).toBe(PER_PROJECT + 1);
    await page.waitForTimeout(500);
    expect(await issuesInMemory(page, MOBILE)).toEqual([]);

    await sql`DELETE FROM jam_facts WHERE key LIKE ${`["issue","${id}",%`}`;
    await expect(page.locator(`.issue-row[data-issue-id='${id}']`)).toHaveCount(0);
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    await expectMirrored(page, scopeOf(WEB));
  });

  test("switching projects swaps the synced scope", async ({ page }) => {
    await open(page);
    await page.locator(".project-menu .menu-trigger").click();
    await page.locator(".project-item", { hasText: "Mobile" }).click();
    await expect(page).toHaveURL(/\/mobile$/);
    const mobileIssues = await issueCountInPostgres(MOBILE);
    await expectCount(page, mobileIssues, mobileIssues);
    await expectMirrored(page, scopeOf(MOBILE));
    await expect.poll(() => issuesInMemory(page, WEB)).toEqual([]);
    await expect.poll(() => keysInMemory(page, scopeOf(WEB))).toEqual([]);

    await page.locator(".new-issue-button").click();
    await page.locator(".modal .new-issue-title").fill("Created inside Mobile");
    await page.locator(".modal .save-issue-button").click();
    await expect(page.locator(".issue-row-title").first()).toHaveText("Created inside Mobile");
    const [created] = (await issuesInMemory(page, MOBILE)).filter((issue) => issue.title === "Created inside Mobile");
    await expect.poll(() => sql`SELECT scope FROM jam_facts WHERE key = ${factKey(["issue", created.id, "project", MOBILE])}`).toEqual([{ scope: scopeOf(MOBILE) }]);
    await expect(page.locator(".sync-badge")).toHaveText("Synced with Electric");
    await expectMirrored(page, scopeOf(MOBILE));
  });

  test("two browsers converge on the same project", async ({ browser }) => {
    const a = await openInFreshBrowser(browser);
    const b = await openInFreshBrowser(browser);
    const id = await a.locator(".issue-row").first().getAttribute("data-issue-id");
    await a.locator(".issue-row-title").first().click();
    await a.locator(".issue-title").fill("Edited in browser A");
    await expect(b.locator(`.issue-row[data-issue-id='${id}'] .issue-row-title`)).toHaveText("Edited in browser A", { timeout: 15000 });

    await b.locator(`.issue-row[data-issue-id='${id}'] .issue-row-title`).click();
    await b.locator(".delete-button").click();
    await b.locator(".confirm-delete-button").click();
    await expect(a.locator(".issue-missing")).toHaveText("This issue doesn't exist.", { timeout: 15000 });
    await expect.poll(() => sql`SELECT 1 FROM jam_facts WHERE key LIKE ${`["issue","${id}",%`}`).toEqual([]);
    await expectMirrored(b, scopeOf(WEB));
    await expectMirrored(a, scopeOf(WEB));
    await Promise.all([a.context().close(), b.context().close()]);
  });
});
