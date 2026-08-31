import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { memoryStorage, type FactStorage } from "@jam/engine/storage";
import { db, _ } from "../db";
import { claim, forget, remember, replace, scoped, whenever, $ } from "../primitives";
import { sync, compileFilter, type SyncHandle, type SyncWebSocket } from "../sync";
import { createSyncServer, type ServerMessage, type SyncServer } from "../server";
import { fakeNetwork, type FakeNetwork } from "./helpers/fake-socket";

let storage: FactStorage;
let handles: SyncHandle[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      allow: (scope) => scope !== "forbidden",
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

  async function start() {
    const handle = await sync({ url: "ws://test", storage, socket, retryDelay: 5 });
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
});
