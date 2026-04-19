// persist() — durable fact storage via SQLite/OPFS in a Web Worker.
//
// Usage:
//   import { persist } from "@jam/core";
//   await persist({ name: "my-app" });
//
// On startup, restores persisted facts into the FactDB.
// On changes, debounce-flushes modified facts to the worker.
// VDOM facts (first term starts with "dom") are excluded by default.

import { autorun, runInAction } from "mobx";
import { db, type Fact, type Term } from "./db";

export interface PersistOptions {
  /** OPFS database name (default: "jam") */
  name?: string;
  /** Debounce interval in ms (default: 500) */
  debounce?: number;
  /** Filter function — return true to EXCLUDE a fact from persistence.
   *  Default: excludes VDOM facts (first term starts with "dom"). */
  exclude?: (fact: Fact) => boolean;
}

const defaultExclude = (fact: Fact): boolean => {
  const first = fact[0];
  return typeof first === "string" && first.startsWith("dom");
};

/**
 * Start persisting facts to SQLite/OPFS.
 * Restores previously persisted facts on startup.
 * Returns a disposer to stop persistence.
 */
export async function persist(options: PersistOptions = {}): Promise<() => void> {
  const {
    name = "jam",
    debounce: debounceMs = 500,
    exclude = defaultExclude,
  } = options;

  // Spawn the worker
  const worker = new Worker(
    new URL("./persist-worker.ts", import.meta.url),
    { type: "module" },
  );

  // Wait for the worker to load and restore facts
  const restoredFacts = await new Promise<[string, Term[]][]>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      if (e.data.type === "ready") {
        worker.removeEventListener("message", handler);
        resolve(e.data.facts);
      } else if (e.data.type === "error") {
        worker.removeEventListener("message", handler);
        reject(new Error(e.data.message));
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "open", name });
  });

  // Restore facts into the FactDB
  runInAction(() => {
    for (const [, terms] of restoredFacts) {
      db.insert(...terms);
    }
  });

  // Track which fact keys are persisted so we can detect adds/removes
  const persistedKeys = new Set<string>(restoredFacts.map(([key]) => key));

  // Debounced sync: watch db.facts for changes, flush to worker
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPuts: [string, Term[]][] = [];
  let pendingDeletes: string[] = [];

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, debounceMs);
  }

  function flush() {
    flushTimer = null;
    if (pendingPuts.length > 0) {
      worker.postMessage({ type: "put", facts: pendingPuts });
      for (const [key] of pendingPuts) persistedKeys.add(key);
      pendingPuts = [];
    }
    if (pendingDeletes.length > 0) {
      worker.postMessage({ type: "delete", keys: pendingDeletes });
      for (const key of pendingDeletes) persistedKeys.delete(key);
      pendingDeletes = [];
    }
  }

  // Use autorun to track db.facts changes
  const disposer = autorun(() => {
    // Read all facts (tracks the observable map)
    const currentFacts = new Map<string, Fact>();
    for (const [key, fact] of db.facts) {
      if (!exclude(fact)) {
        currentFacts.set(key, [...fact]);
      }
    }

    // Compute diff against persisted state
    const puts: [string, Term[]][] = [];
    const deletes: string[] = [];

    for (const [key, fact] of currentFacts) {
      if (!persistedKeys.has(key)) {
        puts.push([key, fact]);
      }
    }
    for (const key of persistedKeys) {
      if (!currentFacts.has(key)) {
        deletes.push(key);
      }
    }

    if (puts.length > 0 || deletes.length > 0) {
      pendingPuts.push(...puts);
      pendingDeletes.push(...deletes);
      scheduleFlush();
    }
  });

  return () => {
    disposer();
    if (flushTimer) {
      clearTimeout(flushTimer);
      flush(); // final flush
    }
    worker.terminate();
  };
}
