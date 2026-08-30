import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { serveSyncToDisk } from "./pglite-durability";

worker({
  async init(options) {
    const pg = await PGlite.create({
      dataDir: options.dataDir,
      relaxedDurability: options.relaxedDurability ?? true,
    });
    serveSyncToDisk(pg, options.id ?? options.dataDir ?? "");
    return pg;
  },
});
