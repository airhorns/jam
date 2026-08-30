// sync() — every durable fact lives in one `jam_facts` table; a client mirrors
// the slices it subscribes to into the FactDB and ships its own writes back.
//
//   const s = await sync({ pg, shapeUrl: "http://localhost:3000/v1/shape", writeUrl: "/jam/changes" });
//   const project = s.subscribe({ scope: "project:p1" });
//   await project.ready;
//   …
//   await project.dispose();
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
import { db, GLOBAL_SCOPE, _, type Fact, type PatternTerm, type Term } from "./db";
import { applyFacts, isApplying } from "./applying";
import { defaultExclude } from "./persist";
import type { JamPGlite } from "./pglite";
import { JAM_FACTS_SQL, JAM_FACTS_TABLE, applyFactChanges, parseFactKey, type FactChangeRow, type FactOp } from "./server";

export interface FactFilter {
  /** Only facts in this partition; omit for every partition, "" for global facts. */
  scope?: string;
  /** Literal terms in the first three positions narrow the shape (`["issue", _, "project"]`); later positions must be wildcards. */
  pattern?: PatternTerm[];
}

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
  /** Drop the local table and resume state of a shape nobody subscribes to any more. */
  forgetShape(filter?: FactFilter): Promise<void>;
  /** Write buffered changes to the outbox and attempt one push. */
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export const SYNC_STATUS_FACT = "sync";
export const OUTBOX_TABLE = "jam_outbox";
export const SHAPES_TABLE = "jam_shapes";

// --- Filters ---

export interface CompiledFilter {
  id: string;
  /** SQL over jam_facts columns with `$n` placeholders; empty for "everything". */
  where: string;
  params: string[];
  /** Whether a fact in `scope` belongs to this filter; omit `scope` to ask whether any scope could. */
  matches(terms: Fact, scope?: string): boolean;
}

const FILTER_COLUMNS = ["t0", "t1", "t2"] as const;

export function compileFilter(filter: FactFilter = {}): CompiledFilter {
  const clauses: string[] = [];
  const params: string[] = [];
  const literals: Array<[number, Term]> = [];
  if (filter.scope !== undefined) {
    params.push(filter.scope);
    clauses.push(`scope = $${params.length}`);
  }
  (filter.pattern ?? []).forEach((term, i) => {
    if (term === _ || (typeof term === "object" && term !== null)) return;
    if (i >= FILTER_COLUMNS.length) throw new Error(`sync: pattern filters may only use the first ${FILTER_COLUMNS.length} terms`);
    literals.push([i, term]);
    params.push(JSON.stringify(term));
    clauses.push(`${FILTER_COLUMNS[i]} = $${params.length}`);
  });
  const where = clauses.join(" AND ");
  return {
    id: `jam_shape_${hash(where + "|" + JSON.stringify(params))}`,
    where,
    params,
    matches: (terms, scope) =>
      (filter.scope === undefined || scope === undefined || scope === filter.scope) &&
      literals.every(([i, term]) => terms[i] === term),
  };
}

