import { factKey, type Fact, type StoredFact } from "../index";
import type { FactStorage, LogEntry, StorageWrite } from "./index";

const VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("facts")) db.createObjectStore("facts", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("log")) db.createObjectStore("log", { keyPath: "seq" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface FactRow {
  key: string;
  terms: Fact;
  scope: string;
}

export async function indexedDBStorage(name = "jam"): Promise<FactStorage> {
  const db = await open(name);
  const run = <T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => T | Promise<T>): Promise<T> => {
    const tx = db.transaction(stores, mode);
    const done = complete(tx);
    return Promise.resolve(body(tx)).then(async (value) => {
      await done;
      return value;
    });
  };
  return {
    async load() {
      const rows = await run(["facts"], "readonly", (tx) => request(tx.objectStore("facts").getAll() as IDBRequest<FactRow[]>));
      return rows.map((r) => ({ terms: r.terms, scope: r.scope }));
    },
    write(changes: StorageWrite) {
      return run(["facts", "meta", "log"], "readwrite", (tx) => {
        const facts = tx.objectStore("facts");
        for (const terms of changes.deletes ?? []) facts.delete(factKey(terms));
        for (const fact of changes.upserts ?? []) {
          facts.put({ key: factKey(fact.terms), terms: fact.terms, scope: fact.scope } satisfies FactRow);
        }
        const log = tx.objectStore("log");
        for (const entry of changes.log ?? []) log.put(entry);
        const meta = tx.objectStore("meta");
        for (const [key, value] of Object.entries(changes.meta ?? {})) {
          if (value === undefined) meta.delete(key);
          else meta.put(value, key);
        }
      });
    },
    getMeta(key) {
      return run(["meta"], "readonly", (tx) => request(tx.objectStore("meta").get(key) as IDBRequest<string | undefined>));
    },
    readLog(since, limit) {
      return run(["log"], "readonly", (tx) =>
        request(tx.objectStore("log").getAll(IDBKeyRange.lowerBound(since, true), limit) as IDBRequest<LogEntry[]>),
      );
    },
    async logHead() {
      return run(["log"], "readonly", async (tx) => {
        const cursor = await request(tx.objectStore("log").openKeyCursor(null, "prev"));
        return cursor ? (cursor.key as number) : 0;
      });
    },
    trimLog(upTo) {
      return run(["log"], "readwrite", (tx) => {
        tx.objectStore("log").delete(IDBKeyRange.upperBound(upTo));
      });
    },
    async close() {
      db.close();
    },
  };
}

export function deleteIndexedDBStorage(name = "jam"): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
