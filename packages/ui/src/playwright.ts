// Playwright helpers for reading and operating a Jam app the way an agent
// does: through `describeUI()` and `drive()`/`press()` on `window.__jam`,
// rather than through selectors. Apps expose `window.__jam` in their entry.

import type { Page } from "@playwright/test";
import type { DescribeOptions, Term, UINode } from "@jam/core";

export type NodeQuery = {
  role?: string;
  /** Exact accessible name, or a pattern to match it against. */
  name?: string | RegExp;
  /** Match only nodes with this component (as reported by `describeUI()`). */
  component?: string;
  /** Match only nodes whose state includes these entries. */
  state?: Record<string, Term>;
  /** Search only under this entity id (a node's `id` from an earlier find). */
  within?: string;
};

type JamWindow = Window & {
  __jam: {
    describeUI(options?: DescribeOptions): UINode[];
    outlineUI(options?: DescribeOptions): string;
    drive(id: string, key: string, value: Term): void;
    press(id: string): void;
  };
};

/** The page's accessibility outline as text, one node per line. */
export function outline(page: Page, options: DescribeOptions = {}): Promise<string> {
  return page.evaluate((options) => (window as unknown as JamWindow).__jam.outlineUI(options), options);
}

/** The page's accessibility tree. */
export function describe(page: Page, options: DescribeOptions = {}): Promise<UINode[]> {
  return page.evaluate((options) => (window as unknown as JamWindow).__jam.describeUI(options), options);
}

export function flatten(nodes: UINode[]): UINode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export function matches(node: UINode, query: NodeQuery): boolean {
  if (node.role === "text") return false;
  if (query.role !== undefined && node.role !== query.role) return false;
  if (typeof query.name === "string" && node.name !== query.name) return false;
  if (query.name instanceof RegExp && !query.name.test(node.name ?? "")) return false;
  if (query.component !== undefined && node.component !== query.component && node.drive?.component !== query.component) return false;
  if (query.state && Object.entries(query.state).some(([key, value]) => node.state[key] !== value)) return false;
  return true;
}

/** Every node currently matching `query`. */
export async function findAll(page: Page, query: NodeQuery, options: DescribeOptions = {}): Promise<UINode[]> {
  return flatten(await describe(page, { root: query.within, ...options })).filter((node) => matches(node, query));
}

/**
 * The first node matching `query`, waiting for it to appear. Fails with the
 * current outline so the test's author sees what the agent would have seen.
 */
export async function find(page: Page, query: NodeQuery, { timeout = 5000 }: { timeout?: number } = {}): Promise<UINode> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const [node] = await findAll(page, query);
    if (node) return node;
    if (Date.now() >= deadline) throw new Error(`No node matches ${JSON.stringify(query, (_, v) => (v instanceof RegExp ? String(v) : v))} in:\n${await outline(page)}`);
    await page.waitForTimeout(50);
  }
}

/** Set `key` on the component that owns `id`, as its user would; see `drive()` in @jam/core. */
export async function drive(page: Page, id: string, key: string, value: Term): Promise<void> {
  await page.evaluate(([id, key, value]) => (window as unknown as JamWindow).__jam.drive(id, key, value), [id, key, value] as [string, string, Term]);
}

/** Press the element with entity id `id`; see `press()` in @jam/core. */
export async function press(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => (window as unknown as JamWindow).__jam.press(id), id);
}

/** Find a node and press it. */
export async function pressNode(page: Page, query: NodeQuery): Promise<UINode> {
  const node = await find(page, query);
  await press(page, node.id!);
  return node;
}

/** Find a node and drive `key` on the component that owns it. */
export async function driveNode(page: Page, query: NodeQuery, key: string, value: Term): Promise<UINode> {
  const node = await find(page, query);
  await drive(page, node.id!, key, value);
  return node;
}
