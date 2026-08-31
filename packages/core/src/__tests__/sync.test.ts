import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { memoryStorage, type FactStorage } from "@jam/engine/storage";
import { db, FactDB, _ } from "../db";
import { claim, forget, remember, replace, scoped, whenever, $ } from "../primitives";
import { sync, compileFilter, type SyncHandle, type SyncOptions, type SyncWebSocket } from "../sync";
import { createSyncServer, type ClientMessage, type ServerMessage, type SyncServer } from "../server";
import { fakeNetwork, type FakeNetwork } from "./helpers/fake-socket";
import { fakeTabs } from "./helpers/fake-tabs";

let storage: FactStorage;
let handles: SyncHandle[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, what: string, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(2);
  }
}

function facts(first: string): unknown[][] {
  return Array.from(db.facts.values())
    .filter((f) => f[0] === first)
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
}

function statusFact(kind: string): unknown {
  return Array.from(db.facts.values()).find((f) => f[0] === "sync" && f[1] === kind)?.[2];
}

async function stored(): Promise<Array<{ terms: unknown[]; scope: string }>> {
  return (await storage.load()).sort((a, b) => (JSON.stringify(a.terms) < JSON.stringify(b.terms) ? -1 : 1));
}

beforeEach(() => {
  storage = memoryStorage();
  handles = [];
  db.clear();
});

afterEach(async () => {
  for (const handle of handles) await handle.dispose();
});

describe("sync (standalone)", () => {
  async function start() {
    const handle = await sync({ storage });
    handles.push(handle);
    return handle;
  }

  it("loads only the facts a subscription covers and unloads them on dispose", async () => {
    await storage.write({
      upserts: [
        { terms: ["issue", 1, "title", "A"], scope: "p1" },
        { terms: ["issue", 2, "title", "B"], scope: "p2" },
        { terms: ["project", "p1", "name", "One"], scope: "" },
      ],
      deletes: [],
    });
    const s = await start();
    const global = s.subscribe({ scope: "" });
    await global.ready;
    expect(facts("project")).toEqual([["project", "p1", "name", "One"]]);
    expect(facts("issue")).toEqual([]);

    const p1 = s.subscribe({ scope: "p1" });
    await p1.ready;
    expect(facts("issue")).toEqual([["issue", 1, "title", "A"]]);
    expect(db.scopeOf("issue", 1, "title", "A")).toBe("p1");
    expect(statusFact("status")).toBe("standalone");

    await p1.dispose();
    expect(facts("issue")).toEqual([]);
    expect(facts("project")).toHaveLength(1);
    expect(await stored()).toHaveLength(3);
  });

  it("stores durable local writes with their scope and skips excluded or derived facts", async () => {
    const s = await start();
    await s.subscribe().ready;
    scoped("p1", () => remember("issue", 1, "title", "A"));
    remember("project", "p1", "name", "One");
    remember("dom", "x", "tag", "div");
    const stop = whenever([["issue", $.id, "title", $.t]], (matches) => {
      for (const { id } of matches) claim("issue", id, "derived", true);
    });
    expect(db.has("issue", 1, "derived", true)).toBe(true);
    await s.flush();
    expect(await stored()).toEqual([
      { terms: ["issue", 1, "title", "A"], scope: "p1" },
      { terms: ["project", "p1", "name", "One"], scope: "" },
    ]);

    replace("issue", 1, "title", "B");
    forget("project", "p1", "name", "One");
    await s.flush();
    expect(await stored()).toEqual([{ terms: ["issue", 1, "title", "B"], scope: "p1" }]);
    stop();
  });

  it("restores stored facts into a fresh session", async () => {
    const first = await start();
    await first.subscribe({ scope: "p1" }).ready;
    scoped("p1", () => remember("issue", 1, "title", "A"));
    await first.dispose();
    handles.length = 0;
    db.clear();

    const second = await start();
    expect(facts("issue")).toEqual([]);
    await second.subscribe({ pattern: ["issue", _] }).ready;
    expect(facts("issue")).toEqual([["issue", 1, "title", "A"]]);
    expect(db.scopeOf("issue", 1, "title", "A")).toBe("p1");
  });
});

