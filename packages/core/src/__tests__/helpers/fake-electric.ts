// A minimal Electric shape server over a PGlite "Postgres", exposed as a
// `fetch` so the real @electric-sql/client + pglite-sync path runs in-process.
// It also serves the write endpoint (`POST /jam/changes`) with applyFactChanges.
//
// Shapes are recomputed by re-running their query after every commit and
// diffing against what the shape last saw, which is exactly what the client
// observes from real Electric: inserts, partial updates, deletes, then an
// `up-to-date` carrying the global LSN.

import type { PGlite } from "@electric-sql/pglite";
import { applyFactChanges, parseFactChanges, JAM_FACTS_TABLE } from "../../server";

interface ShapeMessage {
  offset: string;
  message: Record<string, unknown>;
}

interface ShapeLog {
  id: string;
  where: string;
  params: string[];
  handle: string;
  messages: ShapeMessage[];
  rows: Map<string, string>;
  refetch: boolean;
}

const SCHEMA = JSON.stringify({ key: { type: "text" }, scope: { type: "text" } });

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

  private async rowsFor(where: string, params: string[]): Promise<Map<string, string>> {
    const result = await this.pg.query<{ key: string; scope: string }>(
      `SELECT key, scope FROM ${JAM_FACTS_TABLE}${where ? ` WHERE ${where}` : ""} ORDER BY key`,
      params,
    );
    return new Map(result.rows.map((r) => [r.key, r.scope]));
  }

  private async refresh(shape: ShapeLog) {
    const next = await this.rowsFor(shape.where, shape.params);
    const ops: Array<Record<string, unknown>> = [];
    for (const [key, scope] of next) {
      const prev = shape.rows.get(key);
      if (prev === undefined) ops.push(change("insert", key, { key, scope }));
      else if (prev !== scope) ops.push(change("update", key, { key, scope }));
    }
    for (const key of shape.rows.keys()) if (!next.has(key)) ops.push(change("delete", key, { key }));
    ops.forEach((op, i) => {
      Object.assign(op.headers as object, { lsn: String(this.lsn), op_position: i, last: i === ops.length - 1 });
      shape.messages.push({ offset: `${this.lsn}_${i}`, message: op });
    });
    shape.rows = next;
  }

  private async createShape(where: string, params: string[]): Promise<ShapeLog> {
    const shape: ShapeLog = {
      id: shapeId(where, params),
      where,
      params,
      handle: `handle-${++handles}`,
      messages: [],
      rows: await this.rowsFor(where, params),
      refetch: false,
    };
    for (const [key, scope] of shape.rows) shape.messages.push({ offset: "0_0", message: change("insert", key, { key, scope }) });
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
    await this.pg.transaction((tx) => applyFactChanges((sql, params) => tx.query(sql, params), changes));
    await this.commit();
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

function change(operation: "insert" | "update" | "delete", key: string, value: Record<string, string>) {
  return {
    headers: { operation, relation: ["public", JAM_FACTS_TABLE] },
    key: `"public"."${JAM_FACTS_TABLE}"/"${key.replace(/"/g, '""')}"`,
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
