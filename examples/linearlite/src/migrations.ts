import type { PGliteInterface } from "@electric-sql/pglite";
import createTables from "../db/migrations-client/01-create_tables.sql?raw";
import postInitialSyncIndexes from "../db/migrations-client/post-initial-sync-indexes.sql?raw";
import postInitialSyncFtsIndex from "../db/migrations-client/post-initial-sync-fts-index.sql?raw";

export async function migrate(pg: PGliteInterface): Promise<void> {
  const tables = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'issue'`,
  );
  if (tables.rows.length === 0) await pg.exec(createTables);
}

/** Indexes are created after the initial shape sync so the bulk COPY isn't slowed down by them. */
export async function createIndexes(pg: PGliteInterface): Promise<void> {
  await pg.exec(postInitialSyncIndexes);
}

export async function createSearchIndex(pg: PGliteInterface): Promise<void> {
  await pg.exec(postInitialSyncFtsIndex);
}
