// Server side of sync(): the `jam_facts` table every durable fact lives in, the
// write endpoint that applies a client's outbox to it, and the proxy that puts
// an authorization check in front of Electric. Dependency-free so it can run
// against any Postgres client (`postgres`, `pg`, PGlite in tests).
//
//   import { JAM_FACTS_SQL, applyFactChanges, parseFactChanges, shapeProxy } from "@jam/core/server";
//   await sql.unsafe(JAM_FACTS_SQL);
//   const allow = (scope: string) => scope === "" || session.projects.includes(scope);
//   app.post("/jam/changes", async (c) => {
//     const changes = parseFactChanges(await c.req.json());
//     await sql.begin((tx) => applyFactChanges((q, p) => tx.unsafe(q, p), changes, { allow }));
//     return c.json({ ok: true });
//   });
//   const proxy = shapeProxy({ electricUrl: "http://localhost:3000", allow: (filter) => filter.scope !== undefined && allow(filter.scope) });
//   app.get("/jam/shape", (c) => proxy(c.req.raw));

import { compileFilter, parseFilter, type FactFilter } from "./filter";
import type { Fact, Term } from "./terms";

export type { FactFilter } from "./filter";

export const JAM_FACTS_TABLE = "jam_facts";

/**
 * One row per fact. `key` is JSON.stringify(terms) — the FactDB key — and the
 * trigger derives everything else: `id` (md5 of the key, so a fact of any size
 * fits the primary key index), `attr` (md5 of the key minus its last term, so
 * every value of one attribute shares it), `terms`, and the first three terms
 * as JSON text (`"issue"`, `1`) for Electric shapes to filter on.
 */
export const JAM_FACTS_SQL = `
CREATE TABLE IF NOT EXISTS ${JAM_FACTS_TABLE} (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  attr TEXT NOT NULL,
  terms JSONB NOT NULL,
  t0 TEXT,
  t1 TEXT,
  t2 TEXT
);
CREATE OR REPLACE FUNCTION ${JAM_FACTS_TABLE}_derive() RETURNS trigger AS $$
BEGIN
  NEW.id := md5(NEW.key);
  NEW.terms := NEW.key::jsonb;
  NEW.attr := md5((NEW.terms - (jsonb_array_length(NEW.terms) - 1))::text);
  NEW.t0 := (NEW.terms->0)::text;
  NEW.t1 := (NEW.terms->1)::text;
  NEW.t2 := (NEW.terms->2)::text;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ${JAM_FACTS_TABLE}_derive ON ${JAM_FACTS_TABLE};
CREATE TRIGGER ${JAM_FACTS_TABLE}_derive BEFORE INSERT OR UPDATE OF key ON ${JAM_FACTS_TABLE}
  FOR EACH ROW EXECUTE FUNCTION ${JAM_FACTS_TABLE}_derive();
CREATE INDEX IF NOT EXISTS ${JAM_FACTS_TABLE}_scope ON ${JAM_FACTS_TABLE} (scope);
CREATE INDEX IF NOT EXISTS ${JAM_FACTS_TABLE}_attr ON ${JAM_FACTS_TABLE} (attr);
CREATE INDEX IF NOT EXISTS ${JAM_FACTS_TABLE}_t0_t1 ON ${JAM_FACTS_TABLE} (t0, t1);
`;

/** The columns a client mirrors; every shape over jam_facts selects exactly these. */
export const JAM_FACTS_COLUMNS = ["id", "key", "scope"] as const;

export type FactOp = "upsert" | "delete" | "replace";

/** One outbox entry. `replace` upserts the fact and removes every other fact in the same scope sharing all but its last term. */
export interface FactChangeRow {
  op: FactOp;
  key: string;
  scope: string;
}

/** Runs a statement; may resolve to the rows themselves (postgres.js) or to `{ rows }` (PGlite, pg). */
export type SqlExecutor = (sql: string, params: unknown[]) => Promise<unknown>;

export function factKey(fact: Fact): string {
  return JSON.stringify(fact);
}

/** Parse a fact key back into terms, or return null when it isn't one. */
export function parseFactKey(key: string): Fact | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  for (const term of parsed) {
    const kind = typeof term;
    if (kind !== "string" && kind !== "number" && kind !== "boolean") return null;
  }
  return parsed as Term[];
}

