import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { serveSyncToDisk } from "@jam/core/durability";
import { JAM_FACTS_SQL } from "@jam/core/server";
import { seedLocal } from "./seed";

export interface WorkerMeta {
  /** Seed this many issues when the database is empty and Electric isn't configured. */
  seed?: number;
}

worker({
  async init(options) {
    const dataDir = options.dataDir ?? "idb://linearlite";
    const pg = await PGlite.create({ dataDir, relaxedDurability: true });
    const meta = (options.meta ?? {}) as WorkerMeta;
    if (meta.seed) {
      await pg.exec(JAM_FACTS_SQL);
      await seedLocal(pg, meta.seed);
    }
    serveSyncToDisk(pg, dataDir);
    return pg;
  },
});
