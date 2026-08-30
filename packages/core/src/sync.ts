// sync() — every durable fact lives in one `jam_facts` table; a client mirrors
// the slices it subscribes to into the FactDB and ships its own writes back.
//
//   const s = await sync({ pg, shapeUrl: "/jam/shape", writeUrl: "/jam/changes" });
//   const stop = s.follow([["route", "project", $.id]], ([route]) => [
//     { scope: "" },
//     ...(route ? [{ scope: `project:${route.id}` }] : []),
//   ]);
//   // or by hand: const project = s.subscribe({ scope: "project:p1" }); await project.ready; … await project.dispose();
//
// Electric mode: each subscription is an Electric shape over `jam_facts`
// streamed by pglite-sync into its own local table, and local writes queue in
// `jam_outbox` until the write endpoint (see server.ts) acknowledges them.
// Without `shapeUrl`, `jam_facts` itself lives in the local database and
// subscribe() only filters what is loaded into memory — same code, no network.
//
// A fact is present in memory when its newest outbox entry says so, else when
// some subscription holds it. Acknowledged outbox entries linger until the
// subscription reflects them (or time out), so the server's echo of a local
// write never flickers the fact.

import type { Change } from "@electric-sql/pglite/live";
import type { Transaction } from "@electric-sql/pglite";
import { comparer, reaction } from "mobx";
import { db, GLOBAL_SCOPE, _, type Bindings, type Fact, type Pattern } from "./db";
import { applyFacts, isApplying } from "./applying";
import { compileFilter, type CompiledFilter, type FactFilter } from "./filter";
import { defaultExclude } from "./persist";
import type { JamPGlite } from "./pglite";
import {
  JAM_FACTS_COLUMNS,
  JAM_FACTS_SQL,
  JAM_FACTS_TABLE,
  applyFactChanges,
  isDataError,
  parseFactKey,
  type FactChangeRow,
  type FactOp,
} from "./server";

export { compileFilter, parseFilter, type CompiledFilter, type FactFilter } from "./filter";

export interface SyncOptions {
  pg: JamPGlite;
  /** Electric shape endpoint, e.g. `http://localhost:3000/v1/shape`. Omit for a purely local database. */
  shapeUrl?: string;
  /** Endpoint that accepts `{ changes }` from the outbox (see `applyFactChanges`). Required with `shapeUrl`. */
  writeUrl?: string;
  /** Extra shape query params, e.g. `source_id`/`secret` for Electric Cloud. */
  shapeParams?: Record<string, string>;
  /** Return true to keep a fact local-only. Default: VDOM facts. Derived (claimed) facts are never synced. */
  exclude?: (fact: Fact) => boolean;
  /** Allowlist — when given, only these facts are synced and `exclude` is ignored. */
  include?: (fact: Fact) => boolean;
  /** Delay before retrying a failed push; doubles per consecutive failure up to a minute (default: 1000). */
  retryDelay?: number;
  /** How long an acknowledged write waits to be echoed by a subscription before presence is re-evaluated (default: 30000). */
  echoTimeout?: number;
  /**
   * How long a fact that left every subscription lingers before it is dropped (default: 250).
   * Subscriptions are independent streams, so a fact moving between two of them is seen
   * leaving one before it arrives in the other.
   */
  dropDelay?: number;
  /**
   * How many shapes nobody subscribes to stay on disk for a fast resume (default: 16).
   * The least recently used beyond that are dropped when a subscription is released and on start.
   */
  keepShapes?: number;
  fetch?: typeof fetch;
}

export interface FactSubscription {
  /** Stable id of the shape, also its local table name. */
  id: string;
  /** Resolves once the initial data for this filter has been mirrored into facts. */
  ready: Promise<void>;
  /** Release this subscription; facts held only by it leave memory (their local tables are kept for a fast resume). */
  dispose(): Promise<void>;
}

