import { describe, it, expect, afterEach, vi } from "vitest";
import { browserTabs, defaultTabs, soloTabs, type TabCoordinator } from "../tabs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A Web Locks stand-in: one holder per name, waiters granted in order, an aborted waiter rejected with AbortError. */
function fakeLocks() {
  interface Waiter {
    signal?: AbortSignal;
    run(): void;
    abort(): void;
  }
  const holders = new Set<string>();
  const queues = new Map<string, Waiter[]>();
  const grants: string[] = [];

  const next = (name: string) => {
    holders.delete(name);
    const waiter = queues.get(name)?.shift();
    if (waiter) waiter.run();
  };

  const request = (name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown> | unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal: options.signal,
        run() {
          holders.add(name);
          grants.push(name);
          Promise.resolve()
            .then(callback)
            .then(resolve, reject)
            .finally(() => next(name));
        },
        abort() {
          const queue = queues.get(name) ?? [];
          queue.splice(queue.indexOf(waiter), 1);
          reject(new DOMException("The request was aborted.", "AbortError"));
        },
      };
      options.signal?.addEventListener("abort", () => waiter.abort(), { once: true });
      if (holders.has(name)) queues.set(name, [...(queues.get(name) ?? []), waiter]);
      else waiter.run();
    });

  return { request, grants, holding: (name: string) => holders.has(name), waiting: (name: string) => queues.get(name)?.length ?? 0 };
}

const open: TabCoordinator[] = [];
const join = (name: string) => {
  const tabs = browserTabs(name);
  open.push(tabs);
  return tabs;
};

afterEach(() => {
  for (const tabs of open.splice(0)) tabs.close();
  vi.unstubAllGlobals();
});

describe("browserTabs", () => {
  it("broadcasts to the other tabs of the same database and to every handler, never to itself", async () => {
    const a = join("db");
    const b = join("db");
    const other = join("elsewhere");
    const seen: string[] = [];
    a.onMessage((m) => seen.push(`a:${JSON.stringify(m)}`));
    b.onMessage((m) => seen.push(`b1:${JSON.stringify(m)}`));
    b.onMessage((m) => seen.push(`b2:${JSON.stringify(m)}`));
    other.onMessage((m) => seen.push(`other:${JSON.stringify(m)}`));

    a.post({ t: "hello" });
    await sleep(20);
    expect(seen.sort()).toEqual(['b1:{"t":"hello"}', 'b2:{"t":"hello"}']);
  });

  it("stops delivering to a closed tab", async () => {
    const a = join("db");
    const b = join("db");
    const seen: unknown[] = [];
    b.onMessage((m) => seen.push(m));
    b.close();
    a.post(1);
    await sleep(20);
    expect(seen).toEqual([]);
  });

  it("takes the lead through a Web Lock and passes it on when released", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    const a = join("db");
    const b = join("db");

    const first = a.lead();
    await first.acquired;
    expect(locks.holding("jam:sync:db")).toBe(true);

    const second = b.lead();
    let secondAcquired = false;
    void second.acquired.then(() => (secondAcquired = true));
    await sleep(10);
    expect(secondAcquired).toBe(false);
    expect(locks.waiting("jam:sync:db")).toBe(1);

    first.release();
    await second.acquired;
    expect(secondAcquired).toBe(true);
    expect(locks.grants).toEqual(["jam:sync:db", "jam:sync:db"]);

    second.release();
    await sleep(10);
    expect(locks.holding("jam:sync:db")).toBe(false);
  });

  it("withdraws a request released before it was granted without rejecting", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    const a = join("db");
    const b = join("db");
    const holder = a.lead();
    await holder.acquired;

    const waiting = b.lead();
    let outcome = "pending";
    void waiting.acquired.then(
      () => (outcome = "acquired"),
      () => (outcome = "rejected"),
    );
    waiting.release();
    await sleep(10);
    expect(outcome).toBe("pending");
    expect(locks.waiting("jam:sync:db")).toBe(0);

    holder.release();
    await sleep(10);
    expect(outcome).toBe("pending");
    expect(locks.grants).toEqual(["jam:sync:db"]);
  });

  it("rejects the lead when the lock request itself fails", async () => {
    vi.stubGlobal("navigator", { locks: { request: () => Promise.reject(new Error("locks unavailable")) } });
    const a = join("db");
    await expect(a.lead().acquired).rejects.toThrow("locks unavailable");
  });
});

describe("soloTabs", () => {
  it("is alone: leads at once and its messages go nowhere", async () => {
    const tabs = soloTabs();
    const seen: unknown[] = [];
    tabs.onMessage((m) => seen.push(m));
    tabs.post("x");
    const lead = tabs.lead();
    await lead.acquired;
    lead.release();
    tabs.close();
    expect(seen).toEqual([]);
  });
});

describe("defaultTabs", () => {
  it("coordinates through the browser APIs when a document, BroadcastChannel and Web Locks exist", async () => {
    vi.stubGlobal("document", {});
    vi.stubGlobal("navigator", { locks: fakeLocks() });
    const tabs = defaultTabs("db");
    open.push(tabs);
    const peer = join("db");
    const seen: unknown[] = [];
    peer.onMessage((m) => seen.push(m));
    tabs.post("hi");
    await sleep(20);
    expect(seen).toEqual(["hi"]);
    await tabs.lead().acquired;
  });

  it("falls back to a solo tab when any of them is missing", async () => {
    const seen: unknown[] = [];
    const peer = join("db");
    peer.onMessage((m) => seen.push(m));
    const isSolo = async (stubs: Record<string, unknown>) => {
      for (const [name, value] of Object.entries(stubs)) vi.stubGlobal(name, value);
      const tabs = defaultTabs("db");
      vi.unstubAllGlobals();
      tabs.post("hi");
      await sleep(10);
      tabs.close();
      return seen.length === 0;
    };

    expect(await isSolo({})).toBe(true);
    expect(await isSolo({ document: {}, BroadcastChannel: undefined })).toBe(true);
    expect(await isSolo({ document: {}, navigator: undefined })).toBe(true);
    expect(await isSolo({ document: {}, navigator: {} })).toBe(true);
  });
});
