// A minimal Electric shape server over a PGlite "Postgres", exposed as a
// `fetch` so the real @electric-sql/client + pglite-sync path runs in-process.
// It also serves the write endpoint (`POST /jam/changes`) with applyFactChanges.
//
// Shapes are recomputed by re-running their query after every commit and
// diffing against what the shape last saw, which is exactly what the client
// observes from real Electric: inserts, partial updates, deletes, then an
// `up-to-date` carrying the global LSN. Writes that go through the endpoint
// (or `apply()`) are published incrementally instead, so the double's cost
// stays proportional to the change, not the table.

import type { PGlite } from "@electric-sql/pglite";
import { compileFilter, parseFilter } from "../../filter";
import { applyFactChanges, parseFactChanges, parseFactKey, JAM_FACTS_TABLE, type ApplyOptions, type FactChangeRow } from "../../server";

interface ShapeMessage {
  offset: string;
  message: Record<string, unknown>;
}

interface ShapeLog {
  id: string;
  where: string;
  params: string[];
  matches: (key: string, scope: string) => boolean;
  handle: string;
  messages: ShapeMessage[];
  /** key → row for everything the shape currently holds. */
  rows: Map<string, Row>;
  refetch: boolean;
}

interface Row {
  id: string;
  key: string;
  scope: string;
}

const SCHEMA = JSON.stringify({ id: { type: "text" }, key: { type: "text" }, scope: { type: "text" } });

// The Electric client remembers expired handles process-wide, so handles must
// never repeat across FakeElectric instances.
let handles = 0;

export class FakeElectric {
  readonly shapeUrl = "http://electric.test/v1/shape";
  readonly writeUrl = "http://electric.test/jam/changes";
  /** When set, POSTs to the write endpoint respond with this status instead of applying. */
  failWritesWith: number | null = null;
  /** Long-poll wait before answering 204 (kept short for tests). */
  pollTimeout = 150;
  /** Passed to applyFactChanges for writes through the endpoint. */
  applyOptions: ApplyOptions = {};
  requests: string[] = [];
  writes: unknown[] = [];

  private lsn = 0;
  private shapes = new Map<string, ShapeLog>();
  private waiters = new Set<() => void>();
  readonly fetch: typeof fetch;

  constructor(private readonly pg: PGlite) {
    this.fetch = (input, init) => this.handle(String(input), init);
  }

  /** Run a server-side write and publish the resulting changes to every shape. */
  async write(fn: (pg: PGlite) => Promise<void>): Promise<void> {
    await fn(this.pg);
    await this.commit();
  }

  async sql(query: string, params: unknown[] = []): Promise<void> {
    await this.write((pg) => pg.query(query, params).then(() => {}));
  }

  /** Apply changes the way the write endpoint does and publish exactly those rows. */
  async apply(changes: FactChangeRow[]): Promise<void> {
    const keys = Array.from(new Set(changes.map((c) => c.key)));
    const attrs = changes.filter((c) => c.op === "replace").map((c) => c.key);
    const before = await this.lookup(keys, attrs);
    await this.pg.transaction((tx) => applyFactChanges((sql, params) => tx.query(sql, params), changes, this.applyOptions));
    const after = await this.lookup(keys, attrs);
    this.lsn++;
    for (const shape of this.shapes.values()) {
      const ops: Array<Record<string, unknown>> = [];
      const touched = new Set([...before.keys(), ...after.keys()]);
      for (const key of touched) {
        const prev = before.get(key);
        const next = after.get(key);
        const was = prev !== undefined && shape.matches(key, prev.scope);
        const is = next !== undefined && shape.matches(key, next.scope);
        if (is && !was) ops.push(change("insert", next!));
        else if (was && !is) ops.push(change("delete", prev!));
        else if (is && was && prev!.scope !== next!.scope) ops.push(change("update", next!));
        if (is) shape.rows.set(key, next!);
        else shape.rows.delete(key);
      }
      this.publish(shape, ops);
    }
    this.wake();
  }

  /** Publish whatever changed in jam_facts since the last commit as one LSN. */
  async commit(): Promise<void> {
    this.lsn++;
    for (const shape of this.shapes.values()) await this.refresh(shape);
    this.wake();
  }

  /** Make the next request for this shape answer 409 so the client must refetch it. */
  mustRefetch(where: string, params: string[]): void {
    const shape = this.shapes.get(shapeId(where, params));
    if (!shape) throw new Error(`no shape for ${where}`);
    shape.refetch = true;
    this.wake();
  }

