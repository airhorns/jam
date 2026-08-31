// sync() — mirror slices of the server's durable facts into the FactDB and
// ship local writes back over a WebSocket.
//
//   const s = await sync({ url: "ws://localhost:8080" });
//   const project = s.subscribe({ scope: "project:p1" });
//   await project.ready;
//   …
//   await project.dispose();
//
// Every durable fact the client knows is kept in a local FactStorage mirror
// so a subscription shows its last known state instantly and resumes from the
// seq it last saw. Local writes queue in the storage's log (the outbox) until
// the server acknowledges them; while a key is in the outbox, incoming changes
// for it are ignored so the server's echo can never flicker a local write.
// Without `url` there is no network and subscribe() only chooses which stored
// facts are loaded into memory.

import { factKey, type Fact } from "@jam/engine";
import { memoryStorage, type FactStorage, type LogEntry, type StoredFact } from "@jam/engine/storage";
import { indexedDBStorage } from "@jam/engine/storage/indexeddb";
import { applyFacts, isApplying } from "./applying";
import { db, _ } from "./db";
import { compileFilter, serializeFilter, type ClientMessage, type CompiledFilter, type FactFilter, type ServerMessage, type SyncChange } from "./filter";
import { defaultExclude } from "./persist";
import { transaction } from "./reactive";

export type { FactFilter, CompiledFilter, SyncChange, SyncOp } from "./filter";
export { compileFilter } from "./filter";