/** Validate a request body of the form `{ changes: FactChangeRow[] }`; throws with a message safe to return as a 400. */
export function parseFactChanges(body: unknown): FactChangeRow[] {
  const changes = (body as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes)) throw new Error("expected { changes: [...] }");
  return changes.map((change, index) => {
    const { op, key, scope = "" } = (change ?? {}) as Partial<FactChangeRow>;
    if (op !== "upsert" && op !== "delete" && op !== "replace") throw new Error(`changes[${index}]: unknown op`);
    if (typeof key !== "string" || !parseFactKey(key)) throw new Error(`changes[${index}]: key is not a fact`);
    if (typeof scope !== "string") throw new Error(`changes[${index}]: scope must be a string`);
    if (op === "replace" && parseFactKey(key)!.length < 2) throw new Error(`changes[${index}]: replace needs 2+ terms`);
    return { op, key, scope };
  });
}

// --- Authorization ---

export interface ApplyOptions {
  /**
   * Whether the caller may touch facts in `scope`. Checked against the scope
   * each change carries and against the scope already stored for that key, so
   * a caller can neither write into nor move facts out of a partition it
   * doesn't own.
   */
  allow?: (scope: string) => boolean;
}

export class ForbiddenScopeError extends Error {
  readonly status = 403;
  constructor(readonly scope: string) {
    super(`scope ${JSON.stringify(scope)} is not allowed`);
  }
}

/** Postgres error classes for bad data (22), constraint violations (23) and size limits (54): the batch will never apply, so answer 400. */
export function isDataError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(22|23|54)/.test(code);
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

const keysJson = (changes: FactChangeRow[]) => JSON.stringify(changes.map((c) => c.key));

async function authorize(exec: SqlExecutor, changes: FactChangeRow[], allow: (scope: string) => boolean): Promise<void> {
  for (const change of changes) {
    if (change.op !== "delete" && !allow(change.scope)) throw new ForbiddenScopeError(change.scope);
  }
  const stored = rowsOf<{ scope: string }>(
    await exec(
      `SELECT scope FROM ${JAM_FACTS_TABLE}
       WHERE id IN (SELECT md5(value) FROM json_array_elements_text($1::text::json))
       FOR UPDATE`,
      [keysJson(changes)],
    ),
  );
  for (const { scope } of stored) if (!allow(scope)) throw new ForbiddenScopeError(scope);
}

// --- Applying changes ---

/**
 * Apply changes in order. Run inside a transaction so a batch lands atomically.
 * Consecutive upserts (and deletes) go down as one statement; replaces run one
 * at a time because their order decides which value survives.
 */
export async function applyFactChanges(exec: SqlExecutor, changes: FactChangeRow[], options: ApplyOptions = {}): Promise<void> {
  if (options.allow) await authorize(exec, changes, options.allow);
  let start = 0;
  while (start < changes.length) {
    const op = changes[start].op;
    let end = start + 1;
    while (end < changes.length && changes[end].op === op) end++;
    const run = changes.slice(start, end);
    start = end;
    switch (op) {
      case "delete":
        await exec(
          `DELETE FROM ${JAM_FACTS_TABLE} WHERE id IN (SELECT md5(value) FROM json_array_elements_text($1::text::json))`,
          [keysJson(run)],
        );
        break;
      case "upsert":
        await upsert(exec, run);
        break;
      case "replace":
        for (const change of run) {
          await upsert(exec, [change]);
          await exec(
            `DELETE FROM ${JAM_FACTS_TABLE}
             WHERE attr = (SELECT attr FROM ${JAM_FACTS_TABLE} WHERE id = md5($1)) AND scope = $2 AND id <> md5($1)`,
            [change.key, change.scope],
          );
        }
        break;
    }
  }
}

