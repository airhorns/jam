import type { Lead, TabCoordinator } from "../../tabs";

/**
 * An in-memory stand-in for BroadcastChannel + Web Locks: messages reach the other open tabs on a
 * later tick — after `latency()` more milliseconds, in order per receiver — and one tab at a time
 * holds the lead.
 */
export function fakeTabs(latency: () => number = () => 0, onPost?: (from: string, message: unknown) => void) {
  interface Tab {
    coordinator: TabCoordinator;
    handlers: Array<(message: unknown) => void>;
    open: boolean;
    inbox: Promise<void>;
  }
  const tabs = new Set<Tab>();
  const waiting: Array<{ tab: Tab; grant: () => void }> = [];
  let holder: Tab | null = null;
  let pending = 0;
  const idleWaiters: Array<() => void> = [];

  const finish = () => {
    if (--pending === 0) for (const resolve of idleWaiters.splice(0)) resolve();
  };
  const deliver = (tab: Tab, fn: () => void) => {
    pending++;
    const delay = latency();
    tab.inbox = tab.inbox.then(() => new Promise<void>((resolve) => setTimeout(resolve, delay))).then(() => {
      fn();
      finish();
    });
  };

  const handOver = () => {
    holder = null;
    const next = waiting.shift();
    if (!next) return;
    holder = next.tab;
    deliver(holder, next.grant);
  };

  const join = (): TabCoordinator => {
    const tab: Tab = { handlers: [], open: true, inbox: Promise.resolve(), coordinator: null as unknown as TabCoordinator };
    tab.coordinator = {
      post(message) {
        const data = JSON.parse(JSON.stringify(message)) as unknown;
        onPost?.(String((message as { tab?: string }).tab ?? ""), data);
        for (const other of tabs) {
          if (other !== tab) deliver(other, () => other.open && other.handlers.forEach((h) => h(data)));
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
          deliver(tab, grant);
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
