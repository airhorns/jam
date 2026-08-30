// Server side of sync(): the `jam_facts` table every durable fact lives in, and
// the write endpoint that applies a client's outbox to it. Dependency-free so it
// can run against any Postgres client (`postgres`, `pg`, PGlite in tests).
//
//   import { JAM_FACTS_SQL, applyFactChanges, parseFactChanges } from "@jam/core/server";
//   await sql.unsafe(JAM_FACTS_SQL);
//   app.post("/jam/changes", async (c) => {
//     const changes = parseFactChanges(await c.req.json());
//     await sql.begin((tx) => applyFactChanges((q, p) => tx.unsafe(q, p), changes));
//     return c.json({ ok: true });
//   });
//
// Authorization (which scopes a caller may write) is the endpoint's job before
// it calls applyFactChanges.

import type { Fact, Term } from "./db";

export const JAM_FACTS_TABLE = "jam_facts";

/**
 * One row per fact. `key` is JSON.stringify(terms) — the FactDB key — and the
 * trigger derives `terms` plus the first three terms as JSON text (`"issue"`,
 * `1`) so Electric shapes can filter on `scope`, `t0`, `t1`, `t2`.
 */
export const JAM_FACTS_SQL = `
CREATE TABLE IF NOT EXISTS ${JAM_FACTS_TABLE} (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT '',
  terms JSONB NOT NULL,
  t0 TEXT,
  t1 TEXT,
  t2 TEXT
);
CREATE OR REPLACE FUNCTION ${JAM_FACTS_TABLE}_derive() RETURNS trigger AS $$
BEGIN
  NEW.terms := NEW.key::jsonb;
  NEW.t0 := (NEW.terms->0)::text;
  NEW.t1 := (NEW.terms->1)::text;
  NEW.t2 := (NEW.terms->2)::text;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ${JAM_FACTS_TABLE}_derive ON ${JAM_FACTS_TABLE};
CREATE TRIGGER ${JAM_FACTS_TABLE}_derive BEFORE INSERT OR UPDATE OF key ON ${JAM_FACTS_TABLE}
  FOR EACH ROW EXECUTE FUNCTION ${JAM_FACTS_TABLE}_derive();
CREATE INDEX IF NOT EXISTS ${JAM_FACTS_TABLE}_scope ON ${JAM_FACTS_TABLE} (scope);
CREATE INDEX IF NOT EXISTS ${JAM_FACTS_TABLE}_t0_t1 ON ${JAM_FACTS_TABLE} (t0, t1);
`;

export type FactOp = "upsert" | "delete" | "replace";

/** One outbox entry. `replace` upserts the fact and removes every other fact sharing all but its last term. */
export interface FactChangeRow {
  op: FactOp;
  key: string;
  scope: string;
}

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

/** `["issue","i1","title",` — every fact sharing all but the last term has a key starting with this. */
export function replacePrefix(fact: Fact): string {
  return `${JSON.stringify(fact.slice(0, -1)).slice(0, -1)},`;
}

/** Apply changes in order. Run inside a transaction so a batch lands atomically. */
export async function applyFactChanges(exec: SqlExecutor, changes: FactChangeRow[]): Promise<void> {
  for (const change of changes) {
    switch (change.op) {
      case "delete":
        await exec(`DELETE FROM ${JAM_FACTS_TABLE} WHERE key = $1`, [change.key]);
        break;
      case "upsert":
        await upsert(exec, change);
        break;
      case "replace": {
        await upsert(exec, change);
        const fact = parseFactKey(change.key)!;
        await exec(
          `DELETE FROM ${JAM_FACTS_TABLE} WHERE starts_with(key, $1) AND jsonb_array_length(terms) = $2 AND key <> $3`,
          [replacePrefix(fact), fact.length, change.key],
        );
        break;
      }
    }
  }
}

function upsert(exec: SqlExecutor, change: FactChangeRow): Promise<unknown> {
  return exec(
    `INSERT INTO ${JAM_FACTS_TABLE} (key, scope) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET scope = EXCLUDED.scope WHERE ${JAM_FACTS_TABLE}.scope <> EXCLUDED.scope`,
    [change.key, change.scope],
  );
}
