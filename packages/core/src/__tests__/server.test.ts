import { describe, it, expect, vi } from "vitest";
import { memoryStorage } from "@jam/engine/storage";
import { createSyncServer, parseChanges, parseFilter, sqliteStorage, type ServerMessage, type SyncChange, type SyncSocket } from "../server";
import { _, $ } from "../db";
import { compileFilter, serializeFilter } from "../filter";

type Listener = (...args: unknown[]) => void;

/** A server-side socket whose outbound messages are collected and whose inbound ones are injected. */
function fakeSocket() {
  const sent: ServerMessage[] = [];
  const listeners = new Map<string, Listener[]>();
  const socket: SyncSocket & {
    sent: ServerMessage[];
    receive(message: unknown): void;
    receiveRaw(data: string): void;
    fail(error: unknown): void;
    close(): void;
  } = {
    sent,
    send: (data) => sent.push(JSON.parse(data) as ServerMessage),
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener as Listener]);
      return socket;
    },
    receive: (message) => socket.receiveRaw(JSON.stringify(message)),
    receiveRaw: (data) => {
      for (const l of listeners.get("message") ?? []) l(data);
    },
    fail: (error) => {
      for (const l of listeners.get("error") ?? []) l(error);
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

  it("treats bindings like wildcards and drops a pattern made only of them", () => {
    const bound = compileFilter({ pattern: ["issue", $.id, "title"] });
    expect(bound.id).toBe(compileFilter({ pattern: ["issue", _, "title"] }).id);
    expect(bound.filter).toEqual({ pattern: ["issue", _, "title"] });
    expect(serializeFilter({ pattern: ["issue", $.id, _] })).toBe(serializeFilter({ pattern: ["issue", _, _] }));

    const open = compileFilter({ pattern: [$.a, _] });
    expect(open.filter).toEqual({});
    expect(open.matches(["a"])).toBe(false);
    expect(open.matches(["a", 1])).toBe(true);
  });
});

