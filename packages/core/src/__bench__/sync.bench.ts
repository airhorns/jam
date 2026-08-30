// Benchmarks for sync(): how fast facts move between the server and a client.
//
// Run: corepack pnpm bench sync
// Electric mode runs against the in-process FakeElectric double (real
// @electric-sql/client + pglite-sync path), so what is measured is jam's own
// work: mirroring shape rows into facts, the outbox, the write endpoint.
//   - Initial load of a shape into an empty client (Electric and standalone)
//   - One remote change arriving into an already-loaded shape
//   - Local writes round-tripping to the server and back
//
// Vitest's bench mode runs no suite hooks, so fixtures are built by each
// task's `setup` (once, ahead of the warmup) and torn down after its run.

import { bench, describe, type BenchOptions } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { electricSync } from "@electric-sql/pglite-sync";
import { db, $ } from "../db";
import { remember, scoped, transaction } from "../primitives";
import { sync, type SyncHandle, type SyncOptions } from "../sync";
import { JAM_FACTS_SQL, factKey } from "../server";
import type { JamPGlite } from "../pglite";
import { FakeElectric } from "../__tests__/helpers/fake-electric";

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

function issueFacts(n: number, scope = P1): Array<{ key: string; scope: string }> {
  const attrs = ["title", "status", "priority", "kanbanorder"];
  return Array.from({ length: n }, (_x, i) => ({
    key: factKey(["issue", `issue-${Math.floor(i / attrs.length)}`, attrs[i % attrs.length], `value ${i}`]),
    scope,
  }));
}

async function insertFacts(pg: PGlite, facts: Array<{ key: string; scope: string }>) {
  for (let i = 0; i < facts.length; i += 5000) {
    await pg.query(
      `INSERT INTO jam_facts (key, scope) SELECT key, scope FROM json_to_recordset($1::text::json) AS t(key TEXT, scope TEXT)`,
      [JSON.stringify(facts.slice(i, i + 5000))],
    );
  }
}

function createClient(): Promise<JamPGlite & PGlite> {
  return PGlite.create({ dataDir: "memory://", extensions: { live, sync: electricSync() } });
}

interface Rig {
  client: JamPGlite & PGlite;
  server: PGlite;
  electric: FakeElectric;
  start(options?: Partial<SyncOptions>): Promise<SyncHandle>;
  close(): Promise<void>;
}

async function createRig(): Promise<Rig> {
  const client = await createClient();
  const server = await PGlite.create({ dataDir: "memory://" });
  await server.exec(JAM_FACTS_SQL);
  const electric = new FakeElectric(server);
  electric.pollTimeout = 50;
  return {
    client,
    server,
    electric,
    start: (options = {}) =>
      sync({ pg: client, shapeUrl: electric.shapeUrl, writeUrl: electric.writeUrl, fetch: electric.fetch, retryDelay: 10, ...options }),
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Each iteration is a full round trip through PGlite, so a handful of samples is the budget. */
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
      const electric = fixture(
        async () => {
          const rig = await createRig();
          await insertFacts(rig.server, issueFacts(n));
          return rig;
        },
        (rig) => rig.close(),
      );
      bench(
        "electric: subscribe until every fact is in memory",
        async () => {
          const rig = await electric.get();
          const s = await rig.start();
          const sub = s.subscribe({ scope: P1 });
          await sub.ready;
          await waitFor(() => db.facts.size >= n, `${n} facts`);
          await sub.dispose();
          await s.dispose();
          await s.forgetShape({ scope: P1 });
          db.clear();
        },
        electric.bench,
      );

      const standalone = fixture(
        async () => {
          const pg = await createClient();
          await pg.exec(JAM_FACTS_SQL);
          await insertFacts(pg, issueFacts(n));
          return pg;
        },
        (pg) => pg.close(),
      );
      bench(
        "standalone: subscribe until every fact is in memory",
        async () => {
          const s = await sync({ pg: await standalone.get() });
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

describe("sync — one remote change into a live shape", () => {
  for (const n of SIZES) {
    describe(`${n} facts already loaded`, () => {
      let next = 0;
      const loaded = fixture(
        async () => {
          const rig = await createRig();
          await insertFacts(rig.server, issueFacts(n));
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
          const key = factKey(["remote", ++next, "arrived", true]);
          await rig.electric.apply([{ op: "upsert", key, scope: P1 }]);
          await waitFor(() => db.facts.has(key), "remote fact");
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
        const handle = await rig.start({ echoTimeout: 100 });
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
    "1 remember → outbox → endpoint → acknowledged",
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
    "1000 remembers → acknowledged → echoed back and retired",
    async () => {
      const { rig, acked } = await echoed.get();
      const base = ++next * 10_000;
      transaction(() => {
        scoped(P1, () => {
          for (let i = 0; i < 1000; i++) remember("echo", base + i, "title", `Item ${i}`);
        });
      });
      await acked();
      const outbox = async () => (await rig.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM jam_outbox`)).rows[0].n;
      const start = Date.now();
      while ((await outbox()) > 0) {
        if (Date.now() - start > 60_000) throw new Error("timed out waiting for the outbox to retire");
        await new Promise((r) => setTimeout(r, 5));
      }
    },
    echoed.bench,
  );
});
