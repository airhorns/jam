import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __jam: { $: Record<string, unknown>; _: unknown };
    __db: { query(...patterns: unknown[][]): Record<string, unknown>[] };
    __pg: { query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; syncToDisk(): Promise<void> };
    __sync: { flush(): Promise<void> };
    __persist: { flush(): Promise<void> };
  }
}

/** A pattern as plain JSON: `?name` binds a variable, `_` is a wildcard. */
export type PatternSpec = (string | number | boolean)[];

/** Read facts in the page. Works the same whether the data came from a seed, IndexedDB or Electric. */
export async function query(page: Page, ...patterns: PatternSpec[]): Promise<Record<string, unknown>[]> {
  return page.evaluate((specs) => {
    const { $, _ } = window.__jam;
    return window.__db.query(
      ...specs.map((spec) => spec.map((term) => (term === "_" ? _ : typeof term === "string" && term.startsWith("?") ? $[term.slice(1)] : term))),
    );
  }, patterns);
}

export interface IssueRecord {
  id: string;
  project?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  created?: string;
  kanbanorder?: string;
  username?: string;
}

/** Every issue of `project` currently in the page's fact database. */
export async function issuesInMemory(page: Page, project?: string): Promise<IssueRecord[]> {
  const records = new Map<string, IssueRecord>();
  for (const { id, col, val } of await query(page, ["issue", "?id", "?col", "?val"])) {
    const record = records.get(String(id)) ?? { id: String(id) };
    (record as unknown as Record<string, unknown>)[String(col)] = val;
    records.set(String(id), record);
  }
  return [...records.values()].filter((issue) => project === undefined || issue.project === project);
}

export async function sql<T = Record<string, unknown>>(page: Page, statement: string, params: unknown[] = []): Promise<T[]> {
  return page.evaluate(([q, p]) => window.__pg.query(q as string, p as unknown[]).then((r) => r.rows), [statement, params]) as Promise<T[]>;
}

/** Push buffered writes through the outbox and force PGlite to durable storage before a reload. */
export async function flushToDisk(page: Page) {
  await page.evaluate(() => window.__sync.flush());
  await page.evaluate(() => window.__persist.flush());
  await page.evaluate(() => window.__pg.syncToDisk());
}

export function watchErrors(page: Page) {
  page.on("pageerror", (err) => {
    if (err.message !== "ErrnoError") console.log(`[pageerror] ${err.message}`);
  });
}

export const factKey = (fact: unknown[]) => JSON.stringify(fact);

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The list's own ordering: codepoint order on the column, then id. */
export const byTitle = (a: IssueRecord, b: IssueRecord) => compare(a.title ?? "", b.title ?? "") || a.id.localeCompare(b.id);

export const newestFirst = (a: IssueRecord, b: IssueRecord) => compare(b.created ?? "", a.created ?? "") || a.id.localeCompare(b.id);

export async function expectCount(page: Page, shown: number, total: number) {
  await expect(page.locator(".issue-count")).toHaveText(`${shown} of ${total} issues`);
}