export interface SyncHandle {
  subscribe(filter?: FactFilter): FactSubscription;
  /**
   * Keep subscriptions in step with facts: whenever the matches of `patterns`
   * change, subscribe what `wanted` returns for them. Newly wanted filters are
   * ready before anything no longer wanted is released, so a switch never
   * empties the screen first. Returns a function that releases them all.
   */
  follow(patterns: Pattern[], wanted: (matches: Bindings[]) => FactFilter[]): () => Promise<void>;
  /** Drop the local table and resume state of a shape nobody subscribes to any more. */
  forgetShape(filter?: FactFilter): Promise<void>;
  /** Write buffered changes to the outbox and attempt one push. */
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export const SYNC_STATUS_FACT = "sync";
export const OUTBOX_TABLE = "jam_outbox";
export const SHAPES_TABLE = "jam_shapes";

const staleTable = (table: string) => `${table}__stale`;
const SHAPE_TABLE_COLUMNS = `id TEXT PRIMARY KEY, key TEXT NOT NULL, scope TEXT NOT NULL DEFAULT ''`;
/** Rows per outbox INSERT, well under the protocol's 65535 parameters. */
const OUTBOX_INSERT_CHUNK = 5000;

// --- Locks ---

type LockRelease = () => Promise<void>;

/** Hold a Web Lock (one tab per shape / pusher) for as long as `run` takes; without Web Locks just run. */
function holdLock(name: string, run: (released: Promise<void>) => Promise<void>): LockRelease {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (!locks) {
    const done = run(released).catch((e) => console.error("[jam] sync task failed", e));
    return async () => {
      release();
      await done;
    };
  }
  const controller = new AbortController();
  const done = locks
    .request(name, { signal: controller.signal }, () => run(released))
    .catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "AbortError") console.error("[jam] sync task failed", e);
    });
  return async () => {
    release();
    controller.abort();
    await done;
  };
}

/** The Electric browser client pauses hidden tabs; the tab holding a shape's lock must keep streaming for the others. */
const ALWAYS_VISIBLE = {
  getCurrentState: () => "visible" as const,
  subscribe: () => () => {},
};

// --- Transports ---

interface Transport {
  push(changes: FactChangeRow[]): Promise<void>;
}

export class SyncPushError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** 4xx other than timeouts/rate limits will never succeed on retry. */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

function httpTransport(url: string, doFetch: typeof fetch): Transport {
  return {
    async push(changes) {
      const response = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!response.ok) throw new SyncPushError(response.status, `write endpoint responded ${response.status}`);
    },
  };
}

