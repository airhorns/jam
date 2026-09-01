// The sync server: an engine holding the authoritative durable facts, an
// append-only log of committed transactions in storage, and WebSocket-style
// connections that subscribe to filtered slices and push their own changes.
//
//   const server = await createSyncServer({ storage: sqliteStorage("facts.db") });
//   new WebSocketServer({ port }).on("connection", (socket) => server.handle(socket));
//
// See filter.ts for the message shapes. Every connection receives one
// `changes` message per committed transaction (filtered to its subscriptions,
// possibly empty) so a client knows exactly which seq it has caught up to.

import { Engine, ROOT_OWNER, factKey, type Fact, type FactEvent } from "@jam/engine";
import type { FactStorage, NewLogEntry, StoredFact } from "@jam/engine/storage";
import {
  compileFilter,
  parseChanges,
  parseFilter,
  serializeFilter,
  type ClientMessage,
  type CompiledFilter,
  type FactFilter,
  type ServerMessage,
  type SyncChange,
} from "./filter";

export type { SyncChange, SyncOp, FactFilter, ClientMessage, ServerMessage } from "./filter";
export { compileFilter, parseChanges, parseFilter } from "./filter";
export { memoryStorage } from "@jam/engine/storage";
export type { FactStorage, StoredFact, LogEntry } from "@jam/engine/storage";
export { sqliteStorage } from "@jam/engine/storage/sqlite";

