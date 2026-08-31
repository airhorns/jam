import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __jam: { $: Record<string, unknown>; _: unknown };
    __db: { query(...patterns: unknown[][]): Record<string, unknown>[]; scopeOf(...terms: unknown[]): string };
    __storage: { load(): Promise<Array<{ terms: unknown[]; scope: string }>> };
    __sync: { flush(): Promise<void> };
    __persist: { flush(): Promise<void> };
  }
}

/** A pattern as plain JSON: `?name` binds a variable, `_` is a wildcard. */
export type PatternSpec = (string | number | boolean)[];

/** Read facts in the page. Works the same whether the data came from a seed, IndexedDB or the sync server. */
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

/** Keys of the issue and comment facts the page holds in `scope`, sorted, for comparing against the server's scope. */
export async function keysInMemory(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const { $ } = window.__jam;
    const keys: string[] = [];
    for (const entity of ["issue", "comment"]) {
      for (const { id, col, val } of window.__db.query([entity, $.id, $.col, $.val])) {
        const fact = [entity, id, col, val];
        if (window.__db.scopeOf(...fact) === scope) keys.push(JSON.stringify(fact));
      }
    }
    return keys.sort();
  }, scope);
}

/** The page's durable storage as `[key, scope]` pairs, after pushing buffered writes through. */
export async function storedFacts(page: Page): Promise<Array<[string, string]>> {
  await page.evaluate(() => window.__sync.flush());
  return page.evaluate(async () => (await window.__storage.load()).map((f) => [JSON.stringify(f.terms), f.scope] as [string, string]));
}

export async function storedScope(page: Page, key: string): Promise<string | undefined> {
  return (await storedFacts(page)).find(([k]) => k === key)?.[1];
}

/** Push buffered writes through the outbox and the local persistence before a reload. */
export async function flushToDisk(page: Page) {
  await page.evaluate(() => window.__sync.flush());
  await page.evaluate(() => window.__persist.flush());
}

export function watchErrors(page: Page) {
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
}

export const factKey = (fact: unknown[]) => JSON.stringify(fact);

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The list's own ordering: codepoint order on the column, then id. */
export const byTitle = (a: IssueRecord, b: IssueRecord) => compare(a.title ?? "", b.title ?? "") || a.id.localeCompare(b.id);

export const newestFirst = (a: IssueRecord, b: IssueRecord) => compare(b.created ?? "", a.created ?? "") || a.id.localeCompare(b.id);

export async function expectCount(page: Page, shown: number, total: number) {
  await expect(page.getByTestId("issue-count")).toHaveText(`${shown} of ${total} issues`);
}