describe("sync (server)", () => {
  let server: SyncServer;
  let net: FakeNetwork;
  let received: ServerMessage[];

  beforeEach(async () => {
    server = await createSyncServer({
      storage: memoryStorage(),
      allow: ({ scope }) => scope !== "forbidden",
    });
    net = fakeNetwork((socket) => server.handle(socket));
    received = [];
  });

  /** Client socket factory that also records every server message for assertions. */
  const socket = (url: string): SyncWebSocket => {
    const s = net.connect(url);
    return new Proxy(s, {
      set(target, prop, value) {
        if (prop === "onmessage" && typeof value === "function") {
          target.onmessage = (event) => {
            received.push(JSON.parse(String(event.data)) as ServerMessage);
            value(event);
          };
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });
  };

  async function start(options: Partial<SyncOptions> = {}) {
    const handle = await sync({ url: "ws://test", storage, socket, retryDelay: 5, ...options });
    handles.push(handle);
    return handle;
  }

  /** Let every in-flight message, storage write and reconnect timer run. */
  async function settle() {
    for (let i = 0; i < 3; i++) {
      await net.idle();
      await sleep(10);
    }
    await net.idle();
  }

  it("mirrors a snapshot of the subscribed slice and streams matching changes", async () => {
    await server.apply([
      { op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "title", "B"], scope: "p2" },
    ]);
    const s = await start();
    expect(statusFact("status")).toBe("connecting");
    const sub = s.subscribe({ scope: "p1" });
    await sub.ready;
    expect(facts("issue")).toEqual([["issue", 1, "title", "A"]]);
    expect(db.scopeOf("issue", 1, "title", "A")).toBe("p1");
    expect(statusFact("status")).toBe("live");
    expect(db.has("sync", "shape", sub.id, "ready", true)).toBe(true);

    await server.apply([
      { op: "upsert", terms: ["issue", 1, "done", true], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "done", true], scope: "p2" },
    ]);
    await settle();
    expect(facts("issue")).toEqual([
      ["issue", 1, "done", true],
      ["issue", 1, "title", "A"],
    ]);

    await server.apply([{ op: "delete", terms: ["issue", 1, "title", "A"], scope: "p1" }]);
    await settle();
    expect(facts("issue")).toEqual([["issue", 1, "done", true]]);
    expect(await stored()).toEqual([{ terms: ["issue", 1, "done", true], scope: "p1" }]);
  });

  it("pushes local writes, retires them on ack and does not flicker on the echo", async () => {
    const s = await start();
    await s.subscribe().ready;
    const events: string[] = [];
    const off = db.observe((type, _key, fact) => {
      if (fact[0] === "todo") events.push(`${type}:${JSON.stringify(fact)}`);
    });

    scoped("p1", () => remember("todo", 1, "title", "A"));
    expect(statusFact("pending")).toBe(1);
    await s.flush();
    expect(statusFact("pending")).toBe(0);
    expect(server.facts()).toEqual([{ terms: ["todo", 1, "title", "A"], scope: "p1" }]);
    expect(await storage.readLog(0)).toEqual([]);

    replace("todo", 1, "title", "B");
    await s.flush();
    await settle();
    expect(server.facts()).toEqual([{ terms: ["todo", 1, "title", "B"], scope: "p1" }]);
    expect(facts("todo")).toEqual([["todo", 1, "title", "B"]]);
    expect(events).toEqual(['add:["todo",1,"title","A"]', 'delete:["todo",1,"title","A"]', 'add:["todo",1,"title","B"]']);
    off();
  });

  it("reports rejected pushes and recovers on the next accepted one", async () => {
    const s = await start();
    await s.subscribe().ready;
    scoped("forbidden", () => remember("secret", 1, "x", 1));
    await s.flush();
    expect(String(statusFact("error"))).toContain("forbidden");
    expect(statusFact("pending")).toBe(0);
    expect(server.facts()).toEqual([]);

    remember("public", 1, "x", 1);
    await s.flush();
    expect(statusFact("error")).toBeUndefined();
    expect(server.facts()).toEqual([{ terms: ["public", 1, "x", 1], scope: "" }]);
  });

  it("catches up with a replay after the connection drops and re-pushes offline writes", async () => {
    await server.apply([{ op: "upsert", terms: ["n", 1], scope: "" }]);
    const s = await start();
    const sub = s.subscribe();
    await sub.ready;
    expect(received.filter((m) => m.type === "snapshot")).toHaveLength(1);

    net.sockets[0].drop();
    expect(statusFact("status")).toBe("offline");
    expect(s.connected).toBe(false);

    await server.apply([{ op: "upsert", terms: ["n", 2], scope: "" }]);
    remember("n", 3);
    expect(statusFact("pending")).toBe(1);
    expect(s.connected).toBe(false);

    await settle();
    expect(s.connected).toBe(true);
    expect(statusFact("status")).toBe("live");
    expect(received.filter((m) => m.type === "snapshot")).toHaveLength(1);
    expect(received.filter((m) => m.type === "replay")).toHaveLength(1);
    expect(facts("n")).toEqual([["n", 1], ["n", 2], ["n", 3]]);
    expect(server.facts().map((f) => f.terms)).toEqual([["n", 1], ["n", 2], ["n", 3]]);
    expect(statusFact("pending")).toBe(0);
  });

  it("resumes a fresh session from the mirror with a replay since the last seen seq", async () => {
    await server.apply([{ op: "upsert", terms: ["n", 1], scope: "" }]);
    const first = await start();
    await first.subscribe().ready;
    await first.dispose();
    handles.length = 0;
    db.clear();

    await server.apply([{ op: "delete", terms: ["n", 1], scope: "" }]);
    await server.apply([{ op: "upsert", terms: ["n", 2], scope: "" }]);

    received = [];
    const second = await start();
    const sub = second.subscribe();
    expect(facts("n")).toEqual([["n", 1]]);
    await sub.ready;
    expect(received.map((m) => m.type)).toEqual(["hello", "replay"]);
    expect(facts("n")).toEqual([["n", 2]]);
    await second.flush();
    expect(await stored()).toEqual([{ terms: ["n", 2], scope: "" }]);
  });

  it("falls back to a snapshot when the server log no longer reaches the last seen seq", async () => {
    server = await createSyncServer({ storage: memoryStorage(), logRetention: 1 });
    net = fakeNetwork((socket) => server.handle(socket));
    await server.apply([{ op: "upsert", terms: ["n", 1], scope: "" }]);
    const first = await start();
    await first.subscribe().ready;
    await first.dispose();
    handles.length = 0;
    db.clear();

    for (let i = 2; i <= 5; i++) await server.apply([{ op: "upsert", terms: ["n", i], scope: "" }]);
    await server.apply([{ op: "delete", terms: ["n", 1], scope: "" }]);

    received = [];
    const second = await start();
    await second.subscribe().ready;
    expect(received.map((m) => m.type)).toEqual(["hello", "snapshot"]);
    expect(facts("n")).toEqual([["n", 2], ["n", 3], ["n", 4], ["n", 5]]);
  });

  it("settles a denied subscription as ready with an error fact and loads nothing for it", async () => {
    server = await createSyncServer({ storage: memoryStorage(), allowRead: (filter) => filter.scope !== "private" });
    await server.apply([
      { op: "upsert", terms: ["secret", 1], scope: "private" },
      { op: "upsert", terms: ["note", 1], scope: "" },
    ]);
    const s = await start();
    const denied = s.subscribe({ scope: "private" });
    const allowed = s.subscribe({ scope: "" });
    await Promise.all([denied.ready, allowed.ready]);
    expect(facts("secret")).toEqual([]);
    expect(facts("note")).toEqual([["note", 1]]);
    expect(db.has("sync", "shape", denied.id, "ready", true)).toBe(true);
    expect(db.query(["sync", "shape", denied.id, "error", $.e]).map((b) => String(b.e))).toEqual([expect.stringContaining("private")]);
    expect(db.query(["sync", "shape", allowed.id, "error", $.e])).toEqual([]);
    expect(statusFact("status")).toBe("live");

    await server.apply([{ op: "upsert", terms: ["secret", 2], scope: "private" }]);
    await settle();
    expect(facts("secret")).toEqual([]);
    expect(await stored()).toEqual([{ terms: ["note", 1], scope: "" }]);

    net.sockets[0].drop();
    await settle();
    expect(s.connected).toBe(true);
    expect(statusFact("status")).toBe("live");
    expect(received.filter((m) => m.type === "denied")).toHaveLength(1);

    await denied.dispose();
    expect(db.query(["sync", "shape", denied.id, $.k, $.v])).toEqual([]);
    expect(db.has("sync", "shape", allowed.id, "ready", true)).toBe(true);
  });

  it("snapshots instead of replaying when the server's log is not the one its seqs came from", async () => {
    for (let i = 1; i <= 3; i++) await server.apply([{ op: "upsert", terms: ["n", i], scope: "" }]);
    const first = await start();
    const sub = first.subscribe();
    await sub.ready;
    await first.flush();
    const { log } = received[0] as { type: "hello"; seq: number; log: string };
    expect(await storage.getMeta(`sub:${sub.id}`)).toBe(`${log}:3`);
    await first.dispose();
    handles.length = 0;
    db.clear();

    server = await createSyncServer({ storage: memoryStorage() });
    for (let i = 10; i < 15; i++) await server.apply([{ op: "upsert", terms: ["m", i], scope: "" }]);
    expect(server.seq).toBeGreaterThan(3);
    received = [];
    const second = await start();
    await second.subscribe().ready;
    expect(received.map((m) => m.type)).toEqual(["hello", "snapshot"]);
    expect((received[0] as { log: string }).log).not.toBe(log);
    expect(facts("n")).toEqual([]);
    expect(facts("m")).toEqual([["m", 10], ["m", 11], ["m", 12], ["m", 13], ["m", 14]]);
    await second.flush();
    expect(await stored()).toEqual(server.facts());
    expect(await storage.getMeta(`sub:${sub.id}`)).toBe(`${(received[0] as { log: string }).log}:5`);
  });

  it("treats a bare seq recorded before log ids as belonging to no log", async () => {
    for (let i = 1; i <= 3; i++) await server.apply([{ op: "upsert", terms: ["n", i], scope: "" }]);
    await storage.write({ meta: { [`sub:${compileFilter({}).id}`]: "2" } });
    const s = await start();
    await s.subscribe().ready;
    expect(received.map((m) => m.type)).toEqual(["hello", "snapshot"]);
    expect(facts("n")).toEqual([["n", 1], ["n", 2], ["n", 3]]);
  });

  it("converges with a concurrent replace from another writer", async () => {
    await server.apply([{ op: "upsert", terms: ["todo", 1, "title", "A"], scope: "" }]);
    const s = await start();
    await s.subscribe().ready;

    replace("todo", 1, "title", "B");
    await server.apply([{ op: "replace", terms: ["todo", 1, "title", "C"], scope: "" }]);
    await s.flush();
    await settle();
    expect(facts("todo")).toEqual([["todo", 1, "title", "B"]]);
    expect(server.facts().map((f) => f.terms)).toEqual([["todo", 1, "title", "B"]]);

    await server.apply([{ op: "replace", terms: ["todo", 1, "title", "D"], scope: "" }]);
    await settle();
    expect(facts("todo")).toEqual([["todo", 1, "title", "D"]]);
  });

  it("moves a fact between scopes when the server reports a new scope", async () => {
    await server.apply([{ op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p1" }]);
    const s = await start();
    await s.subscribe({ scope: "p1" }).ready;
    await s.subscribe({ scope: "p2" }).ready;
    expect(db.scopeOf("issue", 1, "title", "A")).toBe("p1");

    await server.apply([{ op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p2" }]);
    await settle();
    expect(db.scopeOf("issue", 1, "title", "A")).toBe("p2");
    expect(await stored()).toEqual([{ terms: ["issue", 1, "title", "A"], scope: "p2" }]);
    expect(server.facts()).toEqual([{ terms: ["issue", 1, "title", "A"], scope: "p2" }]);
  });

  it("drops a fact that moves out of the only subscribed scope", async () => {
    await server.apply([{ op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p1" }]);
    const s = await start();
    await s.subscribe({ scope: "p1" }).ready;
    await server.apply([{ op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p2" }]);
    await settle();
    expect(facts("issue")).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it("refcounts identical subscriptions and unsubscribes on the last dispose", async () => {
    await server.apply([{ op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p1" }]);
    const s = await start();
    const a = s.subscribe({ scope: "p1" });
    const b = s.subscribe({ scope: "p1" });
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(compileFilter({ scope: "p1" }).id);
    await Promise.all([a.ready, b.ready]);
    await a.dispose();
    expect(facts("issue")).toHaveLength(1);
    await b.dispose();
    expect(facts("issue")).toHaveLength(0);
    expect(db.has("sync", "shape", a.id, "ready", true)).toBe(false);

    await server.apply([{ op: "upsert", terms: ["issue", 2, "title", "B"], scope: "p1" }]);
    await settle();
    expect(facts("issue")).toHaveLength(0);
  });

  it("follow() subscribes whatever the matching facts ask for and overlaps each switch", async () => {
    await server.apply([
      { op: "upsert", terms: ["issue", 1, "title", "One"], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "title", "Two"], scope: "p2" },
      { op: "upsert", terms: ["project", "p1", "name", "P1"], scope: "" },
    ]);
    const s = await start({ exclude: (fact) => fact[0] === "route" });
    const events: string[] = [];
    const stopTrace = db.observe((type, _key, fact) => {
      if (fact[0] === "issue") events.push(`${type} ${fact[1]}`);
    });
    const stop = s.follow([["route", "project", $.p]], ([route]) => [{ scope: "" }, ...(route ? [{ scope: String(route.p) }] : [])]);
    await waitFor(() => db.has("project", "p1", "name", "P1"), "global facts");
    await settle();
    expect(db.has("issue", 1, "title", "One")).toBe(false);

    remember("route", "project", "p1");
    await waitFor(() => db.has("issue", 1, "title", "One"), "p1 facts");

    replace("route", "project", "p2");
    await waitFor(() => db.has("issue", 2, "title", "Two") && !db.has("issue", 1, "title", "One"), "switch to p2");
    expect(events).toEqual(["add 1", "add 2", "delete 1"]);
    expect(db.query(["sync", "shape", $.id, "ready", $.r])).toHaveLength(2);

    await stop();
    stopTrace();
    expect(db.has("project", "p1", "name", "P1")).toBe(false);
    expect(db.has("issue", 2, "title", "Two")).toBe(false);
    expect(db.query(["sync", "shape", $.id, "ready", $.r])).toEqual([]);
    expect(db.query(["route", "project", $.p]).map((b) => b.p)).toEqual(["p2"]);
  });

  it("follow() settles on the last of a burst of changes", async () => {
    await server.apply([
      { op: "upsert", terms: ["issue", 1, "title", "One"], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "title", "Two"], scope: "p2" },
      { op: "upsert", terms: ["issue", 3, "title", "Three"], scope: "p3" },
    ]);
    const s = await start({ exclude: (fact) => fact[0] === "route" });
    remember("route", "project", "p1");
    const stop = s.follow([["route", "project", $.p]], ([route]) => (route ? [{ scope: String(route.p) }] : []));
    await waitFor(() => db.has("issue", 1, "title", "One"), "p1 facts");

    replace("route", "project", "p2");
    replace("route", "project", "p3");
    await waitFor(
      () => db.has("issue", 3, "title", "Three") && !db.has("issue", 1, "title", "One") && !db.has("issue", 2, "title", "Two"),
      "p3 only",
    );
    await settle();
    expect(db.query(["sync", "shape", $.id, "ready", $.r]).map((b) => b.id)).toEqual([compileFilter({ scope: "p3" }).id]);

    forget("route", "project", "p3");
    await waitFor(() => !db.has("issue", 3, "title", "Three"), "nothing followed");
    await stop();
  });
});

describe("sync (tabs)", () => {
  let server: SyncServer;
  let net: FakeNetwork;
  let hub: ReturnType<typeof fakeTabs>;
  let pushes: ClientMessage[];

  interface Tab {
    s: SyncHandle;
    db: FactDB;
    facts(first: string): unknown[][];
    status(kind: string): unknown;
  }

  beforeEach(async () => {
    server = await createSyncServer({ storage: memoryStorage() });
    pushes = [];
    net = fakeNetwork((socket) => {
      socket.on("message", (data) => {
        const message = JSON.parse(String(data)) as ClientMessage;
        if (message.type === "push") pushes.push(message);
      });
      server.handle(socket);
    });
    hub = fakeTabs();
  });

  /** A tab with its own FactDB sharing the test's storage; `url` is omitted for a standalone tab. */
  async function openTab(url: string | null = "ws://test"): Promise<Tab> {
    const tabDb = new FactDB();
    const s = await sync({ url: url ?? undefined, storage, socket: net.connect, retryDelay: 5, tabs: hub.join(), db: tabDb });
    handles.push(s);
    return {
      s,
      db: tabDb,
      facts: (first) =>
        Array.from(tabDb.facts.values())
          .filter((f) => f[0] === first)
          .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
      status: (kind) => Array.from(tabDb.facts.values()).find((f) => f[0] === "sync" && f[1] === kind)?.[2],
    };
  }

  /** Let every tab message, network message, storage write and reconnect timer run. */
  async function settle() {
    for (let i = 0; i < 4; i++) {
      await hub.idle();
      await net.idle();
      await sleep(10);
    }
    await hub.idle();
    await net.idle();
  }

  it("elects one leader that holds the only connection and subscribes on behalf of the others", async () => {
    await server.apply([
      { op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "title", "B"], scope: "p2" },
    ]);
    const a = await openTab();
    const b = await openTab();
    await settle();
    expect(a.s.leading).toBe(true);
    expect(b.s.leading).toBe(false);
    expect(net.sockets).toHaveLength(1);
    expect(b.status("status")).toBe("live");

    const sub = b.s.subscribe({ scope: "p1" });
    await sub.ready;
    expect(b.facts("issue")).toEqual([["issue", 1, "title", "A"]]);
    expect(b.db.scopeOf("issue", 1, "title", "A")).toBe("p1");
    expect(a.facts("issue")).toEqual([]);
    expect(server.connections).toBe(1);

    await server.apply([{ op: "upsert", terms: ["issue", 1, "done", true], scope: "p1" }]);
    await settle();
    expect(b.facts("issue")).toEqual([
      ["issue", 1, "done", true],
      ["issue", 1, "title", "A"],
    ]);
    expect(a.facts("issue")).toEqual([]);
    expect(await stored()).toHaveLength(2);

    const own = a.s.subscribe({ scope: "p1" });
    await own.ready;
    expect(a.facts("issue")).toEqual(b.facts("issue"));
    expect(a.status("status")).toBe("live");

    await sub.dispose();
    expect(b.facts("issue")).toEqual([]);
    await server.apply([{ op: "upsert", terms: ["issue", 3, "title", "C"], scope: "p1" }]);
    await settle();
    expect(a.facts("issue")).toHaveLength(3);
    await own.dispose();
    await server.apply([{ op: "upsert", terms: ["issue", 4, "title", "D"], scope: "p1" }]);
    await settle();
    expect((await stored()).map((f) => f.terms[1])).not.toContain(4);
  });

  it("shows a follower's write in every tab and pushes it once through the leader", async () => {
    const a = await openTab();
    const b = await openTab();
    await Promise.all([a.s.subscribe().ready, b.s.subscribe().ready]);
    expect(b.s.leading).toBe(false);

    b.db.insert("todo", 1, "title", "A");
    expect(b.status("pending")).toBe(1);
    await settle();
    expect(a.facts("todo")).toEqual([["todo", 1, "title", "A"]]);
    expect(server.facts()).toEqual([{ terms: ["todo", 1, "title", "A"], scope: "" }]);
    expect(pushes).toHaveLength(1);
    expect(a.status("pending")).toBe(0);
    expect(b.status("pending")).toBe(0);
    expect(await storage.readLog(0)).toEqual([]);

    a.db.insert("todo", 2, "title", "B");
    await a.s.flush();
    await settle();
    expect(b.facts("todo")).toEqual([
      ["todo", 1, "title", "A"],
      ["todo", 2, "title", "B"],
    ]);
    expect(pushes).toHaveLength(2);

    b.db.drop("todo", 1, "title", "A");
    await b.s.flush();
    expect(server.facts().map((f) => f.terms)).toEqual([["todo", 2, "title", "B"]]);
    await settle();
    expect(a.facts("todo")).toEqual([["todo", 2, "title", "B"]]);
  });

  it("hands the connection to another tab when the leader closes", async () => {
    await server.apply([{ op: "upsert", terms: ["n", 1], scope: "" }]);
    const a = await openTab();
    const b = await openTab();
    await b.s.subscribe().ready;
    expect(b.facts("n")).toEqual([["n", 1]]);

    await a.s.dispose();
    handles.splice(handles.indexOf(a.s), 1);
    b.db.insert("n", 2);
    await settle();
    expect(b.s.leading).toBe(true);
    expect(b.status("status")).toBe("live");
    expect(net.sockets).toHaveLength(2);
    expect(server.connections).toBe(1);
    expect(server.facts().map((f) => f.terms)).toEqual([["n", 1], ["n", 2]]);
    expect(b.status("pending")).toBe(0);

    await server.apply([{ op: "upsert", terms: ["n", 3], scope: "" }]);
    await settle();
    expect(b.facts("n")).toEqual([["n", 1], ["n", 2], ["n", 3]]);

    const c = await openTab();
    await c.s.subscribe().ready;
    expect(c.s.leading).toBe(false);
    expect(c.facts("n")).toEqual(b.facts("n"));
  });

  it("reports the leader's connection state to followers and keeps their offline writes for the reconnect", async () => {
    const a = await openTab();
    const b = await openTab();
    await Promise.all([a.s.subscribe().ready, b.s.subscribe().ready]);

    net.sockets[0].drop();
    await hub.idle();
    expect(a.status("status")).toBe("offline");
    expect(b.status("status")).toBe("offline");
    expect(b.s.connected).toBe(false);

    b.db.insert("n", 1);
    a.db.insert("n", 2);
    await settle();
    expect(a.status("status")).toBe("live");
    expect(b.status("status")).toBe("live");
    expect(server.facts().map((f) => f.terms)).toEqual([["n", 1], ["n", 2]]);
    expect(a.facts("n")).toEqual([["n", 1], ["n", 2]]);
    expect(b.facts("n")).toEqual([["n", 1], ["n", 2]]);
    expect(pushes.length).toBeLessThanOrEqual(2);
  });

  it("settles a follower's denied subscription through the leader", async () => {
    server = await createSyncServer({ storage: memoryStorage(), allowRead: (filter) => filter.scope !== "private" });
    await server.apply([{ op: "upsert", terms: ["secret", 1], scope: "private" }]);
    const a = await openTab();
    const b = await openTab();
    await settle();
    expect(b.s.leading).toBe(false);

    const sub = b.s.subscribe({ scope: "private" });
    await sub.ready;
    expect(b.facts("secret")).toEqual([]);
    expect(b.db.has("sync", "shape", sub.id, "ready", true)).toBe(true);
    expect(b.db.query(["sync", "shape", sub.id, "error", $.e])).toHaveLength(1);
    expect(b.status("status")).toBe("live");
    expect(a.status("status")).toBe("live");

    await server.apply([{ op: "upsert", terms: ["secret", 2], scope: "private" }]);
    await settle();
    expect(b.facts("secret")).toEqual([]);
    expect(await stored()).toEqual([]);
    await sub.dispose();
    expect(b.db.query(["sync", "shape", sub.id, $.k, $.v])).toEqual([]);
  });

  it("clears a denial when the subscription is asked for again and allowed", async () => {
    let open = false;
    server = await createSyncServer({ storage: memoryStorage(), allowRead: (filter) => open || filter.scope !== "private" });
    await server.apply([{ op: "upsert", terms: ["secret", 1], scope: "private" }]);
    const a = await openTab();
    const b = await openTab();
    await settle();
    const sub = b.s.subscribe({ scope: "private" });
    await sub.ready;
    expect(b.db.query(["sync", "shape", sub.id, "error", $.e])).toHaveLength(1);

    open = true;
    await a.s.dispose();
    handles.splice(handles.indexOf(a.s), 1);
    await settle();
    expect(b.s.leading).toBe(true);
    expect(b.facts("secret")).toEqual([["secret", 1]]);
    expect(b.db.query(["sync", "shape", sub.id, "error", $.e])).toEqual([]);
    expect(b.db.has("sync", "shape", sub.id, "ready", true)).toBe(true);
    expect(b.status("status")).toBe("live");
  });

  it("shares standalone writes between tabs without any connection", async () => {
    const a = await openTab(null);
    const b = await openTab(null);
    await Promise.all([a.s.subscribe({ scope: "p1" }).ready, b.s.subscribe({ scope: "p1" }).ready]);
    expect(a.status("status")).toBe("standalone");
    expect(a.s.leading).toBe(false);

    a.db.withScope("p1", () => a.db.insert("issue", 1, "title", "A"));
    b.db.withScope("p2", () => b.db.insert("issue", 2, "title", "B"));
    await settle();
    expect(b.facts("issue")).toEqual([
      ["issue", 1, "title", "A"],
      ["issue", 2, "title", "B"],
    ]);
    expect(b.db.scopeOf("issue", 1, "title", "A")).toBe("p1");
    expect(a.facts("issue")).toEqual([["issue", 1, "title", "A"]]);
    expect(await stored()).toHaveLength(2);
    expect(net.sockets).toHaveLength(0);

    a.db.drop("issue", 1, "title", "A");
    await settle();
    expect(b.facts("issue")).toEqual([["issue", 2, "title", "B"]]);
    expect(await stored()).toEqual([{ terms: ["issue", 2, "title", "B"], scope: "p2" }]);
  });
});
