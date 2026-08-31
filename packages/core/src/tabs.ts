// Coordination between the browser tabs that share one sync database: a
// broadcast channel for messages and a lock naming the tab that holds the
// server connection. Outside a browser a tab is alone.

export interface Lead {
  /** Resolves once this tab holds the lead; it keeps it until `release` is called. */
  acquired: Promise<void>;
  /** Give up the lead, or withdraw the request. */
  release(): void;
}

export interface TabCoordinator {
  /** Deliver `message` to every other tab. */
  post(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
  lead(): Lead;
  close(): void;
}

export function browserTabs(name: string): TabCoordinator {
  const channel = new BroadcastChannel(`jam:sync:${name}`);
  const handlers = new Set<(message: unknown) => void>();
  channel.onmessage = (event) => {
    for (const handler of handlers) handler(event.data);
  };
  return {
    post: (message) => channel.postMessage(message),
    onMessage: (handler) => handlers.add(handler),
    lead() {
      const withdraw = new AbortController();
      let release = () => withdraw.abort();
      const acquired = new Promise<void>((resolve, reject) => {
        navigator.locks
          .request(`jam:sync:${name}`, { signal: withdraw.signal }, () => {
            return new Promise<void>((done) => {
              release = done;
              resolve();
            });
          })
          .catch((e: unknown) => {
            if (!(e instanceof DOMException && e.name === "AbortError")) reject(e);
          });
      });
      return { acquired, release: () => release() };
    },
    close: () => channel.close(),
  };
}

export function soloTabs(): TabCoordinator {
  return {
    post() {},
    onMessage() {},
    lead: () => ({ acquired: Promise.resolve(), release() {} }),
    close() {},
  };
}

export function defaultTabs(name: string): TabCoordinator {
  const browser =
    typeof document !== "undefined" && typeof BroadcastChannel !== "undefined" && typeof navigator !== "undefined" && "locks" in navigator;
  return browser ? browserTabs(name) : soloTabs();
}
