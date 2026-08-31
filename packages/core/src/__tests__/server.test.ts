import { describe, it, expect } from "vitest";
import { memoryStorage } from "@jam/engine/storage";
import { createSyncServer, parseChanges, parseFilter, type ServerMessage, type SyncSocket } from "../server";
import { _ } from "../db";
import { compileFilter } from "../filter";

type Listener = (...args: unknown[]) => void;

/** A server-side socket whose outbound messages are collected and whose inbound ones are injected. */
function fakeSocket() {
  const sent: ServerMessage[] = [];
  const listeners = new Map<string, Listener[]>();
  const socket: SyncSocket & { sent: ServerMessage[]; receive(message: unknown): void; close(): void } = {
    sent,
    send: (data) => sent.push(JSON.parse(data) as ServerMessage),
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener as Listener]);
      return socket;
    },
    receive: (message) => {
      for (const l of listeners.get("message") ?? []) l(JSON.stringify(message));
    },
    close: () => {
      for (const l of listeners.get("close") ?? []) l();
    },
  };
  return socket;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("compileFilter", () => {
  it("matches by scope and literal prefix and ignores wildcards", () => {
    const f = compileFilter({ scope: "p1", pattern: ["issue", _, "title"] });
    expect(f.matches(["issue", 1, "title", "A"], "p1")).toBe(true);
    expect(f.matches(["issue", 1, "title", "A"], "p2")).toBe(false);
    expect(f.matches(["issue", 1, "title", "A"])).toBe(true);
    expect(f.matches(["issue", 1, "done", true], "p1")).toBe(false);
    expect(f.matches(["issue", 1], "p1")).toBe(false);
  });

  it("gives equal filters the same id and different ones different ids", () => {
    expect(compileFilter({ scope: "a" }).id).toBe(compileFilter({ scope: "a" }).id);
    expect(compileFilter({ scope: "a" }).id).not.toBe(compileFilter({ scope: "b" }).id);
    expect(compileFilter({ pattern: ["x", _] }).id).toBe(compileFilter({ pattern: ["x", _] }).id);
    expect(compileFilter({}).id).not.toBe(compileFilter({ scope: "" }).id);
  });
});

describe("protocol parsing", () => {
  it("rejects malformed changes", () => {
    expect(() => parseChanges([{ op: "nope", terms: ["a"], scope: "" }])).toThrow();
    expect(() => parseChanges([{ op: "upsert", terms: [], scope: "" }])).toThrow();
    expect(() => parseChanges([{ op: "upsert", terms: [{}], scope: "" }])).toThrow();
    expect(() => parseChanges([{ op: "upsert", terms: ["a"], scope: 1 }])).toThrow();
    expect(parseChanges([{ op: "delete", terms: ["a", 1, true], scope: "s" }])).toEqual([{ op: "delete", terms: ["a", 1, true], scope: "s" }]);
  });

  it("parses filters with null wildcards", () => {
    expect(parseFilter({ scope: "p", pattern: ["issue", null] })).toEqual({ scope: "p", pattern: ["issue", _] });
    expect(() => parseFilter({ scope: 1 })).toThrow();
  });
});

