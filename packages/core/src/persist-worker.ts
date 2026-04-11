// Persistence Worker — runs wa-sqlite with OPFS for durable fact storage.
//
// Protocol:
//   Main → Worker: { type: "open", name: string }
//   Worker → Main: { type: "ready", facts: [string, any[]][] }
//   Main → Worker: { type: "put", facts: [string, any[]][] }
//   Main → Worker: { type: "delete", keys: string[] }
//   Worker → Main: { type: "ack" }

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { Factory } from "wa-sqlite/src/sqlite-api.js";
import { OriginPrivateFileSystemVFS } from "wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js";

let sqlite3: any;
let db: number;

async function open(name: string) {
  const module = await SQLiteESMFactory();
  sqlite3 = Factory(module);

  const vfs = new OriginPrivateFileSystemVFS();
  await vfs.isReady;
  sqlite3.vfs_register(vfs, true);

  db = await sqlite3.open_v2(`${name}.db`);

  await exec(`CREATE TABLE IF NOT EXISTS facts (
    key TEXT PRIMARY KEY,
    terms TEXT NOT NULL
  )`);

  // Load all persisted facts
  const facts: [string, any[]][] = [];
  await exec(`SELECT key, terms FROM facts`, (row: any[]) => {
    facts.push([row[0] as string, JSON.parse(row[1] as string)]);
  });

  self.postMessage({ type: "ready", facts });
}

async function put(facts: [string, any[]][]) {
  if (!db) return;
  await exec("BEGIN");
  for (const [key, terms] of facts) {
    await exec(
      `INSERT OR REPLACE INTO facts (key, terms) VALUES (?, ?)`,
      undefined,
      [key, JSON.stringify(terms)],
    );
  }
  await exec("COMMIT");
  self.postMessage({ type: "ack" });
}

async function del(keys: string[]) {
  if (!db) return;
  await exec("BEGIN");
  for (const key of keys) {
    await exec(`DELETE FROM facts WHERE key = ?`, undefined, [key]);
  }
  await exec("COMMIT");
  self.postMessage({ type: "ack" });
}

async function exec(
  sql: string,
  callback?: (row: any[]) => void,
  params?: any[],
) {
  const str = sqlite3.str_new(db, sql);
  try {
    const prepared = await sqlite3.prepare_v2(db, sqlite3.str_value(str));
    if (!prepared) return;
    const stmt = prepared.stmt;
    try {
      if (params) {
        for (let i = 0; i < params.length; i++) {
          const v = params[i];
          if (typeof v === "string") sqlite3.bind_text(stmt, i + 1, v);
          else if (typeof v === "number") sqlite3.bind_double(stmt, i + 1, v);
          else sqlite3.bind_null(stmt, i + 1);
        }
      }
      while (await sqlite3.step(stmt) === 100 /* SQLITE_ROW */) {
        if (callback) {
          const cols = sqlite3.column_count(stmt);
          const row: any[] = [];
          for (let i = 0; i < cols; i++) {
            row.push(sqlite3.column(stmt, i));
          }
          callback(row);
        }
      }
    } finally {
      sqlite3.finalize(stmt);
    }
  } finally {
    sqlite3.str_finish(str);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "open":
        await open(msg.name);
        break;
      case "put":
        await put(msg.facts);
        break;
      case "delete":
        await del(msg.keys);
        break;
    }
  } catch (err: any) {
    console.error("[persist-worker]", err);
    self.postMessage({ type: "error", message: err.message ?? String(err) });
  }
};
