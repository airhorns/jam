// syncTable() — a two-way bridge between a PGlite table and the fact database.
//
// Read side: a (optionally windowed) live query mirrors each row as
// [entity, id, column, value] facts, so anything that lands in the table —
// local writes, Electric shape sync, seed scripts — shows up as facts.
// Write side: fact mutations on the entity are collected and flushed back
// to the table as UPDATE / INSERT / DELETE statements.

import { db, $, _, type Term, type Fact } from "./db";
import { applyFacts, isApplying } from "./applying";
import type { JamPGlite } from "./pglite";
import type { LiveQuery, LiveQueryResults } from "@electric-sql/pglite/live";

export interface SyncTableOptions {
  /** Table that writes go to; also the default `SELECT * FROM table` source. */
  table: string;
  /** Primary key column (default: "id"). */
  key?: string;
  /** First term of the emitted facts (default: the table name). */
  entity?: string;
  /** Custom SELECT; must return the key column. Defaults to `SELECT * FROM table`. */
  query?: string;
  params?: unknown[];
  /** Window the query; offset and limit must be given together. */
  offset?: number;
  limit?: number;
  /** When set, emit ordering/meta facts under ["query", name, ...]. */
  name?: string;
  /** Columns that are never written back (e.g. generated columns). */
  readonly?: string[];
  /** Write fact mutations back to the table (default: true). */
  writable?: boolean;
  /** Debounce for write-back in ms (default: 0 — flush on the next microtask). */
  writeDebounce?: number;
  onError?: (error: unknown) => void;
}

export interface SyncedTable {
  /** Resolves once the initial rows have been mirrored into facts. */
  ready: Promise<void>;
  /** Move the window of a windowed query, or re-run the query. */
  refresh(options?: { offset?: number; limit?: number }): Promise<void>;
  /** Stop mirroring, release this binding's facts, and flush pending writes. */
  dispose(): Promise<void>;
}

type Row = Record<string, unknown>;
/** column → value; NULL columns are absent. */
type Cells = Map<string, Term>;
type RowMap = Map<Term, Cells>;

export interface RowDiff {
  sets: Array<[id: Term, col: string, value: Term]>;
  clears: Array<[id: Term, col: string]>;
}

/** Convert a SQL value into a fact term; null/undefined become null (absence). */
export function toTerm(value: unknown): Term | null {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return Number(value);
    case "object":
      return value instanceof Date ? value.toISOString() : JSON.stringify(value);
    default:
      return String(value);
  }
}

export function rowsToMap(rows: Row[], key: string): RowMap {
  const map: RowMap = new Map();
  for (const row of rows) {
    const id = toTerm(row[key]);
    if (id === null) throw new Error(`syncTable: row is missing key column "${key}"`);
    const cells: Cells = new Map();
    for (const col in row) {
      if (col === key) continue;
      const value = toTerm(row[col]);
      if (value !== null) cells.set(col, value);
    }
    map.set(id, cells);
  }
  return map;
}

/** Cells to set and cells to clear to get from `prev` to `next`. */
export function diffRows(prev: RowMap, next: RowMap): RowDiff {
  const sets: RowDiff["sets"] = [];
  const clears: RowDiff["clears"] = [];
  for (const [id, cells] of next) {
    const before = prev.get(id);
    for (const [col, value] of cells) {
      if (!before || before.get(col) !== value) sets.push([id, col, value]);
    }
    if (before) {
      for (const col of before.keys()) {
        if (!cells.has(col)) clears.push([id, col]);
      }
    }
  }
  for (const [id, cells] of prev) {
    if (next.has(id)) continue;
    for (const col of cells.keys()) clears.push([id, col]);
  }
  return { sets, clears };
}

function quoteIdent(name: string): string {
  return name
    .split(".")
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(".");
}

// --- Per-entity shared state ---

/** Tracks which (id, column) cells are held by how many bindings, so overlapping queries don't retract each other's facts. */
class HoldRegistry {
  private counts = new Map<Term, Map<string, number>>();

  acquire(id: Term, col: string): void {
    let row = this.counts.get(id);
    if (!row) this.counts.set(id, (row = new Map()));
    row.set(col, (row.get(col) ?? 0) + 1);
  }

  /** Returns true when this was the last holder. */
  release(id: Term, col: string): boolean {
    const row = this.counts.get(id);
    const count = row?.get(col);
    if (!row || count === undefined) return true;
    if (count > 1) {
      row.set(col, count - 1);
      return false;
    }
    row.delete(col);
    if (row.size === 0) this.counts.delete(id);
    return true;
  }

  get empty(): boolean {
    return this.counts.size === 0;
  }
}

/** Changes queued for one row; `deleted` is set the moment the row's last fact is retracted. */
interface PendingRow {
  deleted: boolean;
  cols: Map<string, Term | null>;
}