/** cyrb53 — a small, stable string hash. */
function hash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const staleTable = (table: string) => `${table}__stale`;

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
    push: (changes) => pg.transaction((tx) => applyFactChanges((sql, params) => tx.query(sql, params), changes)),
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
  const doFetch = options.fetch ?? globalThis.fetch;
  const shouldSync = include ? include : (fact: Fact) => !exclude(fact);
  const electric = shapeUrl !== undefined;
  if (electric && !writeUrl) throw new Error("sync: writeUrl is required with shapeUrl");
  if (electric && !pg.sync) throw new Error("sync: pg needs the pglite-sync extension (openDatabase() provides it)");

  await pg.exec(`
    CREATE TABLE IF NOT EXISTS ${OUTBOX_TABLE} (
      seq SERIAL PRIMARY KEY, key TEXT NOT NULL, op TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '', acked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS ${SHAPES_TABLE} (table_name TEXT PRIMARY KEY, filter JSONB NOT NULL, ready BOOLEAN NOT NULL DEFAULT false);
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
  const retire = (seq: number) => {
    if (disposed) return;
    pg.query(`DELETE FROM ${OUTBOX_TABLE} WHERE seq <= $1 AND key = (SELECT key FROM ${OUTBOX_TABLE} WHERE seq = $1)`, [seq]).catch((e) =>
      console.error("[jam] sync: retiring an outbox entry failed", e),
    );
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
      .then(async () => {
        const values = batch.map((_c, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
        const result = await pg.query<{ seq: number }>(
          `INSERT INTO ${OUTBOX_TABLE} (key, op, scope) VALUES ${values} RETURNING seq`,
          batch.flatMap((c) => [c.key, c.op, c.scope]),
        );
        result.rows.forEach((row, i) => {
          const local = unflushed.get(batch[i].key);
          if (local === batch[i]) local.seq = row.seq;
        });
      })
      .catch((e) => console.error("[jam] sync: writing the outbox failed", e));
    return writing;
  };

  const unobserve = db.observe((type, key, fact, info) => {
    if (isApplying() || !info.durable || !shouldSync(fact)) return;
    const change: LocalChange = {
      key,
      op: type === "delete" ? "delete" : info.replace ? "replace" : "upsert",
      scope: type === "delete" ? GLOBAL_SCOPE : db.scopeOf(...fact),
    };
    buffer.push(change);
    unflushed.set(key, change);
    if (!flushTimer) flushTimer = setTimeout(() => void writeBuffer(), 0);
  });

  // --- pusher ---
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let pushing: Promise<void> | null = null;
  let failures = 0;

  const pushOnce = async (): Promise<"empty" | "pushed" | "dropped"> => {
    const { rows } = await pg.query<OutboxRow & { op: FactOp }>(
      `SELECT seq, key, op, scope FROM ${OUTBOX_TABLE} WHERE acked_at IS NULL ORDER BY seq LIMIT 1000`,
    );
    if (rows.length === 0) return "empty";
    const maxSeq = rows[rows.length - 1].seq;
    try {
      await transport.push(rows.map(({ key, op, scope }) => ({ key, op, scope })));
    } catch (e) {
      if (e instanceof SyncPushError && e.permanent) {
        console.error("[jam] sync: write endpoint rejected a batch; dropping it", e);
        setError(e.message);
        await pg.query(`DELETE FROM ${OUTBOX_TABLE} WHERE seq <= $1 AND acked_at IS NULL`, [maxSeq]);
        return "dropped";
      }
      throw e;
    }
    await pg.query(`UPDATE ${OUTBOX_TABLE} SET acked_at = now() WHERE seq <= $1 AND acked_at IS NULL`, [maxSeq]);
    return "pushed";
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
      CREATE TABLE IF NOT EXISTS "${table}" (key TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS "${stale}" (key TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT '');
    `);
    await pg.sync!.initMetadataTables();
    const registered = await pg.query<{ ready: boolean }>(`SELECT ready FROM ${SHAPES_TABLE} WHERE table_name = $1`, [table]);
    const resumable = await pg.query(`SELECT 1 FROM electric.subscriptions_metadata WHERE key = $1`, [table]);
    if (registered.rows.length === 0 || resumable.rows.length === 0) {
      await pg.exec(`DELETE FROM "${table}"; DELETE FROM "${stale}";`);
      await pg.sync!.deleteSubscription(table);
      await pg.query(
        `INSERT INTO ${SHAPES_TABLE} (table_name, filter, ready) VALUES ($1, $2, false)
         ON CONFLICT (table_name) DO UPDATE SET ready = false`,
        [table, JSON.stringify(shape.filter)],
      );
    }

    let refetching = false;
    const feed = await pg.live.changes<{ key: string; scope: string | null }>({
      query: `SELECT key, scope FROM "${table}"
              UNION ALL
              SELECT s.key, s.scope FROM "${stale}" s WHERE NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t.key = s.key)`,
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
          params: { ...shapeParams, table: JAM_FACTS_TABLE, columns: ["key", "scope"], ...(where ? { where, params } : {}) },
          runtimeVisibility: ALWAYS_VISIBLE,
          fetchClient: doFetch,
        },
        table,
        primaryKey: ["key"],
        shapeKey: table,
        onInitialSync: () =>
          void pg
            .query(`UPDATE ${SHAPES_TABLE} SET ready = true WHERE table_name = $1`, [table])
            .catch((e) => console.error("[jam] sync: marking a shape ready failed", e)),
        onMustRefetch: async (tx: Transaction) => {
          refetching = true;
          await tx.exec(`
            INSERT INTO "${stale}" (key, scope) SELECT key, scope FROM "${table}"
              ON CONFLICT (key) DO UPDATE SET scope = EXCLUDED.scope;
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
      },
    };
  };

  const forgetShape = async (filter: FactFilter = {}) => {
    const { id } = compileFilter(filter);
    if (shapes.has(id)) throw new Error(`sync: shape ${id} is still subscribed`);
    if (!electric) return;
    await pg.sync!.deleteSubscription(id);
    await pg.exec(`DROP TABLE IF EXISTS "${id}"; DROP TABLE IF EXISTS "${staleTable(id)}";`);
    await pg.query(`DELETE FROM ${SHAPES_TABLE} WHERE table_name = $1`, [id]);
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

  return { subscribe, forgetShape, flush, dispose };
}