function upsert(exec: SqlExecutor, changes: FactChangeRow[]): Promise<unknown> {
  const latest = new Map(changes.map((c) => [c.key, c.scope]));
  const rows = Array.from(latest, ([key, scope]) => ({ key, scope }));
  return exec(
    `INSERT INTO ${JAM_FACTS_TABLE} (key, scope)
     SELECT key, scope FROM json_to_recordset($1::text::json) AS t(key TEXT, scope TEXT)
     ON CONFLICT (id) DO UPDATE SET scope = EXCLUDED.scope WHERE ${JAM_FACTS_TABLE}.scope <> EXCLUDED.scope`,
    [JSON.stringify(rows)],
  );
}

// --- Shape proxy ---

export interface ShapeProxyOptions {
  /** Electric's base URL, e.g. `http://localhost:3000`. */
  electricUrl: string;
  /** Whether the caller may read this slice; `filter.scope` is undefined when the client asked for every partition. */
  allow: (filter: FactFilter, request: Request) => boolean | Promise<boolean>;
  /** Query params added on the way to Electric, e.g. `source_id`/`secret` for Electric Cloud. */
  params?: Record<string, string>;
  fetch?: typeof fetch;
}

/** Electric protocol params a client may set; everything else is dropped, and `subset__*` only narrow the result within the authorized shape. */
const PASSTHROUGH = new Set([
  "offset",
  "handle",
  "live",
  "live_sse",
  "experimental_live_sse",
  "cursor",
  "expired_handle",
  "log",
  "replica",
  "cache-buster",
  "subset__where",
  "subset__params",
  "subset__where_expr",
  "subset__limit",
  "subset__offset",
  "subset__order_by",
  "subset__order_by_expr",
]);

/** The client sends column lists as quoted identifiers (`"id","key"`); plain names are accepted too. */
function parseColumns(value: string | null): string[] | null {
  const columns: string[] = [];
  for (const raw of (value ?? "").split(",").filter(Boolean)) {
    const quoted = /^"((?:[^"]|"")*)"$/.exec(raw);
    const name = quoted ? quoted[1].replace(/""/g, '"') : raw;
    if (!(JAM_FACTS_COLUMNS as readonly string[]).includes(name)) return null;
    columns.push(name);
  }
  return columns;
}

/**
 * A `Request → Response` handler that admits shape requests over jam_facts
 * whose filter `allow` accepts and forwards them to Electric. Serve it at the
 * `shapeUrl` clients are given, and Electric itself never has to be reachable.
 */
export function shapeProxy(options: ShapeProxyOptions): (request: Request) => Promise<Response> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const upstream = new URL("/v1/shape", options.electricUrl);
  return async (request) => {
    if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
    const query = new URL(request.url).searchParams;
    if (query.get("table") !== JAM_FACTS_TABLE) return new Response("unknown table", { status: 400 });
    const columns = parseColumns(query.get("columns"));
    if (!columns) return new Response("unknown column", { status: 400 });
    const params: string[] = [];
    for (let i = 1; query.has(`params[${i}]`); i++) params.push(query.get(`params[${i}]`)!);
    const filter = parseFilter(query.get("where") ?? "", params);
    if (!filter) return new Response("unsupported where clause", { status: 400 });
    if (!(await options.allow(filter, request))) return new Response("forbidden", { status: 403 });

    const compiled = compileFilter(filter);
    const url = new URL(upstream);
    url.searchParams.set("table", JAM_FACTS_TABLE);
    if (columns.length) url.searchParams.set("columns", columns.map((c) => `"${c}"`).join(","));
    if (compiled.where) {
      url.searchParams.set("where", compiled.where);
      compiled.params.forEach((p, i) => url.searchParams.set(`params[${i + 1}]`, p));
    }
    for (const [name, value] of query) if (PASSTHROUGH.has(name)) url.searchParams.set(name, value);
    for (const [name, value] of Object.entries(options.params ?? {})) url.searchParams.set(name, value);

    const response = await doFetch(url, { signal: request.signal });
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    const cache = headers.get("cache-control");
    if (cache) headers.set("cache-control", privateCache(cache));
    return new Response(response.body, { status: response.status, headers });
  };
}

/** The response now depends on who asked, so only the caller's own cache may keep it. */
function privateCache(directives: string): string {
  const kept = directives
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d && d !== "public" && d !== "private" && !d.startsWith("s-maxage"));
  return ["private", ...kept].join(", ");
}