function localTransport(pg: JamPGlite): Transport {
  return {
    push: async (changes) => {
      try {
        await pg.transaction((tx) => applyFactChanges((sql, params) => tx.query(sql, params), changes));
      } catch (e) {
        if (isDataError(e)) throw new SyncPushError(400, e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
  };
}

// --- sync() ---

interface OutboxRow {
  seq: number;
  key: string;
  op: FactOp;
  scope: string;
  acked: boolean;
}

interface LocalChange extends FactChangeRow {
  /** Outbox seq once written; the entry is dropped when the outbox feed delivers that row. */
  seq?: number;
}

interface Shape {
  compiled: CompiledFilter;
  filter: FactFilter;
  refs: number;
  ready: Promise<void>;
  isReady: boolean;
  markReady: () => void;
  started: Promise<void>;
  stop: () => Promise<void>;
}

type FeedChange = Change<{ key: string; scope: string | null }>;

export async function sync(options: SyncOptions): Promise<SyncHandle> {
  const { pg, shapeUrl, writeUrl, shapeParams = {}, exclude = defaultExclude, include } = options;
  const retryDelay = options.retryDelay ?? 1000;
  const echoTimeout = options.echoTimeout ?? 30_000;
  const dropDelay = options.dropDelay ?? 250;
  const keepShapes = options.keepShapes ?? 16;
  const doFetch = options.fetch ?? globalThis.fetch;
  const shouldSync = include ? include : (fact: Fact) => !exclude(fact);
  const electric = shapeUrl !== undefined;
  if (electric && !writeUrl) throw new Error("sync: writeUrl is required with shapeUrl");
  if (electric && !pg.sync) throw new Error("sync: pg needs the pglite-sync extension (openDatabase() provides it)");

  await pg.exec(`
    CREATE TABLE IF NOT EXISTS ${OUTBOX_TABLE} (
      seq SERIAL PRIMARY KEY, key TEXT NOT NULL, op TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '', acked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS ${SHAPES_TABLE} (
      table_name TEXT PRIMARY KEY, filter JSONB NOT NULL, ready BOOLEAN NOT NULL DEFAULT false, last_used TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  if (!electric) await pg.exec(JAM_FACTS_SQL);
  const transport = electric ? httpTransport(writeUrl!, doFetch) : localTransport(pg);

  // --- state ---
  const shapes = new Map<string, Shape>();
  /** key → scope and the shapes whose local data contain it. */
  const holds = new Map<string, { scope: string; shapes: Set<string> }>();
  const outboxRows = new Map<number, OutboxRow>();
  /** key → seqs ascending. */
  const rowsByKey = new Map<string, number[]>();
  /** Local changes not yet visible through the outbox feed. */
  const unflushed = new Map<string, LocalChange>();
  let buffer: LocalChange[] = [];
  let disposed = false;
  const warnedKeys = new Set<string>();

  const setStatus = (status: string) => applyFacts(() => db.replace(SYNC_STATUS_FACT, "status", status));
  const setError = (message: string) => applyFacts(() => db.replace(SYNC_STATUS_FACT, "error", message));
  const updateStatus = () => {
    if (disposed) return;
    if (!electric) return setStatus("standalone");
    const all = Array.from(shapes.values());
    setStatus(all.every((s) => s.isReady) ? "live" : "syncing");
  };
  const updatePending = () => {
    let n = unflushed.size;
    for (const row of outboxRows.values()) if (!row.acked) n++;
    applyFacts(() => db.replace(SYNC_STATUS_FACT, "pending", n));
  };

  const terms = (key: string): Fact | null => {
    const parsed = parseFactKey(key);
    if (!parsed && !warnedKeys.has(key)) {
      warnedKeys.add(key);
      console.warn("[jam] sync: ignoring row whose key is not a fact", key);
    }
    return parsed;
  };

  // --- presence ---
  const pendingOp = (key: string): LocalChange | OutboxRow | undefined => {
    const local = unflushed.get(key);
    if (local) return local;
    const seqs = rowsByKey.get(key);
    return seqs?.length ? outboxRows.get(seqs[seqs.length - 1]) : undefined;
  };

  const coveredByReadyShape = (fact: Fact, scope?: string): boolean => {
    for (const shape of shapes.values()) if (shape.isReady && shape.compiled.matches(fact, scope)) return true;
    return false;
  };

  const ensurePresent = (key: string, scope: string) => {
    const fact = terms(key);
    if (!fact) return;
    if (db.facts.has(key)) db.setScope(key, scope);
    else db.withScope(scope, () => db.insert(...fact));
  };
  const ensureAbsent = (key: string) => {
    if (!db.facts.has(key)) return;
    const fact = terms(key);
    if (fact) db.drop(...fact);
  };

  /** Must run inside applyFacts(). */
  const reconcile = (key: string, dropNow = false) => {
    const pending = pendingOp(key);
    if (pending) {
      if (pending.op === "delete") ensureAbsent(key);
      else ensurePresent(key, pending.scope);
      return;
    }
    const hold = holds.get(key);
    if (hold) return ensurePresent(key, hold.scope);
    if (!db.facts.has(key)) return;
    const fact = terms(key);
    if (!fact || !coveredByReadyShape(fact, db.scopeOf(...fact))) return;
    if (dropNow) ensureAbsent(key);
    else scheduleDrop(key);
  };

  const dropTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleDrop = (key: string) => {
    if (dropTimers.has(key)) return;
    const timer = setTimeout(() => {
      dropTimers.delete(key);
      applyFacts(() => reconcile(key, true));
    }, dropDelay);
    dropTimers.set(key, timer);
  };

  // --- outbox ---
  const echoTimers = new Set<ReturnType<typeof setTimeout>>();
  const retiring = new Set<number>();
  let retireTimer: ReturnType<typeof setTimeout> | null = null;
  const flushRetired = () => {
    retireTimer = null;
    if (disposed || retiring.size === 0) return;
    const seqs = Array.from(retiring);
    retiring.clear();
    pg.query(`DELETE FROM ${OUTBOX_TABLE} WHERE seq IN (SELECT value::int FROM json_array_elements_text($1::text::json))`, [JSON.stringify(seqs)]).catch(
      (e) => console.error("[jam] sync: retiring outbox entries failed", e),
    );
  };
  /** Delete an entry and every older one for its key; a burst of echoes becomes one statement. */
  const retire = (seq: number) => {
    if (disposed) return;
    retiring.add(seq);
    const row = outboxRows.get(seq);
    for (const s of (row && rowsByKey.get(row.key)) ?? []) if (s < seq) retiring.add(s);
    if (!retireTimer) retireTimer = setTimeout(flushRetired, 0);
  };
  const retireAfterEcho = (seq: number) => {
    const timer = setTimeout(() => {
      echoTimers.delete(timer);
      retire(seq);
    }, echoTimeout);
    echoTimers.add(timer);
  };

  /**
   * Delete acknowledged entries the subscriptions have caught up with (and everything
   * older for the same key). A delete only counts as reflected once a ready shape that
   * could hold the fact doesn't; otherwise the echo timeout decides.
   */
  const retireReflected = (key: string) => {
    const seqs = rowsByKey.get(key);
    if (!seqs) return;
    const fact = terms(key);
    if (!fact) return;
    const held = holds.has(key);
    for (let i = seqs.length - 1; i >= 0; i--) {
      const row = outboxRows.get(seqs[i])!;
      if (!row.acked) continue;
      const reflected = row.op === "delete" ? !held && coveredByReadyShape(fact) : held;
      if (reflected) {
        retire(row.seq);
        return;
      }
    }
  };

  const onOutboxChanges = (changes: Change<Partial<OutboxRow> & { acked_at: unknown }>[]) => {
    const touched = new Set<string>();
    for (const change of changes) {
      if (change.__op__ === "RESET") {
        for (const key of rowsByKey.keys()) touched.add(key);
        outboxRows.clear();
        rowsByKey.clear();
        continue;
      }
      const seq = Number(change.seq);
      if (change.__op__ === "DELETE") {
        const row = outboxRows.get(seq);
        if (!row) continue;
        outboxRows.delete(seq);
        const seqs = rowsByKey.get(row.key)!.filter((s) => s !== seq);
        if (seqs.length) rowsByKey.set(row.key, seqs);
        else rowsByKey.delete(row.key);
        touched.add(row.key);
        continue;
      }
      if (change.__op__ === "UPDATE") {
        const row = outboxRows.get(seq);
        if (!row) continue;
        if (change.__changed_columns__.includes("acked_at")) {
          row.acked = change.acked_at != null;
          if (row.acked) retireAfterEcho(row.seq);
        }
        touched.add(row.key);
        continue;
      }
      const row: OutboxRow = {
        seq,
        key: change.key!,
        op: change.op as FactOp,
        scope: change.scope ?? GLOBAL_SCOPE,
        acked: change.acked_at != null,
      };
      outboxRows.set(seq, row);
      const seqs = rowsByKey.get(row.key) ?? [];
      seqs.push(seq);
      seqs.sort((a, b) => a - b);
      rowsByKey.set(row.key, seqs);
      const local = unflushed.get(row.key);
      if (local?.seq === seq) unflushed.delete(row.key);
      if (row.acked) retireAfterEcho(row.seq);
      touched.add(row.key);
    }
    applyFacts(() => {
      for (const key of touched) reconcile(key);
    });
    for (const key of touched) retireReflected(key);
    updatePending();
    schedulePush();
  };

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();
  const writeBuffer = (): Promise<void> => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    if (buffer.length === 0) return writing;
    const batch = buffer;
    buffer = [];
    writing = writing
      .then(() =>
        pg.transaction(async (tx) => {
          for (let start = 0; start < batch.length; start += OUTBOX_INSERT_CHUNK) {
            const chunk = batch.slice(start, start + OUTBOX_INSERT_CHUNK);
            const values = chunk.map((_c, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
            const result = await tx.query<{ seq: number }>(
              `INSERT INTO ${OUTBOX_TABLE} (key, op, scope) VALUES ${values} RETURNING seq`,
              chunk.flatMap((c) => [c.key, c.op, c.scope]),
            );
            result.rows.forEach((row, i) => {
              const local = unflushed.get(chunk[i].key);
              if (local === chunk[i]) local.seq = row.seq;
            });
          }
        }),
      )
      .catch((e) => console.error("[jam] sync: writing the outbox failed", e));
    return writing;
  };

  const unobserve = db.observe((type, key, fact, info) => {
    if (isApplying() || !info.durable || !shouldSync(fact)) return;
    const change: LocalChange = {
      key,
      op: type === "delete" ? "delete" : info.replace ? "replace" : "upsert",
      scope: db.scopeOf(...fact),
    };
    buffer.push(change);
    unflushed.set(key, change);
    if (!flushTimer) flushTimer = setTimeout(() => void writeBuffer(), 0);
  });

  // --- pusher ---
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let pushing: Promise<void> | null = null;
  let failures = 0;

  /**
   * Push a run of outbox rows in order. A batch the endpoint rejects for good
   * is split in half and retried until the offending entries stand alone and
   * can be dropped without taking the rest of the batch with them.
   */
  const pushRows = async (rows: OutboxRow[]): Promise<"pushed" | "dropped"> => {
    try {
      await transport.push(rows.map(({ key, op, scope }) => ({ key, op, scope })));
    } catch (e) {
      if (!(e instanceof SyncPushError && e.permanent)) throw e;
      if (rows.length > 1) {
        const half = Math.ceil(rows.length / 2);
        const first = await pushRows(rows.slice(0, half));
        const second = await pushRows(rows.slice(half));
        return first === "dropped" || second === "dropped" ? "dropped" : "pushed";
      }
      console.error("[jam] sync: write endpoint rejected an entry; dropping it", rows[0].key, e);
      setError(e.message);
      await pg.query(`DELETE FROM ${OUTBOX_TABLE} WHERE seq = $1`, [rows[0].seq]);
      return "dropped";
    }
    await pg.query(`UPDATE ${OUTBOX_TABLE} SET acked_at = now() WHERE seq BETWEEN $1 AND $2 AND acked_at IS NULL`, [
      rows[0].seq,
      rows[rows.length - 1].seq,
    ]);
    return "pushed";
  };

  const pushOnce = async (): Promise<"empty" | "pushed" | "dropped"> => {
    const { rows } = await pg.query<OutboxRow & { op: FactOp }>(
      `SELECT seq, key, op, scope FROM ${OUTBOX_TABLE} WHERE acked_at IS NULL ORDER BY seq LIMIT 1000`,
    );
    if (rows.length === 0) return "empty";
    return pushRows(rows);
  };

  const runPush = (): Promise<void> => {
    if (pushing) return pushing;
    pushing = (async () => {
      const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
      const run = async () => {
        try {
          let dropped = false;
          while (!disposed) {
            const outcome = await pushOnce();
            if (outcome === "empty") break;
            if (outcome === "dropped") dropped = true;
          }
          failures = 0;
          if (!dropped && db.query([SYNC_STATUS_FACT, "error", _]).length) applyFacts(() => db.drop(SYNC_STATUS_FACT, "error", _));
        } catch (e) {
          console.error("[jam] sync: push failed", e);
          setError(e instanceof Error ? e.message : String(e));
          if (!disposed) pushTimer = setTimeout(() => void runPush(), Math.min(retryDelay * 2 ** failures, 60_000));
          failures++;
        }
      };
      if (locks) {
        const held = await locks.request("jam_outbox_push", { ifAvailable: true }, async (lock) => {
          if (lock) await run();
          return lock !== null;
        });
        if (!held && !disposed) pushTimer = setTimeout(() => void runPush(), retryDelay);
      } else {
        await run();
      }
    })().finally(() => {
      pushing = null;
      schedulePush();
    });
    return pushing;
  };

  const schedulePush = () => {
    if (disposed || pushTimer || pushing) return;
    let unacked = false;
    for (const row of outboxRows.values()) if (!row.acked) unacked = true;
    if (!unacked) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void runPush();
    }, 0);
  };

  // --- shapes ---
  const applyShapeChanges = (shapeId: string, changes: FeedChange[]) => {
    const touched = new Set<string>();
    for (const change of changes) {
      if (change.__op__ === "RESET") {
        for (const [key, hold] of holds) {
          if (hold.shapes.delete(shapeId)) {
            if (hold.shapes.size === 0) holds.delete(key);
            touched.add(key);
          }
        }
        continue;
      }
      const key = change.key;
      touched.add(key);
      if (change.__op__ === "DELETE") {
        const hold = holds.get(key);
        if (hold?.shapes.delete(shapeId) && hold.shapes.size === 0) holds.delete(key);
        continue;
      }
      if (change.__op__ === "UPDATE") {
        const hold = holds.get(key);
        if (hold && change.__changed_columns__.includes("scope")) hold.scope = change.scope ?? GLOBAL_SCOPE;
        continue;
      }
      const hold = holds.get(key);
      if (hold) {
        hold.shapes.add(shapeId);
        hold.scope = change.scope ?? GLOBAL_SCOPE;
      } else {
        holds.set(key, { scope: change.scope ?? GLOBAL_SCOPE, shapes: new Set([shapeId]) });
      }
    }
    applyFacts(() => {
      for (const key of touched) reconcile(key);
    });
    for (const key of touched) retireReflected(key);
  };

  /** Facts that came from a disposed subscription leave memory unless something else still wants them. */
  const releaseShape = (shapeId: string) => {
    const released: string[] = [];
    for (const [key, hold] of holds) {
      if (hold.shapes.delete(shapeId)) {
        if (hold.shapes.size === 0) holds.delete(key);
        released.push(key);
      }
    }
    applyFacts(() => {
      for (const key of released) {
        if (holds.has(key) || pendingOp(key)) reconcile(key);
        else ensureAbsent(key);
      }
    });
  };

  const setShapeReady = (shape: Shape) => {
    if (shape.isReady) return;
    shape.isReady = true;
    applyFacts(() => db.replace(SYNC_STATUS_FACT, "shape", shape.compiled.id, "ready", true));
    for (const key of rowsByKey.keys()) retireReflected(key);
    shape.markReady();
    updateStatus();
  };

  const startStandalone = async (shape: Shape): Promise<() => Promise<void>> => {
    const { where, params, id } = shape.compiled;
    const feed = await pg.live.changes<{ key: string; scope: string | null }>({
      query: `SELECT key, scope FROM ${JAM_FACTS_TABLE}${where ? ` WHERE ${where}` : ""}`,
      params,
      key: "key",
      callback: (changes) => applyShapeChanges(id, changes),
    });
    setShapeReady(shape);
    return () => feed.unsubscribe();
  };

  // pglite-sync answers a must-refetch by truncating the shape table in its own
  // transaction and inserting the fresh snapshot later. The rows are parked in a
  // `__stale` table meanwhile so the facts stay put, then cleared once the
  // snapshot has committed (metadata last_lsn leaves the -1 the truncate wrote).
  const startElectric = async (shape: Shape): Promise<() => Promise<void>> => {
    const { where, params, id: table } = shape.compiled;
    const stale = staleTable(table);
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS "${table}" (${SHAPE_TABLE_COLUMNS});
      CREATE TABLE IF NOT EXISTS "${stale}" (${SHAPE_TABLE_COLUMNS});
    `);
    await pg.sync!.initMetadataTables();
    const registered = await pg.query<{ ready: boolean }>(`SELECT ready FROM ${SHAPES_TABLE} WHERE table_name = $1`, [table]);
    const resumable = await pg.query(`SELECT 1 FROM electric.subscriptions_metadata WHERE key = $1`, [table]);
    if (registered.rows.length === 0 || resumable.rows.length === 0) {
      await pg.exec(`DELETE FROM "${table}"; DELETE FROM "${stale}";`);
      await pg.sync!.deleteSubscription(table);
      await pg.query(
        `INSERT INTO ${SHAPES_TABLE} (table_name, filter, ready) VALUES ($1, $2, false)
         ON CONFLICT (table_name) DO UPDATE SET ready = false, last_used = now()`,
        [table, JSON.stringify(shape.filter)],
      );
    } else {
      await touchShape(table);
    }

    let refetching = false;
    const feed = await pg.live.changes<{ key: string; scope: string | null }>({
      query: `SELECT key, scope FROM "${table}"
              UNION ALL
              SELECT s.key, s.scope FROM "${stale}" s WHERE NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t.id = s.id)`,
      key: "key",
      callback: (changes) => applyShapeChanges(table, changes),
    });
    const progress = await pg.live.query<{ ready: boolean; last_lsn: string | number | null }>({
      query: `SELECT s.ready, m.last_lsn FROM ${SHAPES_TABLE} s
              LEFT JOIN electric.subscriptions_metadata m ON m.key = s.table_name
              WHERE s.table_name = $1`,
      params: [table],
      callback: (result) => {
        const row = result.rows[0];
        if (row?.ready) setShapeReady(shape);
        if (refetching && row?.last_lsn != null && String(row.last_lsn) !== "-1") {
          refetching = false;
          void pg.exec(`DELETE FROM "${stale}"`).catch((e) => console.error("[jam] sync: clearing stale shape rows failed", e));
        }
      },
    });

    const releaseLock = holdLock(table, async (released) => {
      const stream = await pg.sync!.syncShapeToTable({
        shape: {
          url: shapeUrl!,
          params: { ...shapeParams, table: JAM_FACTS_TABLE, columns: [...JAM_FACTS_COLUMNS], ...(where ? { where, params } : {}) },
          runtimeVisibility: ALWAYS_VISIBLE,
          fetchClient: doFetch,
        },
        table,
        primaryKey: ["id"],
        shapeKey: table,
        onInitialSync: () =>
          void pg
            .query(`UPDATE ${SHAPES_TABLE} SET ready = true WHERE table_name = $1`, [table])
            .catch((e) => console.error("[jam] sync: marking a shape ready failed", e)),
        onMustRefetch: async (tx: Transaction) => {
          refetching = true;
          await tx.exec(`
            INSERT INTO "${stale}" (id, key, scope) SELECT id, key, scope FROM "${table}"
              ON CONFLICT (id) DO UPDATE SET scope = EXCLUDED.scope;
            DELETE FROM "${table}";
          `);
        },
        onError: (error) => {
          console.error("[jam] sync: shape stream failed", table, error);
          setError(error.message);
        },
      });
      await released;
      stream.unsubscribe();
    });

    return async () => {
      await releaseLock();
      await progress.unsubscribe();
      await feed.unsubscribe();
    };
  };

  const subscribe = (filter: FactFilter = {}): FactSubscription => {
    if (disposed) throw new Error("sync: disposed");
    const compiled = compileFilter(filter);
    let shape = shapes.get(compiled.id);
    if (!shape) {
      let markReady!: () => void;
      const ready = new Promise<void>((resolve) => (markReady = resolve));
      const created: Shape = {
        compiled,
        filter,
        refs: 0,
        ready,
        isReady: false,
        markReady,
        started: Promise.resolve(),
        stop: async () => {},
      };
      applyFacts(() => db.replace(SYNC_STATUS_FACT, "shape", compiled.id, "ready", false));
      created.started = (electric ? startElectric(created) : startStandalone(created))
        .then((stop) => {
          created.stop = stop;
        })
        .catch((e) => {
          console.error("[jam] sync: subscribing failed", filter, e);
          setError(e instanceof Error ? e.message : String(e));
        });
      shapes.set(compiled.id, created);
      shape = created;
      updateStatus();
    }
    shape.refs++;
    let released = false;
    return {
      id: compiled.id,
      ready: shape.ready,
      dispose: async () => {
        if (released) return;
        released = true;
        const current = shapes.get(compiled.id);
        if (!current || --current.refs > 0) return;
        shapes.delete(compiled.id);
        await current.started;
        await current.stop();
        releaseShape(compiled.id);
        applyFacts(() => db.drop(SYNC_STATUS_FACT, "shape", compiled.id, "ready", _));
        updateStatus();
        if (electric && !disposed) {
          await touchShape(compiled.id);
          await pruneShapes();
        }
      },
    };
  };

  const follow = (patterns: Pattern[], wanted: (matches: Bindings[]) => FactFilter[]): (() => Promise<void>) => {
    if (disposed) throw new Error("sync: disposed");
    const index = db.index(...patterns);
    let current = new Map<string, FactSubscription>();
    let generation = 0;
    const inflight = new Set<Promise<void>>();

    const apply = async (filters: FactFilter[]) => {
      const gen = ++generation;
      const next = new Map<string, FactSubscription>();
      const added: FactSubscription[] = [];
      for (const filter of filters) {
        const { id } = compileFilter(filter);
        if (next.has(id)) continue;
        const kept = current.get(id);
        if (kept) {
          next.set(id, kept);
        } else {
          const subscription = subscribe(filter);
          next.set(id, subscription);
          added.push(subscription);
        }
      }
      await Promise.all(added.map((s) => s.ready));
      if (gen !== generation) {
        await Promise.all(added.map((s) => s.dispose()));
        return;
      }
      const previous = current;
      current = next;
      await Promise.all(Array.from(previous, ([id, s]) => (next.has(id) ? undefined : s.dispose())));
    };

    const stopReaction = reaction(
      () => index.get(),
      (matches) => {
        const run: Promise<void> = Promise.resolve()
          .then(() => apply(wanted(matches)))
          .catch((e) => console.error("[jam] sync: follow failed", e))
          .finally(() => inflight.delete(run));
        inflight.add(run);
      },
      { fireImmediately: true, equals: comparer.structural },
    );
    return async () => {
      stopReaction();
      generation++;
      await Promise.all(inflight);
      const held = current;
      current = new Map();
      await Promise.all(Array.from(held.values(), (s) => s.dispose()));
    };
  };

  const touchShape = (table: string) =>
    pg.query(`UPDATE ${SHAPES_TABLE} SET last_used = now() WHERE table_name = $1`, [table]).catch((e) => console.error("[jam] sync: touching a shape failed", e));

  /** Drop a shape's local table, stale rows and resume state unless something subscribed to it meanwhile. */
  const dropShape = async (id: string) => {
    const dropped = await pg.transaction(async (tx) => {
      if (shapes.has(id)) return false;
      await tx.exec(`DROP TABLE IF EXISTS "${id}"; DROP TABLE IF EXISTS "${staleTable(id)}";`);
      await tx.query(`DELETE FROM ${SHAPES_TABLE} WHERE table_name = $1`, [id]);
      return true;
    });
    if (dropped) await pg.sync!.deleteSubscription(id);
  };

  /** Keep the `keepShapes` most recently used unsubscribed shapes; drop the rest. */
  const pruneShapes = async () => {
    if (!electric || !Number.isFinite(keepShapes)) return;
    const { rows } = await pg.query<{ table_name: string }>(`SELECT table_name FROM ${SHAPES_TABLE} ORDER BY last_used DESC, table_name`);
    const idle = rows.map((r) => r.table_name).filter((table) => !shapes.has(table));
    for (const table of idle.slice(keepShapes)) {
      await dropShape(table).catch((e) => console.error("[jam] sync: dropping a shape failed", table, e));
    }
  };

  const forgetShape = async (filter: FactFilter = {}) => {
    const { id } = compileFilter(filter);
    if (shapes.has(id)) throw new Error(`sync: shape ${id} is still subscribed`);
    if (!electric) return;
    await dropShape(id);
  };

  const flush = async () => {
    await writeBuffer();
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    await pushing;
    await runPush();
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    unobserve();
    await writeBuffer();
    if (pushTimer) clearTimeout(pushTimer);
    if (retireTimer) clearTimeout(retireTimer);
    for (const timer of echoTimers) clearTimeout(timer);
    echoTimers.clear();
    for (const timer of dropTimers.values()) clearTimeout(timer);
    dropTimers.clear();
    await pushing;
    for (const shape of shapes.values()) {
      await shape.started;
      await shape.stop();
    }
    shapes.clear();
    await outboxFeed.unsubscribe();
    applyFacts(() => {
      db.drop(SYNC_STATUS_FACT, _, _);
      db.drop(SYNC_STATUS_FACT, "shape", _, _, _);
    });
  };

  const outboxFeed = await pg.live.changes<Partial<OutboxRow> & { acked_at: unknown }>({
    query: `SELECT seq, key, op, scope, acked_at FROM ${OUTBOX_TABLE}`,
    key: "seq",
    callback: onOutboxChanges,
  });
  updateStatus();
  updatePending();
  await pruneShapes();

  return { subscribe, follow, forgetShape, flush, dispose };
}
