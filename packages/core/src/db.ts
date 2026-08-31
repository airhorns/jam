// FactDB — the facade over the wasm fact engine. Facts, ownership, scopes and
// incrementally maintained queries live in the engine; this layer interns
// terms, names owners, keeps the side-channel refs, and wires query handles
// into the reactive scheduler.

import { Engine, NONE, ROOT_OWNER, VAR_BASE, WILD, _, factKey, type Clause, type QueryHandle } from "@jam/engine";
import { isTracking, markDirty, onWrite, recordRead, registerDrainer, type Dependency, type Effect } from "./reactive";

export type Term = string | number | boolean;
export type Fact = Term[];
export { _, factKey, GLOBAL_SCOPE } from "@jam/engine";
export type { Wildcard } from "@jam/engine";

export type FactChange = "add" | "delete";
export interface FactChangeInfo {
  /** Sync partition of the fact. */
  scope: string;
  /** Set on the "add" emitted by replace(), so stores can replace the whole attribute. */
  replace?: true;
}
/** Reports durable changes: facts the root owner gained or lost. Claimed facts are never reported. */
export type FactListener = (type: FactChange, key: string, fact: Fact, info: FactChangeInfo) => void;

// --- Pattern types ---

export interface BindingMarker {
  __binding: true;
  name: string;
}

export type PatternTerm = Term | BindingMarker | typeof _;
export type Pattern = PatternTerm[];
export type Bindings = Record<string, Term>;

export const $: Record<string, BindingMarker> = new Proxy({} as Record<string, BindingMarker>, {
  get(_target, prop: string | symbol): BindingMarker | undefined {
    if (typeof prop === "symbol") return undefined;
    return { __binding: true, name: prop };
  },
});

export function isBinding(x: unknown): x is BindingMarker {
  return x != null && typeof x === "object" && (x as BindingMarker).__binding === true;
}

/** Match one fact against one pattern, binding `$` markers; null when it doesn't match. */
export function matchPattern(pattern: Pattern, fact: Fact): Bindings | null {
  const len = pattern.length;
  if (len !== fact.length) return null;
  for (let i = 0; i < len; i++) {
    const p = pattern[i];
    if (p === _ || (p !== null && typeof p === "object")) continue;
    if (p !== fact[i]) return null;
  }
  const bindings: Bindings = {};
  for (let i = 0; i < len; i++) {
    const p = pattern[i];
    if (!isBinding(p)) continue;
    if (p.name in bindings) {
      if (bindings[p.name] !== fact[i]) return null;
    } else {
      bindings[p.name] = fact[i];
    }
  }
  return bindings;
}

function patternsKey(patterns: Pattern[]): string {
  return JSON.stringify(
    patterns.map((p) => p.map((t) => (t === _ ? "__WILD__" : isBinding(t) ? `__BIND__${t.name}` : t))),
  );
}

interface CompiledPatterns {
  clauses: Clause[];
  names: string[];
}

export const ROOT_OWNER_ID = "__root__";

/** A maintained query: `get()` returns the current bindings and, inside an effect, subscribes it. */
export interface IndexHandle {
  get(): Bindings[];
}

class Index implements Dependency, IndexHandle {
  readonly subscribers = new Set<Effect>();
  handle: QueryHandle | null = null;
  private version = -1;
  private cached: Bindings[] = [];

  constructor(
    private readonly db: FactDB,
    readonly key: string,
    readonly compiled: CompiledPatterns,
  ) {}

  get(): Bindings[] {
    if (isTracking()) {
      recordRead(this);
      this.ensureHandle();
    }
    if (!this.handle) return this.db.evaluate(this.compiled);
    this.db.drain();
    if (this.version !== this.handle.version) {
      this.version = this.handle.version;
      this.cached = this.db.decodeRows(this.handle.rows.values(), this.compiled.names);
    }
    return this.cached;
  }

  private ensureHandle(): void {
    if (this.handle) return;
    this.handle = this.db.attach(this, this.compiled.clauses);
    this.version = -1;
  }

