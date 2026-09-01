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
// seq it last saw, as long as the server still serves the log that seq belongs
// to. Local writes queue in the storage's log (the outbox) until
// the server acknowledges them; while a key is in the outbox, incoming changes
// for it are ignored so the server's echo can never flicker a local write.
// Without `url` there is no network and subscribe() only chooses which stored
// facts are loaded into memory.
//
// Browser tabs sharing one database elect a leader through a Web Lock. The
// leader holds the only WebSocket, subscribes to the union of every tab's
// filters, mirrors server changes into storage and pushes the shared outbox;
// it broadcasts what it applied so the other tabs keep their memory current.
// Any tab writes its own local changes to the outbox and announces them, so
// every tab shows a write at once and the leader ships it. When the leader
// closes, the lock passes to another tab, which reconnects and resumes from
// the seqs recorded in storage.

import { factKey, type Fact } from "@jam/engine";
import { memoryStorage, type FactStorage, type LogEntry, type StoredFact } from "@jam/engine/storage";
import { indexedDBStorage } from "@jam/engine/storage/indexeddb";
import { applyFacts, isApplying } from "./applying";
import { db as defaultDb, _, type Bindings, type FactDB, type Pattern } from "./db";
import {
  compileFilter,
  parseFilter,
  serializeFilter,
  type ClientMessage,
  type CompiledFilter,
  type FactFilter,
  type ServerMessage,
  type SyncChange,
} from "./filter";
import { defaultExclude } from "./persist";
import { reaction, transaction } from "./reactive";
import { defaultTabs, type Lead, type TabCoordinator } from "./tabs";

export type { FactFilter, CompiledFilter, SyncChange, SyncOp } from "./filter";
export { compileFilter } from "./filter";
export type { TabCoordinator, Lead } from "./tabs";
export { browserTabs, soloTabs } from "./tabs";

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
  /** Coordination with the other tabs sharing `name`; defaults to BroadcastChannel + Web Locks in browsers and to none elsewhere. */
  tabs?: TabCoordinator;
  /** @internal The database to mirror into; tests stand up several tabs in one process with it. */
  db?: FactDB;
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
  /**
   * Keep subscriptions in step with facts: whenever the matches of `patterns`
   * change, subscribe what `wanted` returns for them. Newly wanted filters are
   * ready before anything no longer wanted is released, so a switch never
   * empties the screen first. Returns a function that releases them all.
   */
  follow(patterns: Pattern[], wanted: (matches: Bindings[]) => FactFilter[]): () => Promise<void>;
  /** Wait for local storage writes and, when connected, for the server to acknowledge every queued write. */
  flush(): Promise<void>;
  dispose(): Promise<void>;
  readonly connected: boolean;
  /** Whether this tab holds the server connection on behalf of the tabs sharing its storage. */
  readonly leading: boolean;
  /** This tab's id among the tabs sharing its storage. */
  readonly tab: string;
}

export const SYNC_STATUS_FACT = "sync";

export type SyncStatus = "standalone" | "offline" | "connecting" | "syncing" | "live";

const MAX_RETRY_DELAY = 60_000;

/** A filter this tab holds. */
interface Subscription {
  compiled: CompiledFilter;
  refs: number;
  ready: Promise<void>;
  resolveReady: () => void;
  /** `ready` has resolved and the shape fact is set; never reset. */
  resolved: boolean;
  /** Caught up with the server on the current connection. */
  synced: boolean;
  /** The server refused this filter; it holds nothing until a later subscribe is allowed. */
  denied: boolean;
}

/** A filter some tab holds, as tracked by the leader. */
interface RemoteSubscription {
  compiled: CompiledFilter;
  tabs: Set<string>;
  synced: boolean;
}

interface PendingWrite {
  upserts: Map<string, StoredFact>;
  deletes: Map<string, Fact>;
  log: LogEntry[];
  meta: Record<string, string | undefined>;
  /** Local changes to announce to the other tabs once they are stored. */
  announce: LogEntry[];
}

type TabMessage =
  | { t: "hello"; tab: string }
  | { t: "lead"; tab: string }
  | { t: "want"; tab: string; id: string; filter: string }
  | { t: "drop"; tab: string; id: string }
  | { t: "bye"; tab: string }
  | { t: "conn"; open: boolean; lost: boolean }
  | { t: "state"; changes: SyncChange[] }
  | { t: "ready"; id: string }
  | { t: "denied"; id: string; error: string }
  | { t: "error"; message: string | null }
  | { t: "local"; entries: LogEntry[] }
  | { t: "acked"; upTo: number };

