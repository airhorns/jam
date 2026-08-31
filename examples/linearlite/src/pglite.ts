import { live, type PGliteWithLive } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { electricSync, type PGliteWithSync } from "@electric-sql/pglite-sync";
import { requestSyncToDisk } from "@jam/core/durability";
import type { WorkerMeta } from "./pglite-worker";

export type LinearlitePG = PGliteWorker & PGliteWithLive & PGliteWithSync & { syncToDisk(): Promise<void> };

/** The sync server (server.ts); unset means standalone with a locally seeded database. */
export const SYNC_URL: string | undefined = import.meta.env.VITE_SYNC_URL || undefined;

export const DEFAULT_SEED = 5000;

export function seedCountFromLocation(location: Location): number | undefined {
  if (SYNC_URL) return undefined;
  const raw = new URL(location.href).searchParams.get("seed");
  const n = raw == null ? DEFAULT_SEED : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function openLinearliteDatabase(meta: WorkerMeta, dataDir = "idb://linearlite"): Promise<LinearlitePG> {
  const pg = await PGliteWorker.create(
    new Worker(new URL("./pglite-worker.ts", import.meta.url), { type: "module" }),
    { dataDir, relaxedDurability: true, meta, extensions: { live, sync: electricSync() } },
  );
  await pg.waitReady;
  return Object.assign(pg, {
    syncToDisk: async () => {
      await pg.waitReady;
      await requestSyncToDisk(dataDir);
    },
  });
}
