// Storage only stores. An adapter holds the durable facts, a small key/value
// area, and an append-only log (the change log on a server, the outbox on a
// client); the engine and the sync layer own every other concern.
//
// Log seqs are assigned by the adapter when entries are written: each one is
// greater than any seq the store has ever assigned, even after trimming, so
// several writers (browser tabs sharing one database) can append without
// coordinating and a reader's position stays valid across trims.

import { factKey, type Fact, type StoredFact } from "../index";

export type { StoredFact };

/** Bumped whenever the on-disk layout changes; adapters discard data written under another version. */
export const FORMAT_VERSION = 2;

export type LogOp = "upsert" | "delete" | "replace";

export interface LogEntry {
  seq: number;
  op: LogOp;
  terms: Fact;
  scope: string;
}

/** A log entry as handed to `write`, before the adapter assigns its seq. */
export type NewLogEntry = Omit<LogEntry, "seq">;

export interface StorageWrite {
  upserts?: StoredFact[];
  deletes?: Fact[];
  log?: NewLogEntry[];
  /** `undefined` deletes the key. */
  meta?: Record<string, string | undefined>;
}

export interface FactStorage {
  load(): Promise<StoredFact[]>;
  /** Everything in one write lands atomically. Resolves with the seq assigned to each `log` entry, in order. */
  write(changes: StorageWrite): Promise<number[]>;
  getMeta(key: string): Promise<string | undefined>;
  /** Log entries with `seq > since`, ascending. */
  readLog(since: number, limit?: number): Promise<LogEntry[]>;
  /** Highest seq in the log, 0 when empty. */
  logHead(): Promise<number>;
  /** Remove log entries with `seq <= upTo`. */
  trimLog(upTo: number): Promise<void>;
  close(): Promise<void>;
}

export function memoryStorage(): FactStorage {
  const facts = new Map<string, StoredFact>();
  const meta = new Map<string, string>();
  const log: LogEntry[] = [];
  let head = 0;
  return {
    async load() {
      return Array.from(facts.values(), (f) => ({ terms: f.terms.slice(), scope: f.scope }));
    },
    async write(changes) {
      for (const terms of changes.deletes ?? []) facts.delete(factKey(terms));
      for (const fact of changes.upserts ?? []) facts.set(factKey(fact.terms), { terms: fact.terms.slice(), scope: fact.scope });
      const seqs: number[] = [];
      for (const entry of changes.log ?? []) {
        log.push({ seq: ++head, op: entry.op, terms: entry.terms.slice(), scope: entry.scope });
        seqs.push(head);
      }
      for (const [key, value] of Object.entries(changes.meta ?? {})) {
        if (value === undefined) meta.delete(key);
        else meta.set(key, value);
      }
      return seqs;
    },
    async getMeta(key) {
      return meta.get(key);
    },
    async readLog(since, limit = Infinity) {
      const out: LogEntry[] = [];
      for (const entry of log) {
        if (entry.seq <= since) continue;
        out.push({ ...entry, terms: entry.terms.slice() });
        if (out.length >= limit) break;
      }
      return out;
    },
    async logHead() {
      return log.length ? log[log.length - 1].seq : 0;
    },
    async trimLog(upTo) {
      let i = 0;
      while (i < log.length && log[i].seq <= upTo) i++;
      log.splice(0, i);
    },
    async close() {},
  };
}
