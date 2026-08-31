import { describe, it, expect, vi } from "vitest";
import { memoryStorage } from "@jam/engine/storage";
import { createSyncServer, parseChanges, parseFilter, sqliteStorage, type ServerMessage, type SyncCommit, type SyncSocket } from "../server";
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
    expect(await server.apply([{ op: "replace", terms: ["todo", 1, "title", "B"], scope: "" }])).toBe(3);
    expect(server.facts()).toEqual([{ terms: ["todo", 1, "title", "B"], scope: "" }]);
    expect(await storage.load()).toEqual([{ terms: ["todo", 1, "title", "B"], scope: "" }]);
    expect((await storage.readLog(0)).map((e) => [e.seq, e.op, e.terms[3]])).toEqual([
      [1, "upsert", "A"],
      [2, "delete", "A"],
      [3, "upsert", "B"],
    ]);
  });

  it("commits a replace on sqlite, where one transaction writes several log entries", async () => {
    const server = await createSyncServer({ storage: sqliteStorage(":memory:") });
    await server.apply([{ op: "upsert", terms: ["todo", 1, "title", "A"], scope: "" }]);
    expect(await server.apply([{ op: "replace", terms: ["todo", 1, "title", "B"], scope: "" }])).toBe(3);
    expect(server.facts()).toEqual([{ terms: ["todo", 1, "title", "B"], scope: "" }]);
    await server.close();
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
    expect(socket.sent[0]).toEqual({ type: "hello", seq: 3 });
    socket.receive({ type: "subscribe", id: "s1", filter: { scope: "p1" } });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "snapshot", id: "s1", seq: 3, facts: [[["issue", 1, "title", "A"], "p1"]] });

    await server.apply([
      { op: "upsert", terms: ["issue", 1, "done", true], scope: "p1" },
      { op: "upsert", terms: ["issue", 2, "done", true], scope: "p2" },
    ]);
    expect(socket.sent[2]).toEqual({ type: "changes", seq: 5, changes: [{ op: "upsert", terms: ["issue", 1, "done", true], scope: "p1" }] });

    await server.apply([{ op: "upsert", terms: ["issue", 3, "title", "C"], scope: "p3" }]);
    expect(socket.sent[3]).toEqual({ type: "changes", seq: 6, changes: [] });
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

  it("reports every committed transaction to observers with its effective changes and the pusher's context", async () => {
    const server = await createSyncServer({ storage: memoryStorage() });
    const commits: SyncCommit[] = [];
    const stop = server.observe((commit) => commits.push(commit));
    const socket = fakeSocket();
    server.handle(socket, { user: "alice" });

    socket.receive({
      type: "push",
      id: 1,
      changes: [
        { op: "upsert", terms: ["todo", 1, "title", "A"], scope: "p1" },
        { op: "upsert", terms: ["todo", 1, "title", "A"], scope: "p1" },
      ],
    });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "ack", id: 1, seq: 1 });
    expect(commits).toEqual([{ seq: 1, changes: [{ op: "upsert", terms: ["todo", 1, "title", "A"], scope: "p1" }], context: { user: "alice" } }]);

    socket.receive({ type: "push", id: 2, changes: [{ op: "upsert", terms: ["todo", 1, "title", "A"], scope: "p1" }] });
    await tick();
    expect(socket.sent[2]).toEqual({ type: "ack", id: 2, seq: 1 });
    expect(commits).toHaveLength(1);

    expect(await server.apply([{ op: "replace", terms: ["todo", 1, "title", "B"], scope: "p1" }])).toBe(3);
    expect(commits[1]).toEqual({
      seq: 3,
      changes: [
        { op: "delete", terms: ["todo", 1, "title", "A"], scope: "p1" },
        { op: "upsert", terms: ["todo", 1, "title", "B"], scope: "p1" },
      ],
      context: undefined,
    });
    expect(commits[1]).toHaveProperty("context");

    stop();
    await server.apply([{ op: "upsert", terms: ["todo", 2, "title", "C"], scope: "p1" }]);
    expect(commits).toHaveLength(2);
  });

  it("keeps committing when an observer throws", async () => {
    const server = await createSyncServer({ storage: memoryStorage() });
    const seen: number[] = [];
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args[1]));
    server.observe(() => {
      throw new Error("boom");
    });
    server.observe((commit) => seen.push(commit.seq));
    const socket = fakeSocket();
    server.handle(socket);

    socket.receive({ type: "push", id: 1, changes: [{ op: "upsert", terms: ["n", 1], scope: "" }] });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "ack", id: 1, seq: 1 });
    expect(await server.apply([{ op: "upsert", terms: ["n", 2], scope: "" }])).toBe(2);
    expect(seen).toEqual([1, 2]);
    expect(errors.map((e) => (e as Error).message)).toEqual(["boom", "boom"]);
    expect(server.facts().map((f) => f.terms)).toEqual([["n", 1], ["n", 2]]);
    spy.mockRestore();
  });
});
