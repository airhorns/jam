// publishStats() — the engine's size as facts, so programs and devtools can
// watch it like anything else: `["engine", "facts", 12000]`, `["engine",
// "wasmMemoryBytes", 4194304]`, one fact per field of `db.stats()`. The facts
// are owned by the publisher, so they are never persisted or synced.

import { db as defaultDb, _, type DBStats, type FactDB } from "./db";
import { transaction } from "./reactive";

export const ENGINE_STATS_FACT = "engine";

export interface PublishStatsOptions {
  /** How often to refresh, in ms (default: 1000). */
  interval?: number;
  db?: FactDB;
}

/** Refresh `["engine", name, value]` facts on an interval; returns a stop function that removes them. */
export function publishStats(options: PublishStatsOptions = {}): () => void {
  const { interval = 1000, db = defaultDb } = options;
  const owner = db.createChildOwner(db.getCurrentOwnerId(), "engine-stats");
  const last: Partial<DBStats> = {};
  const refresh = () => {
    const stats = db.stats();
    transaction(() => {
      db.withOwnerScope(owner, () => {
        for (const [name, value] of Object.entries(stats) as [keyof DBStats, number][]) {
          if (last[name] === value) continue;
          last[name] = value;
          db.drop(ENGINE_STATS_FACT, name, _);
          db.assert(ENGINE_STATS_FACT, name, value);
        }
      });
    });
  };
  refresh();
  const timer = setInterval(refresh, interval);
  return () => {
    clearInterval(timer);
    db.revokeOwner(owner);
  };
}
