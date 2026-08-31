// Benchmarks for sync(): how fast facts move between the server and a client.
//
// Run: corepack pnpm bench sync
// The server is an in-process createSyncServer over memory storage and the
// socket is the fake network from the tests, so what is measured is jam's own
// work: mirroring changes into storage and facts, the outbox, the ack path.
//   - Initial load of a subscription into an empty client (server and standalone)
//   - One remote change arriving into an already-loaded subscription
//   - Local writes round-tripping to the server and back
//
// Vitest's bench mode runs no suite hooks, so fixtures are built by each
// task's `setup` (once, ahead of the warmup) and torn down after its run.

import { bench, describe, type BenchOptions } from "vitest";
import { memoryStorage, type FactStorage } from "@jam/engine/storage";
import { db, $ } from "../db";
import { remember, scoped, transaction } from "../primitives";
import { sync, type SyncHandle, type SyncOptions } from "../sync";
import { createSyncServer, type SyncChange, type SyncServer } from "../server";
import { fakeNetwork, type FakeNetwork } from "../__tests__/helpers/fake-socket";

const P1 = "project:p1";
const SIZES = [1_000, 10_000];

async function waitFor(predicate: () => boolean, what: string, timeout = 60_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

const pending = () => db.query(["sync", "pending", $.n]).map((b) => b.n)[0];

function issueFacts(n: number, scope = P1): SyncChange[] {
  const attrs = ["title", "status", "priority", "kanbanorder"];
  return Array.from({ length: n }, (_x, i) => ({
    op: "upsert",
    terms: ["issue", `issue-${Math.floor(i / attrs.length)}`, attrs[i % attrs.length], `value ${i}`],
    scope,
  }));
}

interface Rig {
  server: SyncServer;
  net: FakeNetwork;
  storage: FactStorage;
  start(options?: Partial<SyncOptions>): Promise<SyncHandle>;
  close(): Promise<void>;
}

async function createRig(): Promise<Rig> {
  const server = await createSyncServer({ storage: memoryStorage() });
  const net = fakeNetwork((socket) => server.handle(socket));
  const storage = memoryStorage();
  return {
    server,
    net,
    storage,
    start: (options = {}) => sync({ url: "ws://bench", storage, socket: net.connect, retryDelay: 10, ...options }),
    close: () => server.close(),
  };
}

/** Each iteration is a full round trip through the server, so a handful of samples is the budget. */
const RUN: BenchOptions = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0, throws: true };

/** A lazily built fixture handed to one bench: `get()` inside the task, torn down after the measured run. */
function fixture<T>(create: () => Promise<T>, destroy: (value: T) => Promise<void>, options: BenchOptions = {}) {
  let value: Promise<T> | undefined;
  const get = () => (value ??= create());
  const bench: BenchOptions = {
    ...RUN,
    ...options,
    setup: () => get().then(() => {}),
    teardown: async (_task, mode) => {
      if (mode !== "run" || !value) return;
      const built = await value;
      value = undefined;
      db.clear();
      await destroy(built);
    },
  };
  return { get, bench };
}

describe("sync — initial load into an empty client", () => {
  for (const n of SIZES) {
    describe(`${n} facts`, () => {
      const server = fixture(
        async () => {
          const rig = await createRig();
          await rig.server.apply(issueFacts(n));
          return rig;
        },
        (rig) => rig.close(),
      );
      bench(
        "server: subscribe until every fact is in memory",
        async () => {
          const rig = await server.get();
          const s = await rig.start({ storage: memoryStorage() });
          const sub = s.subscribe({ scope: P1 });
          await sub.ready;
          await waitFor(() => db.facts.size >= n, `${n} facts`);
          await sub.dispose();
          await s.dispose();
          db.clear();
        },
        server.bench,
      );

      const standalone = fixture(
        async () => {
          const storage = memoryStorage();
          await storage.write({ upserts: issueFacts(n).map(({ terms, scope }) => ({ terms, scope })), deletes: [] });
          return storage;
        },
        async () => {},
      );
      bench(
        "standalone: subscribe until every fact is in memory",
        async () => {
          const s = await sync({ storage: await standalone.get() });
          const sub = s.subscribe({ scope: P1 });
          await sub.ready;
          await waitFor(() => db.facts.size >= n, `${n} facts`);
          await sub.dispose();
          await s.dispose();
          db.clear();
        },
        standalone.bench,
      );
    });
  }
});

describe("sync — one remote change into a live subscription", () => {
  for (const n of SIZES) {
    describe(`${n} facts already loaded`, () => {
      let next = 0;
      const loaded = fixture(
        async () => {
          const rig = await createRig();
          await rig.server.apply(issueFacts(n));
          const handle = await rig.start();
          await handle.subscribe({ scope: P1 }).ready;
          await waitFor(() => db.facts.size >= n, `${n} facts`);
          return { rig, handle };
        },
        async ({ rig, handle }) => {
          await handle.dispose();
          await rig.close();
        },
        { iterations: 10 },
      );
      bench(
        "upsert on the server → fact in memory",
        async () => {
          const { rig } = await loaded.get();
          const id = ++next;
          await rig.server.apply([{ op: "upsert", terms: ["remote", id, "arrived", true], scope: P1 }]);
          await waitFor(() => db.has("remote", id, "arrived", true), "remote fact");
        },
        loaded.bench,
      );
    });
  }
});

describe("sync — local writes round-tripping through the server", () => {
  let next = 0;
  const live = (options: BenchOptions = {}) =>
    fixture(
      async () => {
        const rig = await createRig();
        const handle = await rig.start();
        await handle.subscribe({ scope: P1 }).ready;
        const acked = async () => {
          await handle.flush();
          await waitFor(() => pending() === 0, "outbox to drain");
        };
        return { rig, handle, acked };
      },
      async ({ rig, handle }) => {
        await handle.dispose();
        await rig.close();
      },
      options,
    );

  const single = live({ iterations: 10 });
  bench(
    "1 remember → outbox → server → acknowledged",
    async () => {
      const { acked } = await single.get();
      scoped(P1, () => remember("local", ++next, "title", "One"));
      await acked();
    },
    single.bench,
  );

  const burst = live();
  bench(
    "1000 remembers in one transaction → acknowledged",
    async () => {
      const { acked } = await burst.get();
      const base = ++next * 10_000;
      transaction(() => {
        scoped(P1, () => {
          for (let i = 0; i < 1000; i++) remember("burst", base + i, "title", `Item ${i}`);
        });
      });
      await acked();
    },
    burst.bench,
  );

  const echoed = live();
  bench(
    "1000 remembers → acknowledged → outbox retired",
    async () => {
      const { rig, acked } = await echoed.get();
      const base = ++next * 10_000;
      transaction(() => {
        scoped(P1, () => {
          for (let i = 0; i < 1000; i++) remember("echo", base + i, "title", `Item ${i}`);
        });
      });
      await acked();
      await waitFor(() => rig.server.facts().some((f) => f.terms[0] === "echo" && f.terms[1] === base + 999), "server to hold the burst");
      const start = Date.now();
      while ((await rig.storage.readLog(0)).length > 0) {
        if (Date.now() - start > 60_000) throw new Error("timed out waiting for the outbox to retire");
        await new Promise((r) => setTimeout(r, 5));
      }
    },
    echoed.bench,
  );
});