/** The subset of `ws`'s WebSocket the server uses. */
export interface SyncSocket {
  send(data: string): void;
  on(event: "message", listener: (data: unknown) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
}

export interface SyncServerOptions {
  storage: FactStorage;
  /** Whether a connection may make `change`; a push with a disallowed change is rejected whole. Default: allow everything. */
  allow?: (change: SyncChange, context: unknown) => boolean | Promise<boolean>;
  /** Whether a connection may subscribe to `filter`; a denied subscription gets a `denied` message and receives nothing. Default: allow everything. */
  allowRead?: (filter: FactFilter, context: unknown) => boolean | Promise<boolean>;
  /** Log entries kept for replay to reconnecting clients (default: 10000). */
  logRetention?: number;
}

export interface SyncServer {
  /** Attach a connection; `context` is passed to `allow` and `allowRead` (e.g. the authenticated user). */
  handle(socket: SyncSocket, context?: unknown): void;
  /** Commit changes as the server itself (seeds, admin tools). Resolves with the committed seq. */
  apply(changes: SyncChange[]): Promise<number>;
  facts(): StoredFact[];
  readonly seq: number;
  readonly connections: number;
  close(): Promise<void>;
}

export class SyncRejected extends Error {}

interface Connection {
  socket: SyncSocket;
  context: unknown;
  subscriptions: Map<string, CompiledFilter>;
  open: boolean;
}

export async function createSyncServer(options: SyncServerOptions): Promise<SyncServer> {
  const { storage, allow, allowRead, logRetention = 10_000 } = options;
  const engine = new Engine();
  const connections = new Set<Connection>();

  for (const { terms, scope } of await storage.load()) engine.assert(ROOT_OWNER, engine.id(scope), terms);
  engine.applyPending();
  engine.flush();

  // A transaction's seq is the seq storage assigned to its last log entry.
  let seq = await storage.logHead();
  let oldestSeq = seq + 1;
  const first = await storage.readLog(0, 1);
  if (first.length > 0) oldestSeq = first[0].seq;

  // Commits are serialized so seqs, storage writes and broadcasts stay in order.
  let chain: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task);
    chain = next.catch(() => {});
    return next;
  };

  const send = (connection: Connection, message: ServerMessage) => {
    if (!connection.open) return;
    try {
      connection.socket.send(JSON.stringify(message));
    } catch (e) {
      console.error("[jam] sync send failed", e);
    }
  };

  /** Apply a batch to the engine and return what actually changed. */
  const commit = (changes: SyncChange[]): SyncChange[] => {
    const effective: SyncChange[] = [];
    const off = engine.onFact((event: FactEvent) => {
      effective.push({ op: event.type === "add" ? "upsert" : "delete", terms: event.terms, scope: event.scope });
    });
    try {
      for (const change of changes) {
        const scope = engine.id(change.scope);
        if (change.op === "delete") {
          engine.drop(change.terms);
          continue;
        }
        if (change.op === "replace") engine.replace(ROOT_OWNER, scope, change.terms);
        else engine.assert(ROOT_OWNER, scope, change.terms);
        // A scope move leaves one slice and enters another, so subscribers of each see the right side of it.
        const current = engine.scopeOf(change.terms);
        if (current !== undefined && current !== change.scope) {
          engine.setScope(scope, change.terms);
          effective.push({ op: "delete", terms: change.terms, scope: current }, { op: "upsert", terms: change.terms, scope: change.scope });
        }
      }
      engine.flush();
    } finally {
      off();
    }
    return effective;
  };

  /** Write a transaction's changes and return its seq. */
  const persist = async (effective: SyncChange[]): Promise<number> => {
    const upserts: StoredFact[] = [];
    const deletes: Fact[] = [];
    const log: NewLogEntry[] = [];
    const final = new Map<string, SyncChange>();
    for (const change of effective) {
      final.set(factKey(change.terms), change);
      log.push({ op: change.op, terms: change.terms, scope: change.scope });
    }
    for (const change of final.values()) {
      if (change.op === "upsert") upserts.push({ terms: change.terms, scope: change.scope });
      else deletes.push(change.terms);
    }
    const seqs = await storage.write({ upserts, deletes, log });
    const committedSeq = seqs[seqs.length - 1];
    if (committedSeq - oldestSeq >= logRetention) {
      const trimTo = committedSeq - logRetention;
      await storage.trimLog(trimTo);
      oldestSeq = trimTo + 1;
    }
    return committedSeq;
  };

  const broadcast = (committedSeq: number, effective: SyncChange[]) => {
    for (const connection of connections) {
      if (connection.subscriptions.size === 0) continue;
      const filtered = effective.filter((change) =>
        Array.from(connection.subscriptions.values()).some((filter) => filter.matches(change.terms, change.scope)),
      );
      send(connection, { type: "changes", seq: committedSeq, changes: filtered });
    }
  };

  /** Commit a batch; `committed` runs inside the serialized section so anything it sends precedes the next transaction's broadcast. */
  const apply = (changes: SyncChange[], committed?: (seq: number) => void): Promise<number> =>
    serialized(async () => {
      const effective = commit(changes);
      if (effective.length > 0) {
        seq = await persist(effective);
        broadcast(seq, effective);
      }
      committed?.(seq);
      return seq;
    });

  const snapshot = (filter: CompiledFilter): Array<[Fact, string]> => {
    const scoped = engine.facts(filter.filter.scope);
    const out: Array<[Fact, string]> = [];
    for (const fact of scoped) if (filter.matches(fact.terms, fact.scope)) out.push([fact.terms, fact.scope]);
    return out;
  };

  const subscribe = async (connection: Connection, id: string, filter: FactFilter, since: number | undefined) => {
    if (allowRead && !(await allowRead(filter, connection.context))) {
      // A re-subscribe that has lost access also ends the stream it had.
      connection.subscriptions.delete(id);
      send(connection, { type: "denied", id, error: `subscribing to ${serializeFilter(filter)} is not allowed` });
      return;
    }
    const compiled = compileFilter(filter);
    connection.subscriptions.set(id, compiled);
    if (since !== undefined && since <= seq && since + 1 >= oldestSeq) {
      const entries = await storage.readLog(since);
      const changes: SyncChange[] = [];
      for (const entry of entries) {
        if (compiled.matches(entry.terms, entry.scope)) changes.push({ op: entry.op, terms: entry.terms, scope: entry.scope });
      }
      send(connection, { type: "replay", id, seq, changes });
      return;
    }
    send(connection, { type: "snapshot", id, seq, facts: snapshot(compiled) });
  };

  const push = async (connection: Connection, id: number, changes: SyncChange[]) => {
    if (allow) {
      for (const change of changes) {
        if (!(await allow(change, connection.context))) {
          throw new SyncRejected(`${change.op} of ${JSON.stringify(change.terms)} in scope ${JSON.stringify(change.scope)} is not allowed`);
        }
      }
    }
    await apply(changes, (committed) => send(connection, { type: "ack", id, seq: committed }));
  };

  const handleMessage = async (connection: Connection, raw: unknown) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      console.error("[jam] sync: ignoring unparseable message");
      return;
    }
    switch (message.type) {
      case "subscribe": {
        const filter = parseFilter(message.filter);
        const since = typeof message.since === "number" ? message.since : undefined;
        await serialized(() => subscribe(connection, String(message.id), filter, since));
        return;
      }
      case "unsubscribe":
        connection.subscriptions.delete(String(message.id));
        return;
      case "push": {
        try {
          await push(connection, message.id, parseChanges(message.changes));
        } catch (e) {
          send(connection, { type: "reject", id: message.id, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
    }
  };

  const handle = (socket: SyncSocket, context?: unknown) => {
    const connection: Connection = { socket, context, subscriptions: new Map(), open: true };
    connections.add(connection);
    // Messages from one connection are handled in order.
    let queue: Promise<void> = Promise.resolve();
    socket.on("message", (data) => {
      queue = queue.then(() => handleMessage(connection, data)).catch((e) => console.error("[jam] sync message failed", e));
    });
    const drop = () => {
      connection.open = false;
      connections.delete(connection);
    };
    socket.on("close", drop);
    socket.on("error", (e) => {
      console.error("[jam] sync socket error", e);
      drop();
    });
    send(connection, { type: "hello", seq });
  };

  return {
    handle,
    apply,
    facts: () => engine.facts(),
    get seq() {
      return seq;
    },
    get connections() {
      return connections.size;
    },
    async close() {
      await chain;
      connections.clear();
      await storage.close();
    },
  };
}

export { factKey };
