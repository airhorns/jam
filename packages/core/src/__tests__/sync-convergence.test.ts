// A randomized simulation of several browsers — some with two tabs — writing,
// replacing and dropping facts against one sync server while connections drop,
// leaders close, tabs reload from storage and subscriptions come and go. When
// the dust settles every tab must hold exactly the server's facts for the
// scopes it subscribes to, and every browser's storage must mirror them.

import { describe, it, expect, vi } from "vitest";
import { memoryStorage, type FactStorage } from "@jam/engine/storage";
import { $, FactDB } from "../db";
import { sync, type FactSubscription, type SyncHandle } from "../sync";
import { createSyncServer, type SyncChange, type SyncServer } from "../server";
import { fakeNetwork, type FakeClientSocket, type FakeNetwork } from "./helpers/fake-socket";
import { fakeTabs } from "./helpers/fake-tabs";

const SCOPES = ["p0", "p1"];
const ENTITIES = 4;
const ATTRS = ["a", "b"];
const VALUES = 3;

const scopeOf = (entity: number) => SCOPES[entity % SCOPES.length];
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function prng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}

interface Tab {
  handle: SyncHandle;
  db: FactDB;
  subs: Map<string, FactSubscription>;
}

interface Browser {
  storage: FactStorage;
  hub: ReturnType<typeof fakeTabs>;
  sockets: FakeClientSocket[];
  tabs: Tab[];
}

/** Records every write so a failing seed can be traced. */
function tracedStorage(inner: FactStorage, label: string, trace: string[]): FactStorage {
  const show = (f: { terms: readonly unknown[] } | readonly unknown[]) => JSON.stringify("terms" in f ? f.terms : f);
  return {
    ...inner,
    // Traced synchronously so the wrapper adds no microtask ticks.
    write(changes) {
      trace.push(
        `${label} write up=[${(changes.upserts ?? []).map(show).join(" ")}] del=[${(changes.deletes ?? []).map(show).join(" ")}] log=[${(changes.log ?? []).map((e) => `${e.op}:${show(e)}`).join(" ")}] meta=${JSON.stringify(changes.meta ?? {})}`,
      );
      return inner.write(changes);
    },
    trimLog(upTo) {
      trace.push(`${label} trim ${upTo}`);
      return inner.trimLog(upTo);
    },
  };
}

/** Facts of `scope`, as sorted keys. */
const keysOf = (facts: Iterable<{ terms: readonly unknown[]; scope: string }>, scope: string): string[] =>
  Array.from(facts)
    .filter((f) => f.scope === scope)
    .map((f) => JSON.stringify(f.terms))
    .sort();

function memoryOf(db: FactDB): Array<{ terms: unknown[]; scope: string }> {
  return Array.from(db.facts.values())
    .filter((f) => f[0] !== "sync")
    .map((terms) => ({ terms, scope: db.scopeOf(...terms) }));
}

async function simulate(seed: number, steps: number) {
  vi.useFakeTimers();
  try {
    await run(seed, steps);
  } finally {
    vi.useRealTimers();
  }
}

