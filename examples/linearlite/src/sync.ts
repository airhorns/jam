// Electric sync: shapes stream Postgres rows into the local `issue`/`comment`
// tables; the write path ships locally modified rows to the write server.
// Nothing here knows about facts — syncTable bindings pick up the table
// changes like any other SQL write.

import { Mutex } from "@electric-sql/pglite";
import type { PGliteWithLive } from "@electric-sql/pglite/live";
import type { PGliteWithSync } from "@electric-sql/pglite-sync";
import { replace, transaction } from "@jam/core";
import type { ChangeSet, CommentChange, IssueChange } from "./changes";
import { createIndexes } from "./migrations";

export type SyncStatus = "standalone" | "initial-sync" | "done";

export function setSyncStatus(status: SyncStatus, message = ""): void {
  transaction(() => {
    replace("sync", "status", status);
    replace("sync", "message", message);
  });
}

const ISSUE_CHANGE_COLUMNS =
  "id, title, description, priority, status, modified, created, kanbanorder, username, modified_columns, deleted, new";
const COMMENT_CHANGE_COLUMNS = "id, body, username, issue_id, modified, created, modified_columns, deleted, new";

function serializeDates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as T;
}

/** Rows changed locally that have not yet been sent to the write server. */
export async function collectChanges(pg: PGliteWithLive): Promise<ChangeSet> {
  return pg.transaction(async (tx) => {
    const issues = await tx.query<IssueChange>(
      `SELECT ${ISSUE_CHANGE_COLUMNS} FROM issue WHERE synced = false AND sent_to_server = false`,
    );
    const comments = await tx.query<CommentChange>(
      `SELECT ${COMMENT_CHANGE_COLUMNS} FROM comment WHERE synced = false AND sent_to_server = false`,
    );
    return { issues: issues.rows.map(serializeDates), comments: comments.rows.map(serializeDates) };
  });
}

/** Flag the rows as sent, skipping any that changed again while the request was in flight. */
export async function markSent(pg: PGliteWithLive, changes: ChangeSet): Promise<void> {
  await pg.transaction(async (tx) => {
    await tx.exec(`SET LOCAL electric.bypass_triggers = true`);
    for (const issue of changes.issues) {
      await tx.query(`UPDATE issue SET sent_to_server = true WHERE id = $1 AND modified = $2`, [issue.id, issue.modified]);
    }
    for (const comment of changes.comments) {
      await tx.query(`UPDATE comment SET sent_to_server = true WHERE id = $1 AND modified = $2`, [
        comment.id,
        comment.modified,
      ]);
    }
  });
}

export interface WritePathOptions {
  applyChangesUrl: string;
  fetch?: typeof fetch;
}

export async function pushChanges(pg: PGliteWithLive, options: WritePathOptions): Promise<ChangeSet> {
  const changes = await collectChanges(pg);
  if (changes.issues.length === 0 && changes.comments.length === 0) return changes;
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(options.applyChangesUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw new Error(`Write server rejected changes: ${response.status}`);
  await markSent(pg, changes);
  return changes;
}

/** Watch for unsynced rows and push them; returns a disposer. */
export function startWritePath(pg: PGliteWithLive, options: WritePathOptions): () => Promise<void> {
  const mutex = new Mutex();
  const query = pg.live.query<{ issue_count: number; comment_count: number }>({
    query: `SELECT
      (SELECT count(*)::int FROM issue WHERE synced = false AND sent_to_server = false) AS issue_count,
      (SELECT count(*)::int FROM comment WHERE synced = false AND sent_to_server = false) AS comment_count`,
    callback: async (results) => {
      const { issue_count, comment_count } = results.rows[0];
      if (issue_count === 0 && comment_count === 0) return;
      await mutex.acquire();
      try {
        await pushChanges(pg, options);
      } catch (error) {
        console.error("[linearlite] write path failed", error);
      } finally {
        mutex.release();
      }
    },
  });
  return async () => {
    await (await query).unsubscribe();
  };
}

export interface ShapeSyncOptions {
  electricUrl: string;
  sourceId?: string;
  sourceSecret?: string;
}

/**
 * Stream the `issue` and `comment` shapes into PGlite. Triggers stay disabled
 * until the first full sync has landed so the bulk load isn't marked as local edits.
 */
export async function startShapeSync(pg: PGliteWithLive & PGliteWithSync, options: ShapeSyncOptions): Promise<void> {
  const hadIssues = (await pg.query(`SELECT 1 FROM issue LIMIT 1`)).rows.length > 0;
  if (!hadIssues) setSyncStatus("initial-sync", "Downloading issues…");

  const shapeUrl = new URL("/v1/shape", options.electricUrl).toString();
  const params: Record<string, string> = {};
  if (options.sourceId) params.source_id = options.sourceId;
  if (options.sourceSecret) params.secret = options.sourceSecret;

  const shapeFor = (table: string) => ({
    shape: { url: shapeUrl, params: { ...params, table } },
    table,
    primaryKey: ["id"],
  });

  let initialSyncDone: () => void = () => {};
  const initialSync = new Promise<void>((resolve) => (initialSyncDone = resolve));

  await pg.sync.syncShapesToTables({
    key: "linearlite",
    shapes: { issue: shapeFor("issue"), comment: shapeFor("comment") },
    initialInsertMethod: "csv",
    onInitialSync: async () => {
      await pg.exec(`ALTER TABLE issue ENABLE TRIGGER ALL; ALTER TABLE comment ENABLE TRIGGER ALL;`);
      if (!hadIssues) {
        setSyncStatus("initial-sync", "Creating indexes…");
        await createIndexes(pg);
      }
      initialSyncDone();
    },
    onError: (error) => console.error("[linearlite] shape sync error", error),
  });

  if (!hadIssues) await initialSync;
  setSyncStatus("done");
}

export interface SyncConfig {
  electricUrl?: string;
  writeServerUrl: string;
  sourceId?: string;
  sourceSecret?: string;
}

/** Entry point: Electric mode when configured, otherwise a purely local database. */
export async function startSync(pg: PGliteWithLive & PGliteWithSync, config: SyncConfig): Promise<void> {
  if (!config.electricUrl) {
    setSyncStatus("standalone");
    return;
  }
  await startShapeSync(pg, {
    electricUrl: config.electricUrl,
    sourceId: config.sourceId,
    sourceSecret: config.sourceSecret,
  });
  startWritePath(pg, { applyChangesUrl: `${config.writeServerUrl}/apply-changes` });
}