  private wake() {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  /** Current rows for the given keys plus every sibling of the given attributes (what a replace may delete). */
  private async lookup(keys: string[], replaceKeys: string[]): Promise<Map<string, Row>> {
    const result = await this.pg.query<Row>(
      `SELECT id, key, scope FROM ${JAM_FACTS_TABLE}
       WHERE id IN (SELECT md5(value) FROM json_array_elements_text($1::text::json))
          OR attr IN (SELECT md5((value::jsonb - (jsonb_array_length(value::jsonb) - 1))::text) FROM json_array_elements_text($2::text::json))`,
      [JSON.stringify(keys), JSON.stringify(replaceKeys)],
    );
    return new Map(result.rows.map((r) => [r.key, r]));
  }

  private async rowsFor(where: string, params: string[]): Promise<Map<string, Row>> {
    const result = await this.pg.query<Row>(
      `SELECT id, key, scope FROM ${JAM_FACTS_TABLE}${where ? ` WHERE ${where}` : ""} ORDER BY key`,
      params,
    );
    return new Map(result.rows.map((r) => [r.key, r]));
  }

  private async refresh(shape: ShapeLog) {
    const next = await this.rowsFor(shape.where, shape.params);
    const ops: Array<Record<string, unknown>> = [];
    for (const [key, row] of next) {
      const prev = shape.rows.get(key);
      if (prev === undefined) ops.push(change("insert", row));
      else if (prev.scope !== row.scope) ops.push(change("update", row));
    }
    for (const [key, row] of shape.rows) if (!next.has(key)) ops.push(change("delete", row));
    this.publish(shape, ops);
    shape.rows = next;
  }

  private publish(shape: ShapeLog, ops: Array<Record<string, unknown>>) {
    ops.forEach((op, i) => {
      Object.assign(op.headers as object, { lsn: String(this.lsn), op_position: i, last: i === ops.length - 1 });
      shape.messages.push({ offset: `${this.lsn}_${i}`, message: op });
    });
  }

  private async createShape(where: string, params: string[]): Promise<ShapeLog> {
    const filter = parseFilter(where, params);
    if (!filter) throw new Error(`FakeElectric: unsupported where clause ${where}`);
    const compiled = compileFilter(filter);
    const rows = await this.rowsFor(where, params);
    const shape: ShapeLog = {
      id: shapeId(where, params),
      where,
      params,
      matches: (key, scope) => compiled.matches(parseFactKey(key) ?? [], scope),
      handle: `handle-${++handles}`,
      messages: [],
      rows,
      refetch: false,
    };
    for (const row of rows.values()) shape.messages.push({ offset: "0_0", message: change("insert", row) });
    this.shapes.set(shape.id, shape);
    return shape;
  }

  private async handle(url: string, init?: RequestInit): Promise<Response> {
    this.requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url.startsWith(this.writeUrl)) return this.handleWrite(init);
    const parsed = new URL(url);
    const q = parsed.searchParams;
    const where = q.get("where") ?? "";
    const params: string[] = [];
    for (let i = 1; q.has(`params[${i}]`); i++) params.push(q.get(`params[${i}]`)!);
    const offset = q.get("offset") ?? "-1";
    const handle = q.get("handle");
    const live = q.get("live") === "true";

    let shape = this.shapes.get(shapeId(where, params));
    if (!shape) {
      shape = await this.createShape(where, params);
      if (handle) return conflict(shape.handle);
    } else if (shape.refetch) {
      shape = await this.createShape(where, params);
      return conflict(shape.handle);
    } else if (handle && handle !== shape.handle) {
      return conflict(shape.handle);
    }

    let from = 0;
    if (offset !== "-1") {
      const index = shape.messages.findIndex((m) => compareOffsets(m.offset, offset) > 0);
      from = index === -1 ? shape.messages.length : index;
    }
    if (live && from >= shape.messages.length) {
      const changed = await this.waitForChange(init?.signal);
      if (!changed) {
        return new Response(null, {
          status: 204,
          headers: headers(shape, offset === "-1" ? "0_0" : offset, live),
        });
      }
      const current = this.shapes.get(shape.id)!;
      if (current !== shape) return conflict(current.handle);
    }
    const batch = shape.messages.slice(from);
    const lastOffset = batch.length ? batch[batch.length - 1].offset : offset === "-1" ? "0_0" : offset;
    const body = [...batch.map((m) => m.message), { headers: { control: "up-to-date", global_last_seen_lsn: String(this.lsn) } }];
    return new Response(JSON.stringify(body), { status: 200, headers: headers(shape, lastOffset, live) });
  }

  private waitForChange(signal?: AbortSignal | null): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (changed: boolean) => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        signal?.removeEventListener("abort", onAbort);
        resolve(changed);
      };
      const wake = () => done(true);
      const onAbort = () => done(false);
      const timer = setTimeout(() => done(false), this.pollTimeout);
      this.waiters.add(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async handleWrite(init?: RequestInit): Promise<Response> {
    const body = JSON.parse(String(init?.body));
    this.writes.push(body);
    if (this.failWritesWith) return new Response("nope", { status: this.failWritesWith });
    let changes;
    try {
      changes = parseFactChanges(body);
    } catch (e) {
      return new Response((e as Error).message, { status: 400 });
    }
    try {
      await this.apply(changes);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      return new Response((e as Error).message, { status });
    }
    return Response.json({ ok: true });
  }
}

function shapeId(where: string, params: string[]) {
  return JSON.stringify([where, params]);
}

/** Offsets are `${lsn}_${position}`; order by lsn, then position. */
function compareOffsets(a: string, b: string): number {
  const [al, ap] = a.split("_").map(Number);
  const [bl, bp] = b.split("_").map(Number);
  return al - bl || ap - bp;
}

/** Like Electric, deletes carry only the primary key and updates only the columns that changed. */
function change(operation: "insert" | "update" | "delete", row: Row) {
  const value: Record<string, string> =
    operation === "insert" ? { id: row.id, key: row.key, scope: row.scope } : operation === "update" ? { id: row.id, scope: row.scope } : { id: row.id };
  return {
    headers: { operation, relation: ["public", JAM_FACTS_TABLE] },
    key: `"public"."${JAM_FACTS_TABLE}"/"${row.id}"`,
    value,
  };
}

function headers(shape: ShapeLog, offset: string, live: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "electric-handle": shape.handle,
    "electric-offset": offset,
    "electric-schema": SCHEMA,
    "content-type": "application/json",
  };
  if (live) h["electric-cursor"] = String(Date.now());
  return h;
}

function conflict(handle: string): Response {
  return new Response(JSON.stringify([{ headers: { control: "must-refetch" } }]), {
    status: 409,
    headers: { "electric-handle": handle, "content-type": "application/json" },
  });
}
