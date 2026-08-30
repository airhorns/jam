import { live, type PGliteWithLive } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { requestSyncToDisk } from "./pglite-durability";

/**
 * The PGlite surface jam needs: queries, transactions, and the `live` extension.
 * `syncToDisk`, when present, resolves once committed data has reached storage.
 */
export type JamPGlite = PGliteWithLive & { syncToDisk?(): Promise<void> };

export interface OpenDatabaseOptions {
  /** Database name; becomes `idb://${name}` unless `dataDir` is given. */
  name?: string;
  /** PGlite data directory URI (`idb://…`, `opfs-ahp://…`, `memory://`). */
  dataDir?: string;
  /** Return from queries before changes are flushed to storage (default: true). Use `syncToDisk()` to wait for a flush. */
  relaxedDurability?: boolean;
}

/**
 * Open a PGlite database in a shared Web Worker. Multiple tabs on the same
 * `dataDir` elect a leader that owns the database; the others proxy to it.
 */
export async function openDatabase(
  options: OpenDatabaseOptions = {},
): Promise<JamPGlite & PGliteWorker & { syncToDisk(): Promise<void> }> {
  const name = options.name ?? "jam";
  const dataDir = options.dataDir ?? `idb://${name}`;
  const workerInstance = new Worker(new URL("./pglite-worker.ts", import.meta.url), { type: "module" });
  const pg = await PGliteWorker.create(workerInstance, {
    dataDir,
    relaxedDurability: options.relaxedDurability ?? true,
    extensions: { live },
  });
  await pg.waitReady;
  return Object.assign(pg, {
    syncToDisk: async () => {
      await pg.waitReady;
      await requestSyncToDisk(dataDir);
    },
  });
}
