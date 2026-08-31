// Where the page gets its facts: a sync server when one is configured, otherwise
// a self-seeded local database. `?sync=ws://…` overrides the build-time URL so
// tests can point a page at a server they started themselves; the tab remembers
// it so in-app navigation and reloads stay on that server.

export const DEFAULT_SEED = 5000;

const SYNC_URL_KEY = "linearlite:sync-url";

export function syncUrlFromLocation(location: Location): string | undefined {
  const requested = new URL(location.href).searchParams.get("sync");
  if (requested) {
    sessionStorage.setItem(SYNC_URL_KEY, requested);
    return requested;
  }
  return sessionStorage.getItem(SYNC_URL_KEY) || import.meta.env.VITE_SYNC_URL || undefined;
}

/** Issues to seed into an empty local database; none when syncing, the server has the data. */
export function seedCountFromLocation(location: Location): number | undefined {
  if (syncUrlFromLocation(location)) return undefined;
  const raw = new URL(location.href).searchParams.get("seed");
  const n = raw == null ? DEFAULT_SEED : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