/** The subset of the browser WebSocket API the client uses. */
export interface SyncWebSocket {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface SyncOptions {
  /** WebSocket URL of the sync server. Omit for a purely local database. */
  url?: string;
  /** Local mirror of synced facts and the outbox; defaults to IndexedDB in browsers and memory elsewhere. */
  storage?: FactStorage;
  /** IndexedDB database name for the default storage (default: "jam"). */
  name?: string;
  /** Return true to keep a fact local-only. Default: VDOM facts. Derived (claimed) facts are never synced. */
  exclude?: (fact: Fact) => boolean;
  /** Allowlist — when given, only these facts are synced and `exclude` is ignored. */
  include?: (fact: Fact) => boolean;
  /** Delay before reconnecting after a failure; doubles per consecutive failure up to a minute (default: 1000). */
  retryDelay?: number;
  /** WebSocket constructor; defaults to the global `WebSocket`. */
  socket?: (url: string) => SyncWebSocket;
}

export interface FactSubscription {
  /** Stable id of the filter. */
  id: string;
  /** Resolves once the server's current state for this filter has been mirrored into facts (immediately when offline or local-only). */
  ready: Promise<void>;
  /** Release this subscription; facts held only by it leave memory (the local mirror keeps them for a fast resume). */
  dispose(): Promise<void>;
}

export interface SyncHandle {
  subscribe(filter?: FactFilter): FactSubscription;
  /** Wait for local storage writes and, when connected, for the server to acknowledge every queued write. */
  flush(): Promise<void>;
  dispose(): Promise<void>;
  readonly connected: boolean;
}

export const SYNC_STATUS_FACT = "sync";

export type SyncStatus = "standalone" | "offline" | "connecting" | "syncing" | "live";

const MAX_RETRY_DELAY = 60_000;

interface Subscription {
  compiled: CompiledFilter;
  refs: number;
  ready: Promise<void>;
  resolveReady: () => void;
  /** `ready` has resolved and the shape fact is set; never reset. */
  resolved: boolean;
  /** Caught up with the server on the current connection. */
  synced: boolean;
}

interface PendingWrite {
  upserts: Map<string, StoredFact>;
  deletes: Map<string, Fact>;
  log: LogEntry[];
  meta: Record<string, string | undefined>;
}

async function defaultStorage(name: string): Promise<FactStorage> {
  return typeof indexedDB === "undefined" ? memoryStorage() : indexedDBStorage(name);
}

export async function sync(options: SyncOptions = {}): Promise<SyncHandle> {
  const { url, exclude = defaultExclude, include, name = "jam" } = options;
  const retryDelay = options.retryDelay ?? 1000;
  const shouldSync = include ? include : (fact: Fact) => !exclude(fact);
  const ownsStorage = !options.storage;
  const storage = options.storage ?? (await defaultStorage(name));
  const makeSocket = options.socket ?? ((target: string) => new WebSocket(target) as unknown as SyncWebSocket);

  // --- local state ---
  const mirror = new Map<string, StoredFact>();
  for (const fact of await storage.load()) mirror.set(factKey(fact.terms), fact);
  const outbox: LogEntry[] = url ? await storage.readLog(0) : [];
  let localSeq = await storage.logHead();
  const pendingKeys = new Map<string, number>();
  const holdKey = (key: string) => pendingKeys.set(key, (pendingKeys.get(key) ?? 0) + 1);
  const releaseKey = (key: string) => {
    const n = (pendingKeys.get(key) ?? 0) - 1;
    if (n <= 0) pendingKeys.delete(key);
    else pendingKeys.set(key, n);
  };
  for (const entry of outbox) holdKey(factKey(entry.terms));

  const subscriptions = new Map<string, Subscription>();
  const matchesActive = (terms: Fact, scope: string, except?: Subscription): boolean => {
    for (const sub of subscriptions.values()) {
      if (sub !== except && sub.compiled.matches(terms, scope)) return true;
    }
    return false;
  };

  // --- storage writes, batched per tick ---
  let pendingWrite: PendingWrite | null = null;
  let writing: Promise<void> = Promise.resolve();
  const write = (fn: (w: PendingWrite) => void) => {
    if (!pendingWrite) {
      pendingWrite = { upserts: new Map(), deletes: new Map(), log: [], meta: {} };
      queueMicrotask(flushWrites);
    }
    fn(pendingWrite);
  };
  const flushWrites = () => {
    const batch = pendingWrite;
    pendingWrite = null;
    if (!batch) return;
    writing = writing
      .then(() =>
        storage.write({
          upserts: Array.from(batch.upserts.values()),
          deletes: Array.from(batch.deletes.values()),
          log: batch.log,
          meta: batch.meta,
        }),
      )
      .catch((e) => console.error("[jam] sync storage write failed", e));
  };
  const settled = async () => {
    flushWrites();
    await writing;
  };

  const remember = (terms: Fact, scope: string) => {
    const key = factKey(terms);
    const fact = { terms, scope };
    mirror.set(key, fact);
    write((w) => {
      w.deletes.delete(key);
      w.upserts.set(key, fact);
    });
  };
  const forget = (terms: Fact) => {
    const key = factKey(terms);
    mirror.delete(key);
    write((w) => {
      w.upserts.delete(key);
      w.deletes.set(key, terms);
    });
  };

  // --- status facts (owned by sync, so never durable) ---
  const owner = db.createChildOwner(db.getCurrentOwnerId(), "sync");
  const setStatusFact = (...terms: Fact) => {
    transaction(() => {
      db.drop(...terms.slice(0, -1), _);
      db.withOwnerScope(owner, () => db.assert(...terms));
    });
  };
  let status: SyncStatus = url ? "connecting" : "standalone";
  const updateStatus = () => {
    if (url) {
      if (!socketOpen) status = disposed ? "offline" : reconnecting ? "offline" : "connecting";
      else status = Array.from(subscriptions.values()).every((s) => s.synced) ? "live" : "syncing";
    }
    setStatusFact(SYNC_STATUS_FACT, "status", status);
  };
  const updatePending = () => setStatusFact(SYNC_STATUS_FACT, "pending", outbox.length);
  const setError = (message: string | null) => {
    transaction(() => {
      db.drop(SYNC_STATUS_FACT, "error", _);
      if (message !== null) db.withOwnerScope(owner, () => db.assert(SYNC_STATUS_FACT, "error", message));
    });
  };

  // --- applying server state ---
  const applyChange = (change: SyncChange) => {
    const key = factKey(change.terms);
    if (pendingKeys.has(key) || !matchesActive(change.terms, change.scope)) return;
    if (change.op === "delete") {
      db.drop(...change.terms);
      forget(change.terms);
      return;
    }
    db.withScope(change.scope, () => db.insert(...change.terms));
    if (db.scopeOf(...change.terms) !== change.scope) db.setScope(change.terms, change.scope);
    remember(change.terms, change.scope);
  };

  const applyChanges = (changes: SyncChange[]) => {
    if (changes.length === 0) return;
    applyFacts(() => {
      for (const change of changes) applyChange(change);
    });
  };

  const applySnapshot = (sub: Subscription, facts: Array<[Fact, string]>) => {
    const expected = new Set(facts.map(([terms]) => factKey(terms)));
    applyFacts(() => {
      for (const [key, fact] of Array.from(mirror)) {
        if (expected.has(key) || pendingKeys.has(key) || !sub.compiled.matches(fact.terms, fact.scope)) continue;
        db.drop(...fact.terms);
        forget(fact.terms);
      }
      for (const [terms, scope] of facts) applyChange({ op: "upsert", terms, scope });
    });
  };

  /** Bring a subscription's slice of the local mirror into memory. */
  const loadFromMirror = (sub: Subscription) => {
    applyFacts(() => {
      for (const fact of mirror.values()) {
        if (sub.compiled.matches(fact.terms, fact.scope)) db.withScope(fact.scope, () => db.insert(...fact.terms));
      }
    });
  };

  /** Drop facts from memory that no remaining subscription covers; the mirror keeps them. */
  const unloadOrphans = (released: Subscription) => {
    applyFacts(() => {
      for (const fact of mirror.values()) {
        if (!released.compiled.matches(fact.terms, fact.scope) || matchesActive(fact.terms, fact.scope, released)) continue;
        if (pendingKeys.has(factKey(fact.terms))) continue;
        db.drop(...fact.terms);
      }
    });
  };

  /** Remember how far each caught-up subscription has seen, so a later connection can ask for a replay. */
  const recordSeq = (seq: number) => {
    write((w) => {
      for (const [id, sub] of subscriptions) if (sub.synced) w.meta[`sub:${id}`] = String(seq);
    });
  };

  // --- connection ---
  let socket: SyncWebSocket | null = null;
  let socketOpen = false;
  let reconnecting = false;
  let disposed = false;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let inflight: { id: number; entries: LogEntry[] } | null = null;
  let nextPushId = 1;
  const drainWaiters: Array<() => void> = [];

  const sendMessage = (message: ClientMessage) => {
    if (!socket || !socketOpen) return;
    socket.send(JSON.stringify(message));
  };

  const subscribeRemote = async (id: string, sub: Subscription) => {
    const since = await storage.getMeta(`sub:${id}`);
    if (!socketOpen || subscriptions.get(id) !== sub) return;
    sendMessage({
      type: "subscribe",
      id,
      filter: JSON.parse(serializeFilter(sub.compiled.filter)),
      since: since === undefined ? undefined : Number(since),
    });
  };

  const pushNow = () => {
    if (!socketOpen || inflight || outbox.length === 0) return;
    const entries = outbox.slice();
    inflight = { id: nextPushId++, entries };
    sendMessage({
      type: "push",
      id: inflight.id,
      changes: entries.map((e) => ({ op: e.op, terms: e.terms, scope: e.scope })),
    });
  };

  const retire = (entries: LogEntry[]) => {
    outbox.splice(0, entries.length);
    for (const entry of entries) releaseKey(factKey(entry.terms));
    const last = entries[entries.length - 1];
    writing = writing.then(() => storage.trimLog(last.seq)).catch((e) => console.error("[jam] sync outbox trim failed", e));
    updatePending();
    if (outbox.length === 0) {
      for (const resolve of drainWaiters.splice(0)) resolve();
    }
  };

  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case "hello":
        return;
      case "snapshot": {
        const sub = subscriptions.get(message.id);
        if (!sub) return;
        applySnapshot(sub, message.facts);
        markReady(sub);
        recordSeq(message.seq);
        return;
      }
      case "replay": {
        const sub = subscriptions.get(message.id);
        if (!sub) return;
        applyChanges(message.changes);
        markReady(sub);
        recordSeq(message.seq);
        return;
      }
      case "changes":
        applyChanges(message.changes);
        recordSeq(message.seq);
        return;
      case "ack":
      case "reject": {
        if (!inflight || inflight.id !== message.id) return;
        const done = inflight;
        inflight = null;
        if (message.type === "reject") console.error("[jam] sync push rejected:", message.error);
        setError(message.type === "reject" ? message.error : null);
        retire(done.entries);
        pushNow();
        return;
      }
    }
  };

  const markReady = (sub: Subscription) => {
    sub.synced = true;
    if (!sub.resolved) {
      sub.resolved = true;
      setStatusFact(SYNC_STATUS_FACT, "shape", sub.compiled.id, "ready", true);
      sub.resolveReady();
    }
    updateStatus();
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    reconnecting = true;
    updateStatus();
    const delay = Math.min(retryDelay * 2 ** attempts, MAX_RETRY_DELAY);
    attempts++;
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (disposed || !url) return;
    reconnectTimer = null;
    let ws: SyncWebSocket;
    try {
      ws = makeSocket(url);
    } catch (e) {
      console.error("[jam] sync: could not open socket", e);
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      socketOpen = true;
      reconnecting = false;
      attempts = 0;
      updateStatus();
      for (const [id, sub] of subscriptions) void subscribeRemote(id, sub);
      pushNow();
    };
    ws.onmessage = (event) => {
      if (socket !== ws) return;
      try {
        handleMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch (e) {
        console.error("[jam] sync: bad server message", e);
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      socketOpen = false;
      inflight = null;
      for (const sub of subscriptions.values()) sub.synced = false;
      scheduleReconnect();
    };
  };

  // --- write side ---
  const unobserve = db.observe((type, key, fact, info) => {
    if (isApplying() || !shouldSync(fact)) return;
    if (type === "add") remember(fact, info.scope);
    else forget(fact);
    if (!url) return;
    const entry: LogEntry = {
      seq: ++localSeq,
      op: type === "delete" ? "delete" : info.replace ? "replace" : "upsert",
      terms: fact,
      scope: info.scope,
    };
    outbox.push(entry);
    holdKey(key);
    write((w) => w.log.push(entry));
    updatePending();
    pushNow();
  });

  updateStatus();
  updatePending();
  connect();

  // --- handle ---
  const subscribe = (filter: FactFilter = {}): FactSubscription => {
    const compiled = compileFilter(filter);
    const id = compiled.id;
    let sub = subscriptions.get(id);
    if (!sub) {
      let resolveReady!: () => void;
      const ready = new Promise<void>((resolve) => (resolveReady = resolve));
      sub = { compiled, refs: 0, ready, resolveReady, resolved: false, synced: false };
      subscriptions.set(id, sub);
      loadFromMirror(sub);
      if (!url) markReady(sub);
      else if (socketOpen) void subscribeRemote(id, sub);
      updateStatus();
    }
    sub.refs++;
    const owned = sub;
    let released = false;
    return {
      id,
      ready: sub.ready,
      dispose: async () => {
        if (released) return;
        released = true;
        owned.refs--;
        if (owned.refs > 0 || subscriptions.get(id) !== owned) return;
        subscriptions.delete(id);
        sendMessage({ type: "unsubscribe", id });
        unloadOrphans(owned);
        transaction(() => db.drop(SYNC_STATUS_FACT, "shape", id, "ready", _));
        updateStatus();
        await settled();
      },
    };
  };
  return {
    subscribe,
    get connected() {
      return socketOpen;
    },
    async flush() {
      await settled();
      if (!url || !socketOpen || outbox.length === 0) return;
      await new Promise<void>((resolve) => {
        drainWaiters.push(resolve);
        pushNow();
      });
      await settled();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      unobserve();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = socket;
      socket = null;
      socketOpen = false;
      ws?.close();
      for (const resolve of drainWaiters.splice(0)) resolve();
      transaction(() => db.revokeOwner(owner));
      await settled();
      if (ownsStorage) await storage.close();
    },
  };
}
