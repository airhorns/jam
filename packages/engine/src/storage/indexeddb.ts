import { factKey, type Fact, type StoredFact } from "../index";
import { FORMAT_VERSION, type FactStorage, type LogEntry, type StorageWrite } from "./index";

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

/** Open the database at the current format; data written under an older format is discarded. */
function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, FORMAT_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of Array.from(db.objectStoreNames)) db.deleteObjectStore(store);
      db.createObjectStore("facts", { keyPath: "key" });
      db.createObjectStore("meta");
      db.createObjectStore("log", { keyPath: "seq", autoIncrement: true });
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
        const seqs = (changes.log ?? []).map((entry) =>
          request(log.put({ op: entry.op, terms: entry.terms, scope: entry.scope }) as IDBRequest<number>),
        );
        const meta = tx.objectStore("meta");
        for (const [key, value] of Object.entries(changes.meta ?? {})) {
          if (value === undefined) meta.delete(key);
          else meta.put(value, key);
        }
        return Promise.all(seqs);
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
