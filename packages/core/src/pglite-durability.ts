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

/** Serve sync requests for a PGlite instance; call from the worker's `init`. Returns a disposer. */
export function serveSyncToDisk(pg: { fs?: { syncToFs(): Promise<void> } }, databaseId: string): () => void {
  const channel = new BroadcastChannel(channelName(databaseId));
  channel.onmessage = async (event: MessageEvent<SyncRequest>) => {
    if (event.data?.type !== "sync") return;
    const response: SyncResponse = { type: "synced", id: event.data.id };
    try {
      await pg.fs?.syncToFs();
    } catch (e) {
      response.error = e instanceof Error ? e.message : String(e);
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
