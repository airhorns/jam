// With PGlite's relaxed durability, a query resolves before its changes reach
// IndexedDB. This BroadcastChannel protocol lets any tab ask the leader worker
// to force a filesystem sync and wait for it to finish.

interface SyncRequest {
  type: "sync";
  id: string;
}

interface SyncResponse {
  type: "synced";
  id: string;
  error?: string;
}

const channelName = (databaseId: string) => `jam-sync-to-disk:${databaseId}`;

/** Emscripten's `FS.ErrnoError` is not an `Error`: it only carries `errno`. */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "errno" in e) return `${(e as { name?: string }).name ?? "ErrnoError"} errno ${(e as { errno: unknown }).errno}`;
  return String(e);
}

// IDBFS lists the local files, awaits an IndexedDB read of the remote set, then
// reads each local file; a temp or WAL file Postgres removed during that await
// fails the whole sync with ENOENT, and the next attempt sees a consistent set.
async function syncToFs(pg: { fs?: { syncToFs(): Promise<void> } }, attempts: number): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pg.fs?.syncToFs();
      return;
    } catch (e) {
      if (attempt >= attempts) throw e;
    }
  }
}

/** Serve sync requests for a PGlite instance; call from the worker's `init`. Returns a disposer. */
export function serveSyncToDisk(pg: { fs?: { syncToFs(): Promise<void> } }, databaseId: string, { attempts = 3 } = {}): () => void {
  const channel = new BroadcastChannel(channelName(databaseId));
  channel.onmessage = async (event: MessageEvent<SyncRequest>) => {
    if (event.data?.type !== "sync") return;
    const response: SyncResponse = { type: "synced", id: event.data.id };
    try {
      await syncToFs(pg, attempts);
    } catch (e) {
      response.error = describeError(e);
    }
    channel.postMessage(response);
  };
  return () => channel.close();
}

/** Ask the leader worker to flush PGlite's filesystem to storage and wait until it has. */
export function requestSyncToDisk(databaseId: string, timeoutMs = 15000): Promise<void> {
  const channel = new BroadcastChannel(channelName(databaseId));
  const id = crypto.randomUUID();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.close();
      reject(new Error("Timed out waiting for the PGlite worker to sync to disk"));
    }, timeoutMs);
    channel.onmessage = (event: MessageEvent<SyncResponse>) => {
      if (event.data?.type !== "synced" || event.data.id !== id) return;
      clearTimeout(timer);
      channel.close();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve();
    };
    channel.postMessage({ type: "sync", id } satisfies SyncRequest);
  });
}
