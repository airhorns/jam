// persist() — local-only durable fact storage in a PGlite `jam_local_facts` table.
//
// Usage:
//   import { persist } from "@jam/core";
//   await persist({ name: "my-app" });
//
// On startup, restores persisted facts into the FactDB.
// On changes, debounce-flushes remembered/forgotten facts to the database.
// Claimed (derived) facts are skipped — they are rebuilt by the programs that
// derive them. VDOM facts (first term starts with "dom") are excluded by default.
// For facts that should also reach a server, see sync().

import { runInAction } from "mobx";
import { db, type Fact } from "./db";
import { openDatabase, type JamPGlite } from "./pglite";

export interface PersistOptions {
  /** Database name, used as the PGlite data directory `idb://${name}` (default: "jam"). Ignored when `pg` is given. */
  name?: string;
  /** Use an already-open PGlite instance instead of opening one. Required when the app also uses sync() or syncTable(). */
  pg?: JamPGlite;
  /** Debounce interval in ms (default: 500) */
  debounce?: number;
  /** Filter function — return true to EXCLUDE a fact from persistence.
   *  Default: excludes VDOM facts (first term starts with "dom"). */
  exclude?: (fact: Fact) => boolean;
  /** Allowlist — when given, only facts for which this returns true are persisted and `exclude` is ignored. */
  include?: (fact: Fact) => boolean;
}

export const PERSIST_TABLE = "jam_local_facts";

export const defaultExclude = (fact: Fact): boolean => {
  const first = fact[0];
  return typeof first === "string" && first.startsWith("dom");
};

/** Disposer returned by persist(); call it to flush and stop, or `.flush()` to write pending changes to storage now. */
export type PersistHandle = (() => Promise<void>) & { flush(): Promise<void> };

/**
 * Start persisting facts to PGlite.
 * Restores previously persisted facts on startup.
 * Returns a disposer that flushes pending writes and stops persistence.
 */
export async function persist(options: PersistOptions = {}): Promise<PersistHandle> {
  const { name = "jam", debounce: debounceMs = 500, exclude = defaultExclude, include } = options;
  const shouldPersist = include ? include : (fact: Fact) => !exclude(fact);

  const ownsDatabase = !options.pg;
  const pg = options.pg ?? (await openDatabase({ name }));

  await pg.exec(`CREATE TABLE IF NOT EXISTS ${PERSIST_TABLE} (id TEXT PRIMARY KEY, terms JSONB NOT NULL)`);

  const restored = await pg.query<{ terms: Fact }>(`SELECT terms FROM ${PERSIST_TABLE}`);
  runInAction(() => {
    for (const row of restored.rows) db.insert(...row.terms);
  });

  // key → fact to upsert, or null to delete; the latest change per key wins.
  const pending = new Map<string, Fact | null>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> = Promise.resolve();

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flush(), debounceMs);
  };

  const flush = (): Promise<void> => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    if (pending.size === 0) return inflight;
    const batch = new Map(pending);
    pending.clear();
    inflight = inflight
      .then(() => writeBatch(pg, batch))
      .then(() => pg.syncToDisk?.())
      .catch((e) => console.error("[jam] persist flush failed", e));
    return inflight;
  };

  const unobserve = db.observe((type, key, fact, info) => {
    if (!info.durable || !shouldPersist(fact)) return;
    pending.set(key, type === "add" ? fact : null);
    scheduleFlush();
  });

  const dispose = async () => {
    unobserve();
    await flush();
    if (ownsDatabase) await pg.close();
  };
  return Object.assign(dispose, { flush });
}

/** Rows are keyed by md5 of the fact key so facts of any size fit the index. */
async function writeBatch(pg: JamPGlite, batch: Map<string, Fact | null>): Promise<void> {
  const upserts: string[] = [];
  const deletes: string[] = [];
  for (const [key, fact] of batch) (fact ? upserts : deletes).push(key);
  await pg.transaction(async (tx) => {
    if (upserts.length) {
      await tx.query(
        `INSERT INTO ${PERSIST_TABLE} (id, terms)
         SELECT md5(value), value::jsonb FROM json_array_elements_text($1::text::json)
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(upserts)],
      );
    }
    if (deletes.length) {
      await tx.query(`DELETE FROM ${PERSIST_TABLE} WHERE id IN (SELECT md5(value) FROM json_array_elements_text($1::text::json))`, [
        JSON.stringify(deletes),
      ]);
    }
  });
}