async function defaultStorage(name: string): Promise<FactStorage> {
  return typeof indexedDB === "undefined" ? memoryStorage() : indexedDBStorage(name);
}

function tabId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export async function sync(options: SyncOptions = {}): Promise<SyncHandle> {
  const { url, exclude = defaultExclude, include, name = "jam", db = defaultDb } = options;
  const retryDelay = options.retryDelay ?? 1000;
  const shouldSync = include ? include : (fact: Fact) => !exclude(fact);
  const ownsStorage = !options.storage;
  const makeSocket = options.socket ?? ((target: string) => new WebSocket(target) as unknown as SyncWebSocket);
  const tabs = options.tabs ?? defaultTabs(name);
  const me = tabId();

  // Messages that arrive while the mirror is still loading are handled once it has.
  let started = false;
  let closed = false;
  const early: unknown[] = [];
  tabs.onMessage((message) => {
    if (started) handleTab(message as TabMessage);
    else early.push(message);
  });
  const post = (message: TabMessage) => {
    if (!closed) tabs.post(message);
  };

  const storage = options.storage ?? (await defaultStorage(name));

  // --- local state ---
  const mirror = new Map<string, StoredFact>();
  for (const fact of await storage.load()) mirror.set(factKey(fact.terms), fact);
  // The log is read before the acked watermark so an entry acknowledged in between is still skipped.
  const storedLog = url ? await storage.readLog(0) : [];
  let lastAcked = Number((await storage.getMeta("acked")) ?? 0);
  // Entries carry `seq: 0` until the storage write that assigns their seq settles.
  let outbox: LogEntry[] = [];
  const pendingKeys = new Map<string, number>();
  /** Keys where this tab's mirror may differ from what the leader wrote, to be written from the mirror if it takes the lead. */
  const unwritten = new Set<string>();
  const holdKey = (key: string) => pendingKeys.set(key, (pendingKeys.get(key) ?? 0) + 1);
  const releaseKey = (key: string) => {
    const n = (pendingKeys.get(key) ?? 0) - 1;
    if (n <= 0) pendingKeys.delete(key);
    else pendingKeys.set(key, n);
  };

  const subscriptions = new Map<string, Subscription>();
  /** Whether a subscription of this tab that the server has not refused covers the fact. */
  const matchesActive = (terms: Fact, scope: string, except?: Subscription): boolean => {
    for (const sub of subscriptions.values()) {
      if (sub !== except && !sub.denied && sub.compiled.matches(terms, scope)) return true;
    }
    return false;
  };
  const remote = new Map<string, RemoteSubscription>();
  const matchesRemote = (terms: Fact, scope: string): boolean => {
    for (const sub of remote.values()) if (sub.compiled.matches(terms, scope)) return true;
    return false;
  };

  // --- storage writes, batched per tick ---
  let pendingWrite: PendingWrite | null = null;
  let writing: Promise<void> = Promise.resolve();
  const write = (fn: (w: PendingWrite) => void) => {
    if (!pendingWrite) {
      pendingWrite = { upserts: new Map(), deletes: new Map(), log: [], meta: {}, announce: [] };
      queueMicrotask(flushWrites);
    }
    fn(pendingWrite);
  };
  const flushWrites = () => {
    const batch = pendingWrite;
    pendingWrite = null;
    if (!batch) return;
    writing = writing
      .then(async () => {
        const seqs = await storage.write({
          upserts: Array.from(batch.upserts.values()),
          deletes: Array.from(batch.deletes.values()),
          log: batch.log,
          meta: batch.meta,
        });
        batch.log.forEach((entry, i) => (entry.seq = seqs[i]));
        if (batch.announce.length > 0) {
          post({ t: "local", entries: batch.announce });
          pushNow();
        }
      })
      .catch((e) => console.error("[jam] sync storage write failed", e));
  };
  const settled = async () => {
    flushWrites();
    await writing;
  };

  /** Record a fact in the mirror; `persist` when this tab is the one writing it to storage. */
  const remember = (terms: Fact, scope: string, persist: boolean) => {
    const key = factKey(terms);
    const fact = { terms, scope };
    mirror.set(key, fact);
    if (!persist) return;
    write((w) => {
      w.deletes.delete(key);
      w.upserts.set(key, fact);
    });
  };
  const forget = (terms: Fact, persist: boolean) => {
    const key = factKey(terms);
    mirror.delete(key);
    if (!persist) return;
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
  let connected = false;
  /** The connection was lost, or never made it, since the last time it was open. */
  let lost = false;
  const updateStatus = () => {
    if (url) {
      if (!connected) status = disposed || lost ? "offline" : "connecting";
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
  const disconnected = (wasLost: boolean) => {
    connected = false;
    lost = wasLost;
    for (const sub of subscriptions.values()) if (!sub.denied) sub.synced = false;
    updateStatus();
  };
  const postConn = () => post({ t: "conn", open: connected, lost });

  // --- applying changes ---
  /** Load a fact into memory when a subscription of this tab covers it. */
  const load = (terms: Fact, scope: string) => {
    if (!matchesActive(terms, scope)) return;
    db.withScope(scope, () => db.insert(...terms));
    if (db.scopeOf(...terms) !== scope) db.setScope(terms, scope);
  };
  const unload = (terms: Fact, scope: string) => {
    if (matchesActive(terms, scope)) db.drop(...terms);
  };

  /**
   * Mirror one change; false when a pending local write or the lack of any interested tab leaves it alone.
   * A pending write to the same fact wins, and so does a pending replace of the same attribute, which
   * will evict this value once it reaches the server.
   */
  const applyChange = (change: SyncChange): boolean => {
    const key = factKey(change.terms);
    if (pendingKeys.has(key) || (change.op !== "delete" && replacedAfter(change.terms, 0))) {
      if (!leading) unwritten.add(key);
      return false;
    }
    if (leading && !matchesRemote(change.terms, change.scope)) return false;
    if (change.op === "delete") {
      unload(change.terms, change.scope);
      forget(change.terms, leading && mirror.has(key));
      return true;
    }
    load(change.terms, change.scope);
    const known = mirror.get(key);
    remember(change.terms, change.scope, leading && known?.scope !== change.scope);
    return true;
  };

  /**
   * Apply what the server (or, on a follower, the leader) reports. The leader passes on exactly what it
   * applied, so every tab's mirror stays a copy of what storage holds — that is what lets a tab that
   * takes over the lead trust its mirror when deciding which changes still need writing. A follower that
   * leaves one out because of its own pending write notes the key, since the leader did write it.
   */
  const applyChanges = (changes: SyncChange[]) => {
    if (changes.length === 0) return;
    const applied = applyFacts(() => changes.filter(applyChange), db);
    if (leading && applied.length > 0) post({ t: "state", changes: applied });
  };

  /** A snapshot as changes: everything the mirror holds for the filter but the server no longer does goes, the rest comes. */
  const snapshotChanges = (sub: RemoteSubscription, facts: Array<[Fact, string]>): SyncChange[] => {
    const expected = new Set(facts.map(([terms]) => factKey(terms)));
    const changes: SyncChange[] = [];
    for (const [key, fact] of mirror) {
      if (!expected.has(key) && sub.compiled.matches(fact.terms, fact.scope)) changes.push({ op: "delete", terms: fact.terms, scope: fact.scope });
    }
    for (const [terms, scope] of facts) changes.push({ op: "upsert", terms, scope });
    return changes;
  };

  const samePrefix = (a: Fact, b: Fact) => a.length === b.length && a.every((term, i) => i === a.length - 1 || term === b[i]);
  /** Whether the outbox holds a change to `terms` written after `seq`; an unassigned seq is newer than any. */
  const changedAfter = (terms: Fact, seq: number) => {
    const key = factKey(terms);
    return outbox.some((e) => (e.seq === 0 || e.seq > seq) && factKey(e.terms) === key);
  };
  const replacedAfter = (terms: Fact, seq: number) =>
    outbox.some((e) => (e.seq === 0 || e.seq > seq) && e.op === "replace" && e.terms.length > 1 && samePrefix(e.terms, terms));

  /**
   * Local writes other tabs stored: show them and hold their keys until the server acknowledges them.
   * Each entry takes effect at its place in the log — the writer's database may not have held what this
   * one does, so a replace evicts the other values of its prefix here too, a fact a later replace evicts
   * goes even though its writer stored it, and anything a later entry already rewrote is left as that
   * entry made it. The leader writes the outcome to storage so it lands after the writers' own partial
   * views; a starting tab does the same for the log it finds. A follower only notes what it changed,
   * since the leader may have heard of these entries in a different order and decided otherwise.
   */
  const applyLog = (entries: LogEntry[], persist = leading) => {
    const known = new Set(outbox.map((e) => e.seq));
    const fresh = entries.filter((e) => e.seq === 0 || (e.seq > lastAcked && !known.has(e.seq)));
    if (fresh.length === 0) return;
    const keep = (terms: Fact, scope: string) => {
      load(terms, scope);
      remember(terms, scope, persist);
      if (!persist) unwritten.add(factKey(terms));
    };
    const evict = (terms: Fact, scope: string) => {
      unload(terms, scope);
      forget(terms, persist);
      if (!persist) unwritten.add(factKey(terms));
    };
    applyFacts(() => {
      for (const entry of fresh) {
        const { terms, scope, seq } = entry;
        const key = factKey(terms);
        if (entry.op === "delete") {
          if (!changedAfter(terms, seq)) evict(terms, scope);
        } else {
          if (entry.op === "replace" && terms.length > 1) {
            for (const fact of Array.from(mirror.values())) {
              if (!samePrefix(fact.terms, terms) || factKey(fact.terms) === key || changedAfter(fact.terms, seq)) continue;
              evict(fact.terms, fact.scope);
            }
          }
          if (changedAfter(terms, seq)) {
            // The later entry for this fact already decided.
          } else if (replacedAfter(terms, seq)) {
            evict(terms, scope);
          } else {
            keep(terms, scope);
          }
        }
        if (seq > 0) {
          outbox.push(entry);
          holdKey(key);
        }
      }
    }, db);
    updatePending();
  };
  const applyLocal = (entries: LogEntry[]) => {
    applyLog(entries);
    pushNow();
  };

  /** Bring a subscription's slice of the local mirror into memory. */
  const loadFromMirror = (sub: Subscription) => {
    applyFacts(() => {
      for (const fact of mirror.values()) {
        if (sub.compiled.matches(fact.terms, fact.scope)) db.withScope(fact.scope, () => db.insert(...fact.terms));
      }
    }, db);
  };

  /** Drop facts from memory that no remaining subscription covers; the mirror keeps them. */
  const unloadOrphans = (released: Subscription) => {
    applyFacts(() => {
      for (const fact of mirror.values()) {
        if (!released.compiled.matches(fact.terms, fact.scope) || matchesActive(fact.terms, fact.scope, released)) continue;
        db.drop(...fact.terms);
      }
    }, db);
  };

  /** Forget what the mirror holds for a filter the server refused and no tab's remaining subscription covers, so a reload cannot show it again. */
  const purgeRefused = (compiled: CompiledFilter) => {
    const changes: SyncChange[] = [];
    for (const fact of Array.from(mirror.values())) {
      if (!compiled.matches(fact.terms, fact.scope) || matchesRemote(fact.terms, fact.scope)) continue;
      forget(fact.terms, true);
      changes.push({ op: "delete", terms: fact.terms, scope: fact.scope });
    }
    if (changes.length > 0) post({ t: "state", changes });
  };

  /**
   * Remember how far each caught-up subscription has seen, as `<log>:<seq>`, so a later connection to the
   * same log can ask for a replay; seqs from another log (a server restarted on fresh storage) mean nothing.
   */
  const recordSeq = (seq: number) => {
    if (log === null) return;
    const position = `${log}:${seq}`;
    write((w) => {
      for (const [id, sub] of remote) if (sub.synced) w.meta[`sub:${id}`] = position;
    });
  };

  /** Forget acknowledged outbox entries; the leader also trims them from storage and tells the other tabs. */
  const retire = (upTo: number) => {
    const done = outbox.filter((e) => e.seq > 0 && e.seq <= upTo);
    outbox = outbox.filter((e) => !(e.seq > 0 && e.seq <= upTo));
    for (const entry of done) releaseKey(factKey(entry.terms));
    lastAcked = Math.max(lastAcked, upTo);
    if (leading) {
      write((w) => (w.meta.acked = String(lastAcked)));
      flushWrites();
      writing = writing.then(() => storage.trimLog(upTo)).catch((e) => console.error("[jam] sync outbox trim failed", e));
      post({ t: "acked", upTo });
    }
    updatePending();
    if (outbox.length === 0) {
      for (const resolve of drainWaiters.splice(0)) resolve();
    }
  };

  // --- leadership ---
  let leading = false;
  let lead: Lead | null = null;
  let disposed = false;

  /** `ready` resolves and the shape fact is set the first time a subscription settles. */
  const settle = (sub: Subscription) => {
    sub.synced = true;
    if (!sub.resolved) {
      sub.resolved = true;
      setStatusFact(SYNC_STATUS_FACT, "shape", sub.compiled.id, "ready", true);
      sub.resolveReady();
    }
    updateStatus();
  };

  const markReady = (sub: Subscription) => {
    if (sub.denied) {
      sub.denied = false;
      transaction(() => db.drop(SYNC_STATUS_FACT, "shape", sub.compiled.id, "error", _));
      // The state that re-admitted it reached the mirror while the denial kept it out of memory.
      loadFromMirror(sub);
    }
    settle(sub);
  };

  /** A denied subscription settles like a ready one, holding nothing, and reports why. */
  const markDenied = (sub: Subscription, error: string) => {
    sub.denied = true;
    unloadOrphans(sub);
    setStatusFact(SYNC_STATUS_FACT, "shape", sub.compiled.id, "error", error);
    settle(sub);
  };

  const markRemoteReady = (id: string, sub: RemoteSubscription) => {
    sub.synced = true;
    post({ t: "ready", id });
    const own = subscriptions.get(id);
    if (own) markReady(own);
  };

  const want = (tab: string, id: string, compiled: CompiledFilter) => {
    let sub = remote.get(id);
    if (!sub) {
      sub = { compiled, tabs: new Set(), synced: false };
      remote.set(id, sub);
      if (connected) void subscribeRemote(id, sub);
    }
    sub.tabs.add(tab);
    if (!sub.synced) return;
    if (tab !== me) post({ t: "ready", id });
    else {
      const own = subscriptions.get(id);
      if (own) markReady(own);
    }
  };

  const drop = (tab: string, id: string) => {
    const sub = remote.get(id);
    if (!sub) return;
    sub.tabs.delete(tab);
    if (sub.tabs.size > 0) return;
    remote.delete(id);
    sendMessage({ type: "unsubscribe", id });
  };

  const becomeLeader = () => {
    leading = true;
    disconnected(false);
    remote.clear();
    if (unwritten.size > 0) {
      write((w) => {
        for (const key of unwritten) {
          const fact = mirror.get(key);
          if (fact) w.upserts.set(key, fact);
          else w.deletes.set(key, JSON.parse(key) as Fact);
        }
      });
      unwritten.clear();
    }
    for (const [id, sub] of subscriptions) want(me, id, sub.compiled);
    post({ t: "lead", tab: me });
    connect();
  };

  const handleTab = (message: TabMessage) => {
    if (disposed) return;
    switch (message.t) {
      case "hello":
        if (!leading) return;
        postConn();
        if (lastAcked > 0) post({ t: "acked", upTo: lastAcked });
        pushNow();
        return;
      case "lead":
        if (leading) return;
        disconnected(false);
        for (const [id, sub] of subscriptions) {
          post({ t: "want", tab: me, id, filter: serializeFilter(sub.compiled.filter) });
        }
        return;
      case "want":
        if (leading) want(message.tab, message.id, compileFilter(parseFilter(JSON.parse(message.filter))));
        return;
      case "drop":
        if (leading) drop(message.tab, message.id);
        return;
      case "bye":
        if (!leading) return;
        for (const id of Array.from(remote.keys())) drop(message.tab, id);
        // A tab that left may have stored a write it never got to announce.
        pushNow();
        return;
      case "conn":
        if (leading) return;
        if (message.open) {
          connected = true;
          lost = false;
          updateStatus();
        } else disconnected(message.lost);
        return;
      case "state":
        if (!leading) applyChanges(message.changes);
        return;
      case "ready": {
        const sub = subscriptions.get(message.id);
        if (sub && !leading) markReady(sub);
        return;
      }
      case "denied": {
        const sub = subscriptions.get(message.id);
        if (sub && !leading) markDenied(sub, message.error);
        return;
      }
      case "error":
        if (!leading) setError(message.message);
        return;
      case "local":
        applyLocal(message.entries);
        return;
      case "acked":
        if (!leading) retire(message.upTo);
        return;
    }
  };

  // --- connection (leader only) ---
  let socket: SyncWebSocket | null = null;
  /** The id of the log behind the current connection, once its `hello` has arrived; subscriptions wait for it. */
  let log: string | null = null;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let inflight: { id: number; upTo: number } | null = null;
  let nextPushId = 1;
  /** The outbox is being read from storage for a push; another push was asked for meanwhile. */
  let reading = false;
  let pushAgain = false;
  const drainWaiters: Array<() => void> = [];

  const sendMessage = (message: ClientMessage) => {
    if (!socket || !connected) return;
    socket.send(JSON.stringify(message));
  };

  /** Subscribe on the server, resuming from the recorded position when it was taken on this very log; a bare seq predates log ids. */
  const subscribeRemote = async (id: string, sub: RemoteSubscription) => {
    const current = log;
    if (current === null) return;
    await settled();
    const position = await storage.getMeta(`sub:${id}`);
    if (!connected || log !== current || remote.get(id) !== sub) return;
    const prefix = `${current}:`;
    sendMessage({
      type: "subscribe",
      id,
      filter: JSON.parse(serializeFilter(sub.compiled.filter)),
      since: position?.startsWith(prefix) ? Number(position.slice(prefix.length)) : undefined,
    });
  };

  /** Push everything in the shared outbox, in the order storage assigned; entries this tab has not heard of yet are applied first. */
  const pushNow = () => {
    if (!leading || !connected || inflight) return;
    if (reading) {
      pushAgain = true;
      return;
    }
    reading = true;
    flushWrites();
    writing
      .then(() => storage.readLog(0))
      .then((entries) => {
        reading = false;
        const again = pushAgain;
        pushAgain = false;
        if (!connected || inflight) return;
        applyLog(entries);
        if (entries.length === 0) {
          if (again) pushNow();
          return;
        }
        inflight = { id: nextPushId++, upTo: entries[entries.length - 1].seq };
        sendMessage({
          type: "push",
          id: inflight.id,
          changes: entries.map((e) => ({ op: e.op, terms: e.terms, scope: e.scope })),
        });
      })
      .catch((e) => {
        reading = false;
        console.error("[jam] sync outbox read failed", e);
      });
  };

  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case "hello":
        log = message.log;
        for (const [id, sub] of remote) void subscribeRemote(id, sub);
        pushNow();
        return;
      case "snapshot": {
        const sub = remote.get(message.id);
        if (!sub) return;
        applyChanges(snapshotChanges(sub, message.facts));
        markRemoteReady(message.id, sub);
        recordSeq(message.seq);
        return;
      }
      case "replay": {
        const sub = remote.get(message.id);
        if (!sub) return;
        applyChanges(message.changes);
        markRemoteReady(message.id, sub);
        recordSeq(message.seq);
        return;
      }
      case "denied": {
        const sub = remote.get(message.id);
        if (!sub) return;
        // Nothing to resume on the next connection; a later `want` asks again and starts from a snapshot.
        remote.delete(message.id);
        write((w) => (w.meta[`sub:${message.id}`] = undefined));
        post({ t: "denied", id: message.id, error: message.error });
        const own = subscriptions.get(message.id);
        if (own) markDenied(own, message.error);
        purgeRefused(sub.compiled);
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
        const error = message.type === "reject" ? message.error : null;
        setError(error);
        post({ t: "error", message: error });
        retire(done.upTo);
        pushNow();
        return;
      }
    }
  };

  const scheduleReconnect = () => {
    disconnected(true);
    postConn();
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
      connected = true;
      lost = false;
      attempts = 0;
      updateStatus();
      postConn();
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
      log = null;
      inflight = null;
      for (const sub of remote.values()) sub.synced = false;
      scheduleReconnect();
    };
  };

  // --- write side ---
  const unobserve = db.observe((type, key, fact, info) => {
    if (isApplying() || !shouldSync(fact)) return;
    if (type === "add") remember(fact, info.scope, true);
    else forget(fact, true);
    const entry: LogEntry = {
      seq: 0,
      op: type === "delete" ? "delete" : info.replace ? "replace" : "upsert",
      terms: fact,
      scope: info.scope,
    };
    write((w) => {
      w.announce.push(entry);
      if (url) w.log.push(entry);
    });
    if (!url) return;
    outbox.push(entry);
    holdKey(key);
    updatePending();
  });

  // --- start ---
  applyLog(storedLog, true);
  updateStatus();
  updatePending();
  started = true;
  for (const message of early.splice(0)) handleTab(message as TabMessage);
  post({ t: "hello", tab: me });
  if (url) {
    lead = tabs.lead();
    lead.acquired.then(
      () => {
        if (!disposed) becomeLeader();
      },
      (e: unknown) => console.error("[jam] sync: could not request the lead", e),
    );
  }
  const onHide = () => post({ t: "bye", tab: me });
  const onShow = (event: { persisted?: boolean }) => {
    if (!event.persisted || leading) return;
    for (const [id, sub] of subscriptions) post({ t: "want", tab: me, id, filter: serializeFilter(sub.compiled.filter) });
  };
  const page = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
  page?.addEventListener("pagehide", onHide);
  page?.addEventListener("pageshow", onShow);

  // --- handle ---
  const subscribe = (filter: FactFilter = {}): FactSubscription => {
    const compiled = compileFilter(filter);
    const id = compiled.id;
    let sub = subscriptions.get(id);
    if (!sub) {
      let resolveReady!: () => void;
      const ready = new Promise<void>((resolve) => (resolveReady = resolve));
      sub = { compiled, refs: 0, ready, resolveReady, resolved: false, synced: false, denied: false };
      subscriptions.set(id, sub);
      loadFromMirror(sub);
      if (!url) markReady(sub);
      else if (leading) want(me, id, compiled);
      else post({ t: "want", tab: me, id, filter: serializeFilter(compiled.filter) });
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
        if (leading) drop(me, id);
        else post({ t: "drop", tab: me, id });
        unloadOrphans(owned);
        transaction(() => {
          db.drop(SYNC_STATUS_FACT, "shape", id, "ready", _);
          db.drop(SYNC_STATUS_FACT, "shape", id, "error", _);
        });
        updateStatus();
        await settled();
      },
    };
  };
  const follow = (patterns: Pattern[], wanted: (matches: Bindings[]) => FactFilter[]): (() => Promise<void>) => {
    if (disposed) throw new Error("sync: disposed");
    const index = db.index(...patterns);
    let current = new Map<string, FactSubscription>();
    let generation = 0;
    const inflight = new Set<Promise<void>>();

    const apply = async (filters: FactFilter[]) => {
      const gen = ++generation;
      const next = new Map<string, FactSubscription>();
      const added: FactSubscription[] = [];
      for (const filter of filters) {
        const { id } = compileFilter(filter);
        if (next.has(id)) continue;
        const kept = current.get(id);
        if (kept) {
          next.set(id, kept);
        } else {
          const subscription = subscribe(filter);
          next.set(id, subscription);
          added.push(subscription);
        }
      }
      await Promise.all(added.map((s) => s.ready));
      if (gen !== generation) {
        await Promise.all(added.map((s) => s.dispose()));
        return;
      }
      const previous = current;
      current = next;
      await Promise.all(Array.from(previous, ([id, s]) => (next.has(id) ? undefined : s.dispose())));
    };

    const stopReaction = reaction(
      () => index.get(),
      (matches) => {
        const run: Promise<void> = Promise.resolve()
          .then(() => apply(wanted(matches)))
          .catch((e) => console.error("[jam] sync: follow failed", e))
          .finally(() => inflight.delete(run));
        inflight.add(run);
      },
      { fireImmediately: true, equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );
    return async () => {
      stopReaction();
      generation++;
      await Promise.all(inflight);
      const held = current;
      current = new Map();
      await Promise.all(Array.from(held.values(), (s) => s.dispose()));
    };
  };

  return {
    subscribe,
    follow,
    tab: me,
    get connected() {
      return connected;
    },
    get leading() {
      return leading;
    },
    async flush() {
      await settled();
      if (!url || !connected || outbox.length === 0) return;
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
      page?.removeEventListener("pagehide", onHide);
      page?.removeEventListener("pageshow", onShow);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = socket;
      socket = null;
      connected = false;
      ws?.close();
      for (const resolve of drainWaiters.splice(0)) resolve();
      transaction(() => db.revokeOwner(owner));
      // The last writes land and are announced before this tab leaves the channel.
      await settled();
      if (leading) post({ t: "conn", open: false, lost: false });
      else post({ t: "bye", tab: me });
      lead?.release();
      closed = true;
      tabs.close();
      if (ownsStorage) await storage.close();
    },
  };
}
