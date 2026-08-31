// Synced mode: the page streams facts from a sync server and pushes its edits
// back. The suite runs its own server in-process and points pages at it with
// `?sync=ws://…`, so it needs no containers.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { WebSocketServer, type AddressInfo } from "ws";
import { createSyncServer, factKey, memoryStorage, type SyncChange, type SyncServer } from "@jam/core/server";
import type { Term } from "@jam/core";
import { entityFacts, seedServer } from "../src/seed";
import { expectCount, issuesInMemory, keysInMemory, query, watchErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

const SEED = 100;
const PER_PROJECT = 25;
const WEB = "web";
const MOBILE = "mobile";
const scopeOf = (project: string) => `project:${project}`;

let server: SyncServer;
let wss: WebSocketServer;
let syncUrl: string;

test.beforeAll(async () => {
  server = await createSyncServer({ storage: memoryStorage() });
  await seedServer(server, SEED);
  wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  wss.on("connection", (socket) => server.handle(socket));
  syncUrl = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  wss?.close();
  await server?.close();
});

const keysOnServer = (scope: string): string[] =>
  server
    .facts()
    .filter((fact) => fact.scope === scope && (fact.terms[0] === "issue" || fact.terms[0] === "comment"))
    .map((fact) => key(fact.terms))
    .sort();

const issueCountOnServer = (project: string): number =>
  server.facts().filter((fact) => fact.scope === scopeOf(project) && fact.terms[0] === "issue" && fact.terms[2] === "project").length;

const key = (terms: readonly unknown[]) => factKey(terms as Term[]);

const hasFact = (terms: readonly unknown[]): boolean => server.facts().some((fact) => key(fact.terms) === key(terms));

/** Wait until the page holds exactly the facts the server has in `scope`. */
async function expectMirrored(page: Page, scope: string) {
  await expect.poll(() => keysInMemory(page, scope), { timeout: 15000 }).toEqual(keysOnServer(scope));
}

async function insertIssue(project: string, id: string, title: string, created = new Date().toISOString()) {
  const columns = { id, project, title, description: "", priority: "low", status: "todo", created, modified: created, kanbanorder: "a0", username: "remote" };
  await server.apply(entityFacts("issue", columns, scopeOf(project)).map((fact): SyncChange => ({ op: "upsert", ...fact })));
}

async function deleteIssue(id: string) {
  const changes = server
    .facts()
    .filter((fact) => fact.terms[0] === "issue" && fact.terms[1] === id)
    .map((fact): SyncChange => ({ op: "delete", ...fact }));
  await server.apply(changes);
}

async function open(page: Page, path = `/${WEB}`) {
  watchErrors(page);
  await page.goto(`${path}?sync=${encodeURIComponent(syncUrl)}`);
  await expect(page.locator(".sync-badge")).toHaveText("Synced", { timeout: 20000 });
}

async function openInFreshBrowser(browser: Browser, path = `/${WEB}`): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await open(page, path);
  return page;
}

