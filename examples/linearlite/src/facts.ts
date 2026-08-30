import { $, when, type Term } from "@jam/core";

/** Collect an entity's [entity, id, column, value] facts into a record; undefined when there are none. */
export function readEntity<T extends object>(entity: string, id: string): Partial<T> | undefined {
  const rows = when([entity, id, $.col, $.val]);
  if (rows.length === 0) return undefined;
  const record: Record<string, Term> = {};
  for (const row of rows) record[String(row.col)] = row.val;
  return record as Partial<T>;
}

/** Row ids of a named syncTable query in display order. */
export function queryRows(name: string): string[] {
  return when(["query", name, "row", $.index, $.id])
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map((row) => String(row.id));
}

export interface QueryMeta {
  ready: boolean;
  total: number;
  offset: number;
  limit: number;
}

export function queryMeta(name: string): QueryMeta {
  const meta: QueryMeta = { ready: false, total: 0, offset: 0, limit: 0 };
  for (const row of when(["query", name, $.key, $.value])) {
    if (row.key === "ready") meta.ready = row.value === true;
    else if (row.key === "total" || row.key === "offset" || row.key === "limit") meta[row.key] = Number(row.value);
  }
  return meta;
}

export function readValue(entity: string, id: string, column: string): Term | undefined {
  return when([entity, id, column, $.value])[0]?.value;
}

export function formatDate(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