  onIdle(): void {
    if (!this.handle) return;
    this.db.detach(this, this.handle);
    this.handle = null;
    this.version = -1;
    this.cached = [];
  }
}

function compareRows(a: Uint32Array, b: Uint32Array): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// --- FactDB ---

export class FactDB {
  readonly engine = new Engine();

  /** Side-channel for non-serializable values (function refs for event handlers). */
  readonly refs = new Map<string, unknown>();

  private readonly ownerIds = new Map<string, number>([[ROOT_OWNER_ID, ROOT_OWNER]]);
  private readonly ownerNames = new Map<number, string>([[ROOT_OWNER, ROOT_OWNER_ID]]);
  private readonly ownerChildren = new Map<number, Set<number>>();
  private readonly ownerRefs = new Map<number, Set<string>>();
  private readonly refOwners = new Map<string, Set<number>>();
  private readonly ownerCounters = new Map<string, number>();
  private ownerStack: number[] = [ROOT_OWNER];
  private scopeStack: number[] = [NONE];

  private readonly indexes = new Map<string, Index>();
  private readonly unregisterDrainer: () => void;
  private readonly indexesByHandle = new Map<QueryHandle, Set<Index>>();
  private readonly dependencies = new Set<{ handles: QueryHandle[]; dep: Dependency }>();
  private listeners: FactListener[] = [];
  private pendingEvents = false;

  constructor() {
    this.engine.onFact((event) => {
      if (this.listeners.length === 0) return;
      const key = factKey(event.terms);
      const info: FactChangeInfo = event.replace ? { scope: event.scope, replace: true } : { scope: event.scope };
      for (const listener of this.listeners.slice()) {
        try {
          listener(event.type, key, event.terms, info);
        } catch (e) {
          console.error("[jam] fact listener threw", e);
        }
      }
    });
    this.unregisterDrainer = registerDrainer(() => this.drain());
  }

  // --- owners ---

  private currentOwner(): number {
    return this.ownerStack[this.ownerStack.length - 1];
  }

  getCurrentOwnerId(): string {
    return this.ownerNames.get(this.currentOwner()) ?? ROOT_OWNER_ID;
  }

  private ensureOwner(name: string, parent = this.currentOwner()): number {
    let id = this.ownerIds.get(name);
    if (id !== undefined) return id;
    id = this.engine.createOwner(parent);
    this.ownerIds.set(name, id);
    this.ownerNames.set(id, name);
    let siblings = this.ownerChildren.get(parent);
    if (!siblings) this.ownerChildren.set(parent, (siblings = new Set()));
    siblings.add(id);
    return id;
  }

  ownerExists(name: string): boolean {
    return this.ownerIds.has(name);
  }

  createChildOwner(parentId: string, label: string): string {
    const parent = this.ensureOwner(parentId, ROOT_OWNER);
    const counterKey = `${parentId}/${label}`;
    const next = (this.ownerCounters.get(counterKey) ?? 0) + 1;
    this.ownerCounters.set(counterKey, next);
    const name = `${parentId}/${label}:${next}`;
    this.ensureOwner(name, parent);
    return name;
  }

  withOwnerScope<T>(ownerId: string, fn: () => T): T {
    this.ownerStack.push(this.ensureOwner(ownerId));
    try {
      return fn();
    } finally {
      this.ownerStack.pop();
    }
  }

  revokeOwner(ownerId: string): void {
    const id = this.ownerIds.get(ownerId);
    if (id === undefined) return;
    if (id === ROOT_OWNER) throw new Error("the root owner cannot be revoked");
    this.forgetOwner(id);
    this.engine.revoke(id);
    this.changed();
  }

  private forgetOwner(id: number): void {
    for (const child of this.ownerChildren.get(id) ?? []) this.forgetOwner(child);
    this.ownerChildren.delete(id);
    for (const key of this.ownerRefs.get(id) ?? []) {
      const owners = this.refOwners.get(key);
      owners?.delete(id);
      if (owners && owners.size === 0) {
        this.refOwners.delete(key);
        this.refs.delete(key);
      }
    }
    this.ownerRefs.delete(id);
    const name = this.ownerNames.get(id);
    if (name !== undefined) this.ownerIds.delete(name);
    this.ownerNames.delete(id);
  }

