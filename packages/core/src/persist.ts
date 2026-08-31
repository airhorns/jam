// persist() — local-only durable fact storage.
//
// Usage:
//   import { persist } from "@jam/core";
//   await persist({ name: "my-app" });
//
// On startup, restores persisted facts into the FactDB.
// On changes, debounce-flushes remembered/forgotten facts to storage.
// Claimed (derived) facts are skipped — they are rebuilt by the programs that
// derive them. VDOM facts (first term starts with "dom") are excluded by default.
// For facts that should also reach a server, see sync().

import { memoryStorage, type FactStorage, type StoredFact } from "@jam/engine/storage";
import { indexedDBStorage } from "@jam/engine/storage/indexeddb";
import { db, type Fact } from "./db";
import { transaction } from "./reactive";

export interface PersistOptions {
  /** IndexedDB database name (default: "jam"). Ignored when `storage` is given. */
  name?: string;
  /** Use a specific storage adapter; defaults to IndexedDB in browsers and memory elsewhere. */
  storage?: FactStorage;
  /** Debounce interval in ms (default: 500) */
  debounce?: number;
  /** Filter function — return true to EXCLUDE a fact from persistence.
   *  Default: excludes VDOM facts (first term starts with "dom"). */
  exclude?: (fact: Fact) => boolean;
  /** Allowlist — when given, only facts for which this returns true are persisted and `exclude` is ignored. */
  include?: (fact: Fact) => boolean;
}

export const defaultExclude = (fact: Fact): boolean => {
  const first = fact[0];
  return typeof first === "string" && first.startsWith("dom");
};

/** Disposer returned by persist(); call it to flush and stop, or `.flush()` to write pending changes to storage now. */
export type PersistHandle = (() => Promise<void>) & { flush(): Promise<void> };

async function defaultStorage(name: string): Promise<FactStorage> {
  return typeof indexedDB === "undefined" ? memoryStorage() : indexedDBStorage(name);
}

/**
 * Start persisting durable facts.
 * Restores previously persisted facts on startup.
 * Returns a disposer that flushes pending writes and stops persistence.
 */
export async function persist(options: PersistOptions = {}): Promise<PersistHandle> {
  const { name = "jam", debounce: debounceMs = 500, exclude = defaultExclude, include } = options;
  const shouldPersist = include ? include : (fact: Fact) => !exclude(fact);

  const ownsStorage = !options.storage;
  const storage = options.storage ?? (await defaultStorage(name));

  const restored = await storage.load();
  transaction(() => {
    for (const { terms, scope } of restored) db.withScope(scope, () => db.insert(...terms));
  });

  // key → fact to upsert, or null to delete; the latest change per key wins.
  const pending = new Map<string, StoredFact | null>();
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
    const upserts: StoredFact[] = [];
    const deletes: Fact[] = [];
    for (const [key, fact] of pending) {
      if (fact) upserts.push(fact);
      else deletes.push(JSON.parse(key) as Fact);
    }
    pending.clear();
    inflight = inflight
      .then(() => storage.write({ upserts, deletes }))
      .catch((e) => console.error("[jam] persist flush failed", e));
    return inflight;
  };

  const unobserve = db.observe((type, key, fact, info) => {
    if (!shouldPersist(fact)) return;
    pending.set(key, type === "add" ? { terms: fact, scope: info.scope } : null);
    scheduleFlush();
  });

  const dispose = async () => {
    unobserve();
    await flush();
    if (ownsStorage) await storage.close();
  };
  return Object.assign(dispose, { flush });
}