async function run(seed: number, steps: number) {
  const rand = prng(seed);
  // Connections die only when the run drops them; a heartbeat would leave `drain` a timer to run forever.
  const server: SyncServer = await createSyncServer({ storage: memoryStorage(), logRetention: 4, heartbeat: 0 });
  const net: FakeNetwork = fakeNetwork((socket) => server.handle(socket));
  const browsers: Browser[] = [];
  const log: string[] = [];
  const trace: string[] = [];
  const op = (line: string) => {
    log.push(line);
    trace.push(`OP ${line}`);
  };

  const openTab = async (browser: Browser, scopes: string[]): Promise<Tab> => {
    const db = new FactDB();
    const handle = await sync({
      url: "ws://sim",
      storage: browser.storage,
      retryDelay: 1,
      socket: (url) => {
        const socket = net.connect(url);
        browser.sockets.push(socket);
        return socket;
      },
      tabs: browser.hub.join(),
      db,
    });
    const tab: Tab = { handle, db, subs: new Map() };
    for (const scope of scopes) tab.subs.set(scope, handle.subscribe({ scope }));
    browser.tabs.push(tab);
    return tab;
  };

  const closeTab = async (browser: Browser, tab: Tab) => {
    browser.tabs.splice(browser.tabs.indexOf(tab), 1);
    await tab.handle.dispose();
    tab.db.dispose();
  };

  const who = (browser: Browser, tab: Tab) => `@b${browsers.indexOf(browser)}/${tab.handle.tab.slice(0, 4)}`;
  const randomScopes = () => (rand.chance(0.3) ? SCOPES : [rand.pick(SCOPES)]);

  for (let b = 0; b < 3; b++) {
    const browser: Browser = {
      storage: tracedStorage(memoryStorage(), `b${b}`, trace),
      hub: fakeTabs(() => rand.int(4) * 4, (from, message) => trace.push(`b${b} ${from.slice(0, 4)} post ${JSON.stringify(message)}`)),
      sockets: [],
      tabs: [],
    };
    browsers.push(browser);
    await openTab(browser, randomScopes());
    if (b === 0) await openTab(browser, randomScopes());
  }
  for (let e = 0; e < ENTITIES; e++) {
    await server.apply([{ op: "upsert", terms: ["e", e, "a", 0], scope: scopeOf(e) }]);
  }

  // Time only moves here: messages, reconnects and tab deliveries due within the window fire in order.
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(rand.int(12));
  };
  const drain = async () => {
    while (vi.getTimerCount() > 0) await vi.runAllTimersAsync();
  };

  const openTabs = () => browsers.flatMap((b) => b.tabs.map((tab) => ({ browser: b, tab })));

  const dump = async (): Promise<string> => {
    const lines: string[] = [];
    for (const [i, b] of browsers.entries()) {
      const mirror = await b.storage.load();
      const entries = await b.storage.readLog(0);
      lines.push(`browser ${i}: sockets=${b.sockets.length} hubLeader=${b.hub.leader ? "yes" : "no"}`);
      lines.push(`  storage: ${JSON.stringify(mirror.map((f) => `${f.scope}:${JSON.stringify(f.terms)}`).sort())}`);
      lines.push(`  log: ${JSON.stringify(entries.map((e) => `${e.seq}:${e.op}:${JSON.stringify(e.terms)}`))}`);
      for (const t of b.tabs) {
        lines.push(
          `  tab ${t.handle.tab.slice(0, 4)} leading=${t.handle.leading} connected=${t.handle.connected} subs=${Array.from(t.subs.keys()).join(",")}`,
        );
        lines.push(`    memory: ${JSON.stringify(memoryOf(t.db).map((f) => `${f.scope}:${JSON.stringify(f.terms)}`).sort())}`);
      }
    }
    lines.push(`server: ${JSON.stringify(Array.from(server.facts()).map((f) => `${f.scope}:${JSON.stringify(f.terms)}`).sort())}`);
    return lines.join("\n");
  };

  // Under fake timers a stuck run only shows as a timeout; SIM_DEBUG reports where it stopped.
  let phase = "steps";
  const watchdog = process.env.SIM_DEBUG
    ? realSetTimeout(() => {
        void dump().then((state) => console.log(`seed ${seed} stuck in ${phase}; last ops:\n${log.slice(-15).join("\n")}\n${state}`));
      }, 15_000)
    : null;

  for (let step = 0; step < steps; step++) {
    const roll = rand.int(100);
    const { browser, tab } = rand.pick(openTabs());
    const entity = rand.int(ENTITIES);
    const scope = scopeOf(entity);
    const attr = rand.pick(ATTRS);
    if (roll < 45) {
      if (!tab.subs.has(scope)) continue;
      const kind = rand.int(3);
      if (kind === 0) {
        const value = rand.int(VALUES);
        op(`assert e${entity} ${attr}=${value} ${who(browser, tab)}`);
        tab.db.withScope(scope, () => tab.db.insert("e", entity, attr, value));
      } else if (kind === 1) {
        const value = rand.int(VALUES);
        op(`replace e${entity} ${attr}=${value} ${who(browser, tab)}`);
        tab.db.withScope(scope, () => tab.db.replace("e", entity, attr, value));
      } else {
        const own = memoryOf(tab.db).filter((f) => f.scope === scope && f.terms[1] === entity);
        if (own.length === 0) continue;
        const victim = rand.pick(own);
        op(`drop ${JSON.stringify(victim.terms)} ${who(browser, tab)}`);
        tab.db.drop(...(victim.terms as Parameters<FactDB["drop"]>));
      }
    } else if (roll < 55) {
      const value = rand.int(VALUES);
      const kind = rand.pick(["upsert", "replace", "delete"] as const);
      const change: SyncChange = { op: kind, terms: ["e", entity, attr, value], scope };
      op(`server ${kind} ${JSON.stringify(change.terms)}`);
      await server.apply([change]);
    } else if (roll < 65) {
      const sub = tab.subs.get(scope);
      if (sub) {
        op(`dispose ${scope} ${who(browser, tab)}`);
        tab.subs.delete(scope);
        await sub.dispose();
      } else {
        op(`subscribe ${scope} ${who(browser, tab)}`);
        tab.subs.set(scope, tab.handle.subscribe({ scope }));
      }
    } else if (roll < 73) {
      const socket = browser.sockets[browser.sockets.length - 1];
      if (socket) {
        op(`drop connection b${browsers.indexOf(browser)}`);
        socket.drop();
      }
    } else if (roll < 78) {
      op(`close tab, open another ${who(browser, tab)}`);
      const scopes = randomScopes();
      await closeTab(browser, tab);
      await openTab(browser, scopes);
    } else if (roll < 83) {
      op(`reload browser b${browsers.indexOf(browser)}`);
      for (const t of [...browser.tabs]) await closeTab(browser, t);
      await openTab(browser, randomScopes());
      if (rand.chance(0.5)) await openTab(browser, randomScopes());
    } else {
      await settle();
    }
  }

  // Let everything reconnect, push and catch up.
  phase = "quiet";
  for (let round = 0; round < 50; round++) {
    await drain();
    const tabs = openTabs().map((t) => t.tab);
    const quiet = tabs.every((t) => t.handle.connected && t.db.query(["sync", "pending", 0]).length === 1);
    if (quiet) break;
  }
  phase = "flush";
  for (const { tab } of openTabs()) {
    const flushed = tab.handle.flush();
    await drain();
    await flushed;
  }
  phase = "final settle";
  await drain();
  if (watchdog) realClearTimeout(watchdog);

  const state = await dump();
  const describeFailure = (what: string) =>
    `${what}\nseed ${seed}\n${log.join("\n")}\n${state}${process.env.SIM_TRACE ? `\nTRACE\n${trace.join("\n")}` : ""}`;
  for (const browser of browsers) {
    const covered = new Set(browser.tabs.flatMap((t) => Array.from(t.subs.keys())));
    for (const tab of browser.tabs) {
      const memory = memoryOf(tab.db);
      for (const scope of SCOPES) {
        const expected = tab.subs.has(scope) ? keysOf(server.facts(), scope) : [];
        expect(keysOf(memory, scope), describeFailure(`tab memory for ${scope}`)).toEqual(expected);
      }
      expect(tab.handle.leading, describeFailure("leadership")).toBe(tab === browser.tabs.find((t) => t.handle.leading));
    }
    const mirror = await browser.storage.load();
    for (const scope of covered) {
      expect(keysOf(mirror, scope), describeFailure(`storage mirror for ${scope}`)).toEqual(keysOf(server.facts(), scope));
    }
    expect(await browser.storage.readLog(0), describeFailure("outbox")).toEqual([]);
  }

  for (const browser of browsers) for (const tab of [...browser.tabs]) await closeTab(browser, tab);
  await server.close();
}

describe("sync convergence", () => {
  const seeds = process.env.SIM_SEEDS
    ? process.env.SIM_SEEDS.split(",").map(Number)
    : Array.from({ length: 200 }, (_, i) => i + 1);
  const steps = Number(process.env.SIM_STEPS ?? 250);
  for (const seed of seeds) {
    it(`converges after a random run (seed ${seed})`, async () => {
      await simulate(seed, steps);
    }, 30_000);
  }
});
