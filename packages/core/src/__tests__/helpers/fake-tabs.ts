import type { Lead, TabCoordinator } from "../../tabs";

/** An in-memory stand-in for BroadcastChannel + Web Locks: messages reach the other open tabs on a later tick and one tab at a time holds the lead. */
export function fakeTabs() {
  interface Tab {
    coordinator: TabCoordinator;
    handlers: Array<(message: unknown) => void>;
    open: boolean;
  }
  const tabs = new Set<Tab>();
  const waiting: Array<{ tab: Tab; grant: () => void }> = [];
  let holder: Tab | null = null;
  let pending = 0;
  let idleWaiters: Array<() => void> = [];

  const deliver = (fn: () => void) => {
    pending++;
    setTimeout(() => {
      fn();
      if (--pending === 0) for (const resolve of idleWaiters.splice(0)) resolve();
    }, 0);
  };

  const handOver = () => {
    holder = null;
    const next = waiting.shift();
    if (!next) return;
    holder = next.tab;
    deliver(next.grant);
  };

  const join = (): TabCoordinator => {
    const tab: Tab = { handlers: [], open: true, coordinator: null as unknown as TabCoordinator };
    tab.coordinator = {
      post(message) {
        const data = JSON.parse(JSON.stringify(message)) as unknown;
        for (const other of tabs) {
          if (other !== tab) deliver(() => other.open && other.handlers.forEach((h) => h(data)));
        }
      },
      onMessage: (handler) => tab.handlers.push(handler),
      lead(): Lead {
        let grant!: () => void;
        const acquired = new Promise<void>((resolve) => (grant = resolve));
        const request = { tab, grant };
        if (holder) waiting.push(request);
        else {
          holder = tab;
          deliver(grant);
        }
        return {
          acquired,
          release() {
            const i = waiting.indexOf(request);
            if (i >= 0) waiting.splice(i, 1);
            else if (holder === tab) handOver();
          },
        };
      },
      close() {
        tab.open = false;
        tabs.delete(tab);
        if (holder === tab) handOver();
      },
    };
    tabs.add(tab);
    return tab.coordinator;
  };

  /** Resolves once every queued delivery has run. */
  const idle = async (): Promise<void> => {
    while (pending > 0) await new Promise<void>((resolve) => idleWaiters.push(resolve));
  };

  return {
    join,
    idle,
    get leader() {
      return holder?.coordinator ?? null;
    },
  };
}