/** Cells of a row with writes in progress, counted because batches can overlap. */
interface InflightRow {
  deleted: number;
  cols: Map<string, number>;
}

class TableWriter {
  private pending = new Map<Term, PendingRow>();
  private inflight = new Map<Term, InflightRow>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduled = false;
  private chain: Promise<void> = Promise.resolve();
  private unobserve: () => void;
  readonly readonlyColumns: Set<string>;
  bindings = 0;

  constructor(
    private pg: JamPGlite,
    readonly entity: string,
    readonly table: string,
    readonly key: string,
    readonlyColumns: string[],
    private debounceMs: number,
    private onError: (error: unknown) => void,
  ) {
    this.readonlyColumns = new Set(readonlyColumns);
    this.unobserve = db.observe((type, _key, fact) => this.onFact(type, fact));
  }

  isPending(id: Term, col: string): boolean {
    const pending = this.pending.get(id);
    if (pending && (pending.deleted || pending.cols.has(col))) return true;
    const inflight = this.inflight.get(id);
    return inflight !== undefined && (inflight.deleted > 0 || (inflight.cols.get(col) ?? 0) > 0);
  }

  private onFact(type: "add" | "delete", fact: Fact): void {
    if (isApplying() || fact.length !== 4 || fact[0] !== this.entity) return;
    const [, id, col, value] = fact;
    if (typeof col !== "string") return;
    const writable = !this.readonlyColumns.has(col);
    let row = this.pending.get(id);
    if (type === "add") {
      if (!writable) return;
      if (!row) this.pending.set(id, (row = { deleted: false, cols: new Map() }));
      row.deleted = false;
      row.cols.set(col, value);
    } else {
      const gone = db.query([this.entity, id, _, _]).length === 0;
      if (!writable && !gone) return;
      if (!row) this.pending.set(id, (row = { deleted: false, cols: new Map() }));
      if (writable) row.cols.set(col, null);
      if (gone) row.deleted = true;
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.debounceMs > 0) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), this.debounceMs);
    } else if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush());
    }
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.scheduled = false;
    if (this.pending.size === 0) return this.chain;
    const batch = this.pending;
    this.pending = new Map();
    for (const [id, row] of batch) {
      let inflight = this.inflight.get(id);
      if (!inflight) this.inflight.set(id, (inflight = { deleted: 0, cols: new Map() }));
      if (row.deleted) inflight.deleted++;
      for (const col of row.cols.keys()) inflight.cols.set(col, (inflight.cols.get(col) ?? 0) + 1);
    }
    this.chain = this.chain
      .then(() => this.write(batch))
      .catch((e) => this.onError(e))
      .finally(() => {
        for (const [id, row] of batch) {
          const inflight = this.inflight.get(id);
          if (!inflight) continue;
          if (row.deleted) inflight.deleted--;
          for (const col of row.cols.keys()) {
            const count = (inflight.cols.get(col) ?? 1) - 1;
            if (count > 0) inflight.cols.set(col, count);
            else inflight.cols.delete(col);
          }
          if (inflight.deleted === 0 && inflight.cols.size === 0) this.inflight.delete(id);
        }
      });
    return this.chain;
  }

  private async write(batch: Map<Term, PendingRow>): Promise<void> {
    const table = quoteIdent(this.table);
    const key = quoteIdent(this.key);
    await this.pg.transaction(async (tx) => {
      for (const [id, row] of batch) {
        if (row.deleted) {
          await tx.query(`DELETE FROM ${table} WHERE ${key} = $1`, [id]);
          continue;
        }
        const entries = Array.from(row.cols);
        const assignments = entries.map(([col], i) => `${quoteIdent(col)} = $${i + 2}`).join(", ");
        const updated = await tx.query(`UPDATE ${table} SET ${assignments} WHERE ${key} = $1`, [
          id,
          ...entries.map(([, value]) => value),
        ]);
        if (updated.affectedRows === 0) {
          const insert = this.insertStatement(id, table, key);
          await tx.query(insert.sql, insert.params);
        }
      }
    });
  }

  /** INSERT built from every current fact of the row, so columns set in earlier batches are included. */
  private insertStatement(id: Term, table: string, key: string): { sql: string; params: Term[] } {
    const cols = [key];
    const values: Term[] = [id];
    for (const { col, value } of db.query([this.entity, id, $.col, $.value])) {
      if (typeof col !== "string" || this.readonlyColumns.has(col)) continue;
      cols.push(quoteIdent(col));
      values.push(value);
    }
    const placeholders = values.map((_v, i) => `$${i + 1}`).join(", ");
    return { sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`, params: values };
  }

  async close(): Promise<void> {
    this.unobserve();
    await this.flush();
  }
}

interface EntityState {
  holds: HoldRegistry;
  writer: TableWriter | null;
  bindings: number;
}

const entities = new Map<string, EntityState>();

/** Which binding owns each query name; a newer binding with the same name takes it over. */
const nameOwners = new Map<string, object>();

function entityState(entity: string): EntityState {
  let state = entities.get(entity);
  if (!state) entities.set(entity, (state = { holds: new HoldRegistry(), writer: null, bindings: 0 }));
  return state;
}

// --- Binding ---

export function syncTable(pg: JamPGlite, options: SyncTableOptions): SyncedTable {
  const {
    table,
    key = "id",
    entity = table,
    query = `SELECT * FROM ${quoteIdent(table)}`,
    params,
    offset,
    limit,
    name,
    readonly = [],
    writable = true,
    writeDebounce = 0,
    onError = (e) => console.error(`[jam] syncTable(${entity}) failed`, e),
  } = options;

  const state = entityState(entity);
  state.bindings++;

  if (writable) {
    if (state.writer) {
      if (state.writer.table !== table || state.writer.key !== key) {
        state.bindings--;
        throw new Error(
          `syncTable: entity "${entity}" is already bound to ${state.writer.table}(${state.writer.key}); cannot also write to ${table}(${key})`,
        );
      }
      for (const col of readonly) state.writer.readonlyColumns.add(col);
    } else {
      state.writer = new TableWriter(pg, entity, table, key, readonly, writeDebounce, onError);
    }
    state.writer.bindings++;
  }
  const writer = writable ? state.writer : null;
  const isPending = (id: Term, col: string) => state.writer?.isPending(id, col) === true;

  let held: RowMap = new Map();
  /** Absolute row index → id, for the ["query", name, "row", index, id] facts. */
  let positions = new Map<number, Term>();
  const nameToken = {};
  if (name !== undefined) nameOwners.set(name, nameToken);
  const ownsName = () => name !== undefined && nameOwners.get(name) === nameToken;
  let metaInitialised = false;
  let live: LiveQuery<Row> | null = null;
  let disposed = false;

  const apply = (results: LiveQueryResults<Row>) => {
    if (disposed) return;
    let next: RowMap;
    try {
      next = rowsToMap(results.rows, key);
    } catch (e) {
      onError(e);
      return;
    }
    const { sets, clears } = diffRows(held, next);
    applyFacts(() => {
      for (const [id, col, value] of sets) {
        if (!held.get(id)?.has(col)) state.holds.acquire(id, col);
        if (!isPending(id, col)) db.replace(entity, id, col, value);
      }
      for (const [id, col] of clears) {
        const last = state.holds.release(id, col);
        if (last && !isPending(id, col)) db.drop(entity, id, col, _);
      }
      if (ownsName()) applyMeta(results, next);
    });
    held = next;
  };

  const applyMeta = (results: LiveQueryResults<Row>, next: RowMap) => {
    if (!metaInitialised) {
      // Clear whatever a previous owner of this name left behind.
      db.drop("query", name!, _, _);
      db.drop("query", name!, _, _, _);
      metaInitialised = true;
    }
    const base = results.offset ?? 0;
    const nextPositions = new Map<number, Term>();
    let i = base;
    for (const id of next.keys()) nextPositions.set(i++, id);
    for (const [index, id] of nextPositions) {
      if (positions.get(index) !== id) db.replace("query", name!, "row", index, id);
    }
    for (const index of positions.keys()) {
      if (!nextPositions.has(index)) db.drop("query", name!, "row", index, _);
    }
    positions = nextPositions;
    db.replace("query", name!, "total", Number(results.totalCount ?? results.rows.length));
    if (results.offset !== undefined) db.replace("query", name!, "offset", results.offset);
    if (results.limit !== undefined) db.replace("query", name!, "limit", results.limit);
    db.insert("query", name!, "ready", true);
  };

  const ready = pg.live
    .query<Row>({ query, params: params as any[] | undefined, offset, limit, callback: apply })
    .then((lq) => {
      if (disposed) return lq.unsubscribe();
      live = lq;
    });
  ready.catch(onError);

  const refresh = async (o?: { offset?: number; limit?: number }) => {
    await ready;
    await live?.refresh(o);
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await ready.catch(() => {});
    await live?.unsubscribe();
    live = null;
    await writer?.flush();
    applyFacts(() => {
      for (const [id, cells] of held) {
        for (const col of cells.keys()) {
          if (state.holds.release(id, col)) db.drop(entity, id, col, _);
        }
      }
      held = new Map();
      if (ownsName()) {
        db.drop("query", name!, _, _);
        db.drop("query", name!, _, _, _);
        nameOwners.delete(name!);
      }
      positions = new Map();
    });
    state.bindings--;
    if (writer) {
      writer.bindings--;
      if (writer.bindings === 0) {
        await writer.close();
        if (state.writer === writer) state.writer = null;
      }
    }
    if (state.bindings === 0 && state.holds.empty && !state.writer && entities.get(entity) === state) {
      entities.delete(entity);
    }
  };

  return { ready, refresh, dispose };
}
