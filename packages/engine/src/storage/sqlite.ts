// Node-only storage over `node:sqlite`.

import { DatabaseSync } from "node:sqlite";

import { factKey, type Fact, type StoredFact } from "../index";
import type { FactStorage, LogEntry, LogOp, StorageWrite } from "./index";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (key TEXT PRIMARY KEY, scope TEXT NOT NULL, terms TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS facts_scope ON facts (scope);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, op TEXT NOT NULL, terms TEXT NOT NULL, scope TEXT NOT NULL);
`;

export function sqliteStorage(path = ":memory:"): FactStorage {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  const selectFacts = db.prepare("SELECT terms, scope FROM facts");
  const upsert = db.prepare(
    "INSERT INTO facts (key, scope, terms) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET scope = excluded.scope",
  );
  const remove = db.prepare("DELETE FROM facts WHERE key = ?");
  const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
  const putMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  const delMeta = db.prepare("DELETE FROM meta WHERE key = ?");
  const appendLog = db.prepare("INSERT INTO log (seq, op, terms, scope) VALUES (?, ?, ?, ?)");
  const readLog = db.prepare("SELECT seq, op, terms, scope FROM log WHERE seq > ? ORDER BY seq LIMIT ?");
  const head = db.prepare("SELECT COALESCE(MAX(seq), 0) AS head FROM log");
  const trim = db.prepare("DELETE FROM log WHERE seq <= ?");

  const write = (changes: StorageWrite) => {
    db.exec("BEGIN");
    try {
      for (const terms of changes.deletes ?? []) remove.run(factKey(terms));
      for (const fact of changes.upserts ?? []) upsert.run(factKey(fact.terms), fact.scope, JSON.stringify(fact.terms));
      for (const entry of changes.log ?? []) appendLog.run(entry.seq, entry.op, JSON.stringify(entry.terms), entry.scope);
      for (const [key, value] of Object.entries(changes.meta ?? {})) {
        if (value === undefined) delMeta.run(key);
        else putMeta.run(key, value);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  return {
    async load() {
      return (selectFacts.all() as { terms: string; scope: string }[]).map(
        (r): StoredFact => ({ terms: JSON.parse(r.terms) as Fact, scope: r.scope }),
      );
    },
    async write(changes) {
      write(changes);
    },
    async getMeta(key) {
      const row = getMeta.get(key) as { value: string } | undefined;
      return row?.value;
    },
    async readLog(since, limit = -1) {
      return (readLog.all(since, limit) as { seq: number; op: LogOp; terms: string; scope: string }[]).map(
        (r): LogEntry => ({ seq: r.seq, op: r.op, terms: JSON.parse(r.terms) as Fact, scope: r.scope }),
      );
    },
    async logHead() {
      return (head.get() as { head: number }).head;
    },
    async trimLog(upTo) {
      trim.run(upTo);
    },
    async close() {
      db.close();
    },
  };
}
