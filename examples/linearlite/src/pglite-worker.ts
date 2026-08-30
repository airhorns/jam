import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { serveSyncToDisk } from "@jam/core/durability";
import { migrate, createIndexes, createSearchIndex } from "./migrations";
import { seedLocal } from "./seed";

export interface WorkerMeta {
  /** Seed this many issues when the database is empty and Electric isn't configured. */
  seed?: number;
}

worker({
  async init(options) {
    const dataDir = options.dataDir ?? "idb://linearlite";
    const pg = await PGlite.create({ dataDir, relaxedDurability: true });
    await migrate(pg);
    const meta = (options.meta ?? {}) as WorkerMeta;
    if (meta.seed) {
      const existing = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM issue`);
      if (existing.rows[0].n === 0) {
        await seedLocal(pg, meta.seed);
        await createIndexes(pg);
        await createSearchIndex(pg);
      }
    }
    serveSyncToDisk(pg, dataDir);
    return pg;
  },
});