test.describe("LinearLite on the sync server", () => {
  test("loads projects and the current project's facts from the server", async ({ page }) => {
    await open(page, "/");
    await expect(page).toHaveURL(new RegExp(`/${WEB}(\\?|$)`));
    await expect(page.locator(".project-menu .project-name")).toHaveText("Web App");
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    expect((await query(page, ["project", "?id", "name", "?name"])).map((p) => p.id).sort()).toEqual(["api", "design", "mobile", "web"]);
    await expectMirrored(page, scopeOf(WEB));
    expect(await issuesInMemory(page, MOBILE)).toEqual([]);
    expect(await keysInMemory(page, scopeOf(MOBILE))).toEqual([]);
  });

  test("pushes local edits to the server and reloads them from the local mirror", async ({ page }) => {
    await open(page);
    const row = page.locator(".issue-row").first();
    const id = (await row.getAttribute("data-issue-id"))!;
    const [{ title: before }] = await query(page, ["issue", id!, "title", "?title"]);
    await row.locator(".issue-row-title").click();
    await expect(page).toHaveURL(new RegExp(`/${WEB}/issue/${id}`));

    await page.locator(".issue-title").fill("Renamed through the sync server");
    await expect.poll(() => hasFact(["issue", id, "title", "Renamed through the sync server"])).toBe(true);
    await expect.poll(() => hasFact(["issue", id, "title", before])).toBe(false);
    expect(server.facts().find((f) => key(f.terms) === key(["issue", id, "title", "Renamed through the sync server"]))?.scope).toBe(scopeOf(WEB));
    await expect(page.locator(".sync-badge")).toHaveText("Synced");
    await expectMirrored(page, scopeOf(WEB));

    await page.reload();
    await expect(page.locator(".issue-title")).toHaveValue("Renamed through the sync server", { timeout: 15000 });
    await expect(page.locator(".sync-badge")).toHaveText("Synced", { timeout: 20000 });
    await expectMirrored(page, scopeOf(WEB));
  });

  test("shows facts committed straight on the server", async ({ page }) => {
    await open(page);
    const id = "00000000-0000-4000-8000-00000000e1ec";
    await insertIssue(WEB, id, "Arrived from the server");
    await expect(page.locator(".issue-row-title").first()).toHaveText("Arrived from the server");
    await expectCount(page, PER_PROJECT + 1, PER_PROJECT + 1);

    await server.apply([{ op: "replace", terms: ["issue", id, "title", "Retitled on the server"], scope: scopeOf(WEB) }]);
    await expect(page.locator(`.issue-row[data-issue-id='${id}'] .issue-row-title`)).toHaveText("Retitled on the server");
    await expectMirrored(page, scopeOf(WEB));

    await insertIssue(MOBILE, "00000000-0000-4000-8000-00000000e2ec", "Not this project");
    expect(issueCountOnServer(MOBILE)).toBe(PER_PROJECT + 1);
    await page.waitForTimeout(300);
    expect(await issuesInMemory(page, MOBILE)).toEqual([]);

    await deleteIssue(id);
    await expect(page.locator(`.issue-row[data-issue-id='${id}']`)).toHaveCount(0);
    await expectCount(page, PER_PROJECT, PER_PROJECT);
    await expectMirrored(page, scopeOf(WEB));
  });

  test("switching projects swaps the synced scope", async ({ page }) => {
    await open(page);
    await page.locator(".project-menu .menu-trigger").click();
    await page.locator(".project-item", { hasText: "Mobile" }).click();
    await expect(page).toHaveURL(/\/mobile$/);
    const mobileIssues = issueCountOnServer(MOBILE);
    await expectCount(page, mobileIssues, mobileIssues);
    await expectMirrored(page, scopeOf(MOBILE));
    await expect.poll(() => issuesInMemory(page, WEB)).toEqual([]);
    await expect.poll(() => keysInMemory(page, scopeOf(WEB))).toEqual([]);

    await page.locator(".new-issue-button").click();
    await page.locator(".modal .new-issue-title").fill("Created inside Mobile");
    await page.locator(".modal .save-issue-button").click();
    await expect(page.locator(".issue-row-title").first()).toHaveText("Created inside Mobile");
    const [created] = (await issuesInMemory(page, MOBILE)).filter((issue) => issue.title === "Created inside Mobile");
    await expect.poll(() => server.facts().find((f) => key(f.terms) === key(["issue", created.id, "project", MOBILE]))?.scope).toBe(scopeOf(MOBILE));
    await expect(page.locator(".sync-badge")).toHaveText("Synced");
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
    await expect.poll(() => server.facts().some((f) => f.terms[0] === "issue" && f.terms[1] === id)).toBe(false);
    await expectMirrored(b, scopeOf(WEB));
    await expectMirrored(a, scopeOf(WEB));
    await Promise.all([a.context().close(), b.context().close()]);
  });

  test("tabs of one browser share a single connection and hand it over when the leader closes", async ({ browser }) => {
    const context = await browser.newContext();
    const a = await context.newPage();
    await open(a);
    const b = await context.newPage();
    await open(b);
    expect(server.connections).toBe(1);
    const leading = (page: Page) => page.evaluate(() => (window as unknown as { __sync: { leading: boolean } }).__sync.leading);
    expect([await leading(a), await leading(b)]).toEqual([true, false]);

    const id = await b.locator(".issue-row").first().getAttribute("data-issue-id");
    await b.locator(".issue-row-title").first().click();
    await b.locator(".issue-title").fill("Edited in the follower tab");
    await expect(a.locator(`.issue-row[data-issue-id='${id}'] .issue-row-title`)).toHaveText("Edited in the follower tab", { timeout: 15000 });
    await expect.poll(() => hasFact(["issue", id, "title", "Edited in the follower tab"])).toBe(true);
    expect(server.connections).toBe(1);

    await a.close();
    await expect.poll(() => leading(b), { timeout: 15000 }).toBe(true);
    await expect(b.locator(".sync-badge")).toHaveText("Synced", { timeout: 20000 });
    expect(server.connections).toBe(1);
    await insertIssue(WEB, "00000000-0000-4000-8000-00000000e3ec", "Arrived after the handover");
    await b.goBack();
    await expect(b.locator(".issue-row-title").first()).toHaveText("Arrived after the handover", { timeout: 15000 });
    await expectMirrored(b, scopeOf(WEB));
    await context.close();
  });
});