describe("createSyncServer", () => {
  it("applies changes, numbers transactions and reports only effective changes", async () => {
    const storage = memoryStorage();
    const server = await createSyncServer({ storage });
    expect(await server.apply([{ op: "upsert", terms: ["todo", 1, "title", "A"], scope: "" }])).toBe(1);
    expect(await server.apply([{ op: "upsert", terms: ["todo", 1, "title", "A"], scope: "" }])).toBe(1);
    expect(await server.apply([{ op: "replace", terms: ["todo", 1, "title", "B"], scope: "" }])).toBe(2);
    expect(server.facts()).toEqual([{ terms: ["todo", 1, "title", "B"], scope: "" }]);
    expect(await storage.load()).toEqual([{ terms: ["todo", 1, "title", "B"], scope: "" }]);
    expect((await storage.readLog(0)).map((e) => [e.seq, e.op, e.terms[3]])).toEqual([
      [1, "upsert", "A"],
      [2, "delete", "A"],
      [2, "upsert", "B"],
    ]);
  });

  it("restores facts and the seq from storage", async () => {
    const storage = memoryStorage();
    const first = await createSyncServer({ storage });
    await first.apply([{ op: "upsert", terms: ["a", 1], scope: "s" }]);
    await first.apply([{ op: "upsert", terms: ["b", 2], scope: "" }]);
    const second = await createSyncServer({ storage });
    expect(second.seq).toBe(2);
    expect(second.facts().map((f) => f.terms[0]).sort()).toEqual(["a", "b"]);
  });

  it("trims the log to the retention window", async () => {
    const storage = memoryStorage();
    const server = await createSyncServer({ storage, logRetention: 3 });
    for (let i = 1; i <= 6; i++) await server.apply([{ op: "upsert", terms: ["n", i], scope: "" }]);
    expect((await storage.readLog(0)).map((e) => e.seq)).toEqual([4, 5, 6]);
  });

  it("answers subscribe with a filtered snapshot and streams matching changes", async () => {
    const server = await createSyncServer({ storage: memoryStorage() });
    await server.apply([
      { op: "upsert", terms: ["issue", 1, "title", "A"], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "title", "B"], scope: "p2" },
      { op: "upsert", terms: ["project", "p1", "name", "One"], scope: "" },
    ]);
    const socket = fakeSocket();
    server.handle(socket);
    expect(socket.sent[0]).toEqual({ type: "hello", seq: 1 });
    socket.receive({ type: "subscribe", id: "s1", filter: { scope: "p1" } });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "snapshot", id: "s1", seq: 1, facts: [[["issue", 1, "title", "A"], "p1"]] });

    await server.apply([
      { op: "upsert", terms: ["issue", 1, "done", true], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "done", true], scope: "p2" },
    ]);
    expect(socket.sent[2]).toEqual({ type: "changes", seq: 2, changes: [{ op: "upsert", terms: ["issue", 1, "done", true], scope: "p1" }] });

    await server.apply([{ op: "upsert", terms: ["issue", 3, "title", "C"], scope: "p3" }]);
    expect(socket.sent[3]).toEqual({ type: "changes", seq: 3, changes: [] });
    socket.close();
    expect(server.connections).toBe(0);
  });

  it("replays the log since a known seq and snapshots when it is too old", async () => {
    const storage = memoryStorage();
    const server = await createSyncServer({ storage, logRetention: 2 });
    for (let i = 1; i <= 4; i++) await server.apply([{ op: "upsert", terms: ["n", i], scope: "" }]);
    const socket = fakeSocket();
    server.handle(socket);
    socket.receive({ type: "subscribe", id: "a", filter: {}, since: 3 });
    socket.receive({ type: "subscribe", id: "b", filter: {}, since: 1 });
    socket.receive({ type: "subscribe", id: "c", filter: {}, since: 4 });
    socket.receive({ type: "subscribe", id: "d", filter: {}, since: 99 });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "replay", id: "a", seq: 4, changes: [{ op: "upsert", terms: ["n", 4], scope: "" }] });
    expect(socket.sent[2].type).toBe("snapshot");
    expect(socket.sent[3]).toEqual({ type: "replay", id: "c", seq: 4, changes: [] });
    expect(socket.sent[4].type).toBe("snapshot");
  });

  it("acks pushes after broadcasting them and rejects disallowed scopes", async () => {
    const server = await createSyncServer({
      storage: memoryStorage(),
      allow: (scope, context) => scope === "" || scope === `user:${String(context)}`,
    });
    const writer = fakeSocket();
    const reader = fakeSocket();
    server.handle(writer, "alice");
    server.handle(reader);
    reader.receive({ type: "subscribe", id: "all", filter: {} });
    writer.receive({ type: "subscribe", id: "all", filter: {} });
    await tick();
    writer.sent.length = 0;
    reader.sent.length = 0;

    writer.receive({ type: "push", id: 1, changes: [{ op: "upsert", terms: ["note", 1, "text", "hi"], scope: "user:alice" }] });
    await tick();
    expect(writer.sent.map((m) => m.type)).toEqual(["changes", "ack"]);
    expect(writer.sent[1]).toEqual({ type: "ack", id: 1, seq: 1 });
    expect(reader.sent).toEqual([{ type: "changes", seq: 1, changes: [{ op: "upsert", terms: ["note", 1, "text", "hi"], scope: "user:alice" }] }]);

    writer.receive({ type: "push", id: 2, changes: [{ op: "upsert", terms: ["note", 2, "text", "no"], scope: "user:bob" }] });
    await tick();
    expect(writer.sent[2].type).toBe("reject");
    expect(server.facts()).toHaveLength(1);

    writer.receive({ type: "push", id: 3, changes: [{ op: "upsert", terms: ["note", 1, "text", "hi"], scope: "user:alice" }] });
    await tick();
    expect(writer.sent[3]).toEqual({ type: "ack", id: 3, seq: 1 });
  });
});