  // --- scopes ---

  private currentScope(): number {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  /** Facts written inside `fn` belong to the sync partition `scope`. */
  withScope<T>(scope: string, fn: () => T): T {
    this.scopeStack.push(this.engine.id(scope));
    try {
      return fn();
    } finally {
      this.scopeStack.pop();
    }
  }

  scopeOf(...terms: Term[]): string {
    return this.engine.scopeOf(terms) ?? "";
  }

  /** Re-tag a fact's partition without notifying listeners. */
  setScope(fact: Fact, scope: string): void {
    this.engine.setScope(this.engine.id(scope), fact);
    this.changed();
  }

  // --- writes ---

  /** Hold a fact under the current owner; it leaves when every holder is revoked. */
  assert(...terms: Term[]): void {
    this.engine.assert(this.currentOwner(), this.currentScope(), terms);
    this.changed();
  }

  /** Hold a fact under the root owner: durable until dropped. */
  insert(...terms: Term[]): void {
    this.engine.assert(ROOT_OWNER, this.currentScope(), terms);
    this.changed();
  }

  drop(...terms: (Term | typeof _)[]): void {
    this.engine.drop(terms);
    this.changed();
  }

  /** Drop every fact sharing all but the last term, then insert. */
  replace(...terms: Term[]): void {
    if (terms.length < 2) throw new Error("replace() requires at least 2 terms");
    this.engine.replace(ROOT_OWNER, this.currentScope(), terms);
    this.changed();
  }

  /** Forget every fact and owner. Listeners are not notified. */
  clear(): void {
    for (const child of Array.from(this.ownerChildren.get(ROOT_OWNER) ?? [])) this.forgetOwner(child);
    this.ownerChildren.clear();
    this.refs.clear();
    this.refOwners.clear();
    this.ownerRefs.clear();
    this.ownerStack = [ROOT_OWNER];
    this.scopeStack = [NONE];
    this.engine.clear();
    this.changed();
  }

  /** Stop participating in flushes and release the engine's WASM memory; the database is unusable afterwards. */
  dispose(): void {
    this.unregisterDrainer();
    this.engine.free();
  }

  private changed(): void {
    this.pendingEvents = true;
    onWrite();
  }

  // --- reads ---

  /** Every live fact keyed by `factKey`; a snapshot for debugging and tests. */
  get facts(): Map<string, Fact> {
    const out = new Map<string, Fact>();
    for (const { terms } of this.engine.facts()) out.set(factKey(terms), terms);
    return out;
  }

  has(...terms: Term[]): boolean {
    return this.engine.has(terms);
  }

  /** Point-in-time query, never tracked. */
  query(...patterns: Pattern[]): Bindings[] {
    if (patterns.length === 0) return [];
    return this.evaluate(this.compile(patterns));
  }

  /** A maintained query for these patterns; `get()` inside an effect subscribes it. */
  index(...patterns: Pattern[]): IndexHandle {
    const key = patternsKey(patterns);
    let index = this.indexes.get(key);
    if (!index) {
      index = new Index(this, key, this.compile(patterns));
      this.indexes.set(key, index);
    }
    return index;
  }

  /**
   * Subscribe a dependency to raw row changes of several maintained queries.
   * Effects reading `dep` re-run when any of them changes; `onRow` sees each row as it appears or leaves.
   */
  watch(patternSets: Pattern[][], onRow: (set: number, row: Uint32Array, added: boolean) => void): { dep: Dependency; dispose(): void } {
    const dep: Dependency = { subscribers: new Set() };
    const handles: QueryHandle[] = [];
    const unsubscribes: (() => void)[] = [];
    patternSets.forEach((patterns, set) => {
      const handle = this.engine.register(this.compile(patterns).clauses);
      handles.push(handle);
      for (const row of handle.rows.values()) onRow(set, row, true);
      unsubscribes.push(handle.onRow((row, added) => onRow(set, row, added)));
    });
    const entry = { handles, dep };
    this.dependencies.add(entry);
    return {
      dep,
      dispose: () => {
        this.dependencies.delete(entry);
        for (const off of unsubscribes) off();
        for (const handle of handles) handle.release();
      },
    };
  }

  private compile(patterns: Pattern[]): CompiledPatterns {
    const names: string[] = [];
    const clauses = patterns.map((pattern) =>
      pattern.map((t) => {
        if (t === _) return WILD;
        if (isBinding(t)) {
          let i = names.indexOf(t.name);
          if (i < 0) i = names.push(t.name) - 1;
          return VAR_BASE + i;
        }
        return this.engine.id(t);
      }),
    );
    return { clauses, names };
  }

  /** @internal one-off evaluation */
  evaluate(compiled: CompiledPatterns): Bindings[] {
    const { nvars, data, count } = this.engine.query(compiled.clauses);
    const rows = new Array<Uint32Array>(count);
    for (let r = 0; r < count; r++) rows[r] = data.subarray(r * nvars, (r + 1) * nvars);
    return this.decodeRows(rows, compiled.names);
  }

  /**
   * @internal Rows ordered by the first-seen order of their bound values, first variable most
   * significant, so a list keyed by entity id keeps creation order when an attribute changes.
   */
  decodeRows(rows: Iterable<Uint32Array>, names: string[]): Bindings[] {
    const sorted = Array.from(rows).sort(compareRows);
    const out = new Array<Bindings>(sorted.length);
    for (let r = 0; r < sorted.length; r++) {
      const row = sorted[r];
      const bindings: Bindings = {};
      for (let v = 0; v < names.length; v++) bindings[names[v]] = this.engine.term(row[v]);
      out[r] = bindings;
    }
    return out;
  }

  /** @internal */
  attach(index: Index, clauses: Clause[]): QueryHandle {
    const handle = this.engine.register(clauses);
    let set = this.indexesByHandle.get(handle);
    if (!set) this.indexesByHandle.set(handle, (set = new Set()));
    set.add(index);
    return handle;
  }

  /** @internal */
  detach(index: Index, handle: QueryHandle): void {
    const set = this.indexesByHandle.get(handle);
    set?.delete(index);
    if (set && set.size === 0) this.indexesByHandle.delete(handle);
    this.indexes.delete(index.key);
    handle.release();
  }

  /** Apply queued writes, notify listeners, fold query deltas into handles and mark their effects dirty. */
  drain(): void {
    if (!this.pendingEvents) return;
    this.pendingEvents = false;
    const changed = this.engine.flush();
    if (changed.length === 0) return;
    const touched = new Set<QueryHandle>(changed);
    for (const handle of changed) {
      const indexes = this.indexesByHandle.get(handle);
      if (indexes) for (const index of indexes) markDirty(index);
    }
    for (const entry of this.dependencies) {
      if (entry.handles.some((h) => touched.has(h))) markDirty(entry.dep);
    }
  }

  // --- listeners ---

  observe(listener: FactListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // --- refs ---

  /** Store a non-serializable value; it is dropped with the current owner. */
  setRef(key: string, value: unknown): void {
    this.refs.set(key, value);
    const owner = this.currentOwner();
    if (owner === ROOT_OWNER) return;
    let owners = this.refOwners.get(key);
    if (!owners) this.refOwners.set(key, (owners = new Set()));
    owners.add(owner);
    let keys = this.ownerRefs.get(owner);
    if (!keys) this.ownerRefs.set(owner, (keys = new Set()));
    keys.add(key);
  }

  getRef(key: string): unknown {
    return this.refs.get(key);
  }

  deleteRef(key: string): void {
    this.refs.delete(key);
    for (const owner of this.refOwners.get(key) ?? []) this.ownerRefs.get(owner)?.delete(key);
    this.refOwners.delete(key);
  }
}

export const db = new FactDB();