describe("protocol parsing", () => {
  it("rejects malformed changes", () => {
    expect(() => parseChanges({})).toThrow("changes must be an array");
    expect(() => parseChanges(["nope"])).toThrow("change must be an object");
    expect(() => parseChanges([{ op: "nope", terms: ["a"], scope: "" }])).toThrow();
    expect(() => parseChanges([{ op: "upsert", terms: [], scope: "" }])).toThrow();
    expect(() => parseChanges([{ op: "upsert", terms: [{}], scope: "" }])).toThrow();
    expect(() => parseChanges([{ op: "upsert", terms: ["a"], scope: 1 }])).toThrow();
    expect(parseChanges([{ op: "delete", terms: ["a", 1, true], scope: "s" }])).toEqual([{ op: "delete", terms: ["a", 1, true], scope: "s" }]);
  });

  it("parses filters with null wildcards", () => {
    expect(parseFilter({ scope: "p", pattern: ["issue", null] })).toEqual({ scope: "p", pattern: ["issue", _] });
    expect(parseFilter({})).toEqual({});
    expect(() => parseFilter({ scope: 1 })).toThrow("filter.scope must be a string");
    expect(() => parseFilter({ pattern: "issue" })).toThrow("filter.pattern must be an array");
    expect(() => parseFilter(null)).toThrow("filter must be an object");
    expect(() => parseFilter("scope")).toThrow("filter must be an object");
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
      allow: ({ scope }, context) => scope === "" || scope === `user:${String(context)}`,
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

  it("rejects a push with whatever the allow policy threw, even when it is not an Error", async () => {
    const server = await createSyncServer({
      storage: memoryStorage(),
      allow: () => {
        throw "no way";
      },
    });
    const socket = fakeSocket();
    server.handle(socket);
    socket.receive({ type: "push", id: 7, changes: [{ op: "upsert", terms: ["n", 1], scope: "" }] });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "reject", id: 7, error: "no way" });
    expect(server.facts()).toEqual([]);
  });

  it("ignores messages it cannot parse and reports ones it cannot handle", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await createSyncServer({ storage: memoryStorage() });
    const socket = fakeSocket();
    server.handle(socket);
    socket.receiveRaw("{not json");
    socket.receive({ type: "subscribe", id: "bad", filter: { scope: 1 } });
    socket.receive({ type: "subscribe", id: "ok", filter: {} });
    await tick();
    expect(errors).toHaveBeenCalledWith("[jam] sync: ignoring unparseable message");
    expect(errors).toHaveBeenCalledWith("[jam] sync message failed", expect.any(Error));
    expect(socket.sent.map((m) => m.type)).toEqual(["hello", "snapshot"]);
    errors.mockRestore();
  });

  it("stops sending to a connection once it has closed or errored, and survives a socket that cannot send", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await createSyncServer({ storage: memoryStorage() });

    const gone = fakeSocket();
    server.handle(gone);
    gone.receive({ type: "subscribe", id: "s", filter: {} });
    gone.close();
    await tick();
    expect(gone.sent.map((m) => m.type)).toEqual(["hello"]);

    const broken = fakeSocket();
    server.handle(broken);
    broken.fail(new Error("reset"));
    expect(errors).toHaveBeenCalledWith("[jam] sync socket error", expect.any(Error));
    expect(server.connections).toBe(0);

    const flaky = fakeSocket();
    flaky.send = () => {
      throw new Error("EPIPE");
    };
    server.handle(flaky);
    expect(errors).toHaveBeenCalledWith("[jam] sync send failed", expect.any(Error));
    expect(server.connections).toBe(1);
    errors.mockRestore();
  });

  it("asks allow about every change in order and rejects the push whole on the first refusal", async () => {
    const asked: Array<[SyncChange, unknown]> = [];
    const server = await createSyncServer({
      storage: memoryStorage(),
      allow: (change, context) => {
        asked.push([change, context]);
        return change.terms[0] !== "secret";
      },
    });
    const socket = fakeSocket();
    server.handle(socket, { user: "alice" });
    socket.receive({
      type: "push",
      id: 1,
      changes: [
        { op: "upsert", terms: ["note", 1, "text", "hi"], scope: "" },
        { op: "delete", terms: ["secret", 1], scope: "" },
        { op: "upsert", terms: ["note", 2, "text", "yo"], scope: "" },
      ],
    });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "reject", id: 1, error: expect.stringContaining('["secret",1]') });
    expect(server.facts()).toEqual([]);
    expect(server.seq).toBe(0);
    expect(asked).toEqual([
      [{ op: "upsert", terms: ["note", 1, "text", "hi"], scope: "" }, { user: "alice" }],
      [{ op: "delete", terms: ["secret", 1], scope: "" }, { user: "alice" }],
    ]);

    socket.receive({ type: "push", id: 2, changes: [{ op: "upsert", terms: ["note", 1, "text", "hi"], scope: "" }] });
    await tick();
    expect(socket.sent[2]).toEqual({ type: "ack", id: 2, seq: 1 });
  });

  it("denies subscriptions allowRead refuses and never streams to them", async () => {
    const server = await createSyncServer({
      storage: memoryStorage(),
      allowRead: (filter, context) => filter.scope === `user:${String(context)}`,
    });
    await server.apply([
      { op: "upsert", terms: ["note", 1], scope: "user:alice" },
      { op: "upsert", terms: ["note", 2], scope: "user:bob" },
    ]);
    const socket = fakeSocket();
    server.handle(socket, "alice");
    socket.receive({ type: "subscribe", id: "mine", filter: { scope: "user:alice" } });
    socket.receive({ type: "subscribe", id: "theirs", filter: { scope: "user:bob" }, since: 1 });
    await tick();
    expect(socket.sent[1]).toEqual({ type: "snapshot", id: "mine", seq: 2, facts: [[["note", 1], "user:alice"]] });
    expect(socket.sent[2]).toEqual({ type: "denied", id: "theirs", error: expect.stringContaining("user:bob") });

    await server.apply([
      { op: "upsert", terms: ["note", 3], scope: "user:bob" },
      { op: "upsert", terms: ["note", 4], scope: "user:alice" },
    ]);
    expect(socket.sent[3]).toEqual({ type: "changes", seq: 4, changes: [{ op: "upsert", terms: ["note", 4], scope: "user:alice" }] });
    expect(socket.sent).toHaveLength(4);
  });

  it("awaits allowRead and drops a subscription that is denied on a re-subscribe", async () => {
    const revoked = new Set<string>();
    const server = await createSyncServer({
      storage: memoryStorage(),
      allowRead: async (filter) => {
        await tick();
        return !revoked.has(filter.scope ?? "");
      },
    });
    await server.apply([{ op: "upsert", terms: ["n", 1], scope: "p1" }]);
    const socket = fakeSocket();
    server.handle(socket);
    socket.receive({ type: "subscribe", id: "p1", filter: { scope: "p1" } });
    await tick();
    await tick();
    expect(socket.sent[1]).toEqual({ type: "snapshot", id: "p1", seq: 1, facts: [[["n", 1], "p1"]] });
    await server.apply([{ op: "upsert", terms: ["n", 2], scope: "p1" }]);
    expect(socket.sent[2]).toEqual({ type: "changes", seq: 2, changes: [{ op: "upsert", terms: ["n", 2], scope: "p1" }] });

    revoked.add("p1");
    socket.receive({ type: "subscribe", id: "p1", filter: { scope: "p1" }, since: 2 });
    await tick();
    await tick();
    expect(socket.sent[3]).toEqual({ type: "denied", id: "p1", error: expect.stringContaining("p1") });
    await server.apply([{ op: "upsert", terms: ["n", 3], scope: "p1" }]);
    expect(socket.sent).toHaveLength(4);
  });
});
