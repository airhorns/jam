// FactDB — the facade over the wasm fact engine. Facts, ownership, scopes and
// incrementally maintained queries live in the engine; this layer interns
// terms, names owners, keeps the side-channel refs, and wires query handles
// into the reactive scheduler.

import {
  AGG_COUNT,
  AGG_MAX,
  AGG_MIN,
  AGG_SUM,
  Engine,
  NONE,
  PRED_CONTAINS,
  PRED_CONTAINS_CI,
  PRED_EQ,
  PRED_GE,
  PRED_GT,
  PRED_LE,
  PRED_LT,
  PRED_NE,
  PRED_STARTS_WITH,
  PRED_STARTS_WITH_CI,
  ROOT_OWNER,
  VAR_BASE,
  WILD,
  _,
  compareTerms,
  factKey,
  type Clause,
  type EngineStats,
  type Predicate,
  type QueryHandle,
  type QuerySpec,
  type Sort,
} from "@jam/engine";
import { isTracking, markDirty, onWrite, recordRead, registerDrainer, type Dependency, type Effect } from "./reactive";

export type Term = string | number | boolean;
export type Fact = Term[];
export { _, factKey, GLOBAL_SCOPE } from "@jam/engine";
export type { EngineStats, Wildcard } from "@jam/engine";

export interface DBStats extends EngineStats {
  /** Named owners, the root included. */
  namedOwners: number;
  /** Maintained `index()` queries. */
  maintainedIndexes: number;
  /** Live `watch()` subscriptions. */
  watches: number;
  /** Fact listeners registered through `observe()`. */
  listeners: number;
  /** Values held in `refs`. */
  refs: number;
}

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

// --- Query clauses ---

export type ComparisonOp = "=" | "!=" | "<" | "<=" | ">" | ">=" | "contains" | "startsWith" | "icontains" | "istartsWith";

export interface PredicateSpec {
  lhs: BindingMarker;
  op: ComparisonOp;
  rhs: Term | BindingMarker;
}

/** Rows for which `pattern` has a match are hidden. */
export interface NotClause {
  __clause: "not";
  pattern: Pattern;
}

/** A row passes when any alternative holds; several `where` clauses all have to pass. */
export interface WhereClause {
  __clause: "where";
  any: PredicateSpec[];
}

export interface OrderClause {
  __clause: "order";
  by: BindingMarker;
  descending: boolean;
}

export interface OffsetClause {
  __clause: "offset";
  count: number;
}

export interface LimitClause {
  __clause: "limit";
  count: number;
}

export type AggregateOp = "count" | "sum" | "min" | "max";

/** Folds the rows into one `output` value per distinct `group`; the result rows are `group…, output`. */
export interface AggregateClause {
  __clause: "aggregate";
  op: AggregateOp;
  input: BindingMarker | null;
  output: BindingMarker;
  group: BindingMarker[];
}

export type QueryClause = Pattern | NotClause | WhereClause | OrderClause | OffsetClause | LimitClause | AggregateClause;

const PRED_CODES: Record<ComparisonOp, number> = {
  "=": PRED_EQ,
  "!=": PRED_NE,
  "<": PRED_LT,
  "<=": PRED_LE,
  ">": PRED_GT,
  ">=": PRED_GE,
  contains: PRED_CONTAINS,
  startsWith: PRED_STARTS_WITH,
  icontains: PRED_CONTAINS_CI,
  istartsWith: PRED_STARTS_WITH_CI,
};

const AGG_CODES: Record<AggregateOp, number> = { count: AGG_COUNT, sum: AGG_SUM, min: AGG_MIN, max: AGG_MAX };

function queryKey(clauses: QueryClause[]): string {
  return JSON.stringify(clauses, (_key, value: unknown) =>
    value === _ ? "__WILD__" : isBinding(value) ? `__BIND__${value.name}` : value,
  );
}

/** @internal */
export interface CompiledQuery {
  spec: QuerySpec;
  /** One name per output column. */
  names: string[];
  order: Sort[];
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
  /** Valid while `handle` is registered; literal ids are re-interned on each attach. */
  private compiled: CompiledQuery | null = null;

  constructor(
    private readonly db: FactDB,
    readonly key: string,
    private readonly clauses: QueryClause[],
  ) {}

  get(): Bindings[] {
    if (isTracking()) {
      recordRead(this);
      this.ensureHandle();
    }
    if (!this.handle || !this.compiled) return this.db.evaluate(this.db.compile(this.clauses));
    this.db.drain();
    if (this.version !== this.handle.version) {
      this.version = this.handle.version;
      this.cached = this.db.decodeRows(this.handle.rows.values(), this.compiled);
    }
    return this.cached;
  }

  private ensureHandle(): void {
    if (this.handle) return;
    this.compiled = this.db.compile(this.clauses);
    this.handle = this.db.attach(this, this.compiled.spec);
    this.version = -1;
  }

  onIdle(): void {
    if (!this.handle) return;
    this.db.detach(this, this.handle);
    this.handle = null;
    this.compiled = null;
    this.version = -1;
    this.cached = [];
  }
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
  /** Scope names, interned when a write happens so a flush in between cannot free the id. */
  private scopeStack: (string | null)[] = [null];

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
    const scope = this.scopeStack[this.scopeStack.length - 1];
    return scope === null ? NONE : this.engine.id(scope);
  }

  /** Facts written inside `fn` belong to the sync partition `scope`. */
  withScope<T>(scope: string, fn: () => T): T {
    this.scopeStack.push(scope);
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
    this.scopeStack = [null];
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

  /** The engine's size plus this layer's bookkeeping; never tracked. */
  stats(): DBStats {
    return {
      ...this.engine.stats(),
      namedOwners: this.ownerIds.size,
      maintainedIndexes: this.indexes.size,
      watches: this.dependencies.size,
      listeners: this.listeners.length,
      refs: this.refs.size,
    };
  }

  /** Point-in-time query, never tracked. */
  query(...clauses: QueryClause[]): Bindings[] {
    if (clauses.length === 0) return [];
    return this.evaluate(this.compile(clauses));
  }

  /** A maintained query for these clauses; `get()` inside an effect subscribes it. */
  index(...clauses: QueryClause[]): IndexHandle {
    const key = queryKey(clauses);
    let index = this.indexes.get(key);
    if (!index) {
      index = new Index(this, key, clauses);
      this.indexes.set(key, index);
    }
    return index;
  }

  /**
   * Subscribe a dependency to raw row changes of several maintained queries.
   * Effects reading `dep` re-run when any of them changes; `onRow` sees each row as it appears or leaves.
   */
  watch(queries: QueryClause[][], onRow: (set: number, row: Uint32Array, added: boolean) => void): { dep: Dependency; dispose(): void } {
    const dep: Dependency = { subscribers: new Set() };
    const handles: QueryHandle[] = [];
    const unsubscribes: (() => void)[] = [];
    queries.forEach((clauses, set) => {
      const handle = this.engine.register(this.compile(clauses).spec);
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

  /**
   * @internal Variables are numbered by first appearance in the positive patterns; every
   * other clause has to refer to one of them. Literal ids are only good until the next flush
   * unless a registered query holds them.
   */
  compile(clauses: QueryClause[]): CompiledQuery {
    const names: string[] = [];
    const patterns: Clause[] = [];
    for (const clause of clauses) {
      if (!Array.isArray(clause)) continue;
      patterns.push(
        clause.map((t) => {
          if (t === _) return WILD;
          if (!isBinding(t)) return this.engine.id(t);
          let i = names.indexOf(t.name);
          if (i < 0) i = names.push(t.name) - 1;
          return VAR_BASE + i;
        }),
      );
    }
    const lookup = (marker: BindingMarker): number => {
      const i = names.indexOf(marker.name);
      return i < 0 ? WILD : VAR_BASE + i;
    };
    const bound = (marker: BindingMarker, what: string): number => {
      const word = lookup(marker);
      if (word === WILD) throw new Error(`${what} $.${marker.name} is not bound by a pattern`);
      return word;
    };
    const spec: QuerySpec = { patterns };
    const not: Clause[] = [];
    const where: Predicate[][] = [];
    const order: OrderClause[] = [];
    let aggregate: AggregateClause | undefined;
    for (const clause of clauses) {
      if (Array.isArray(clause)) continue;
      switch (clause.__clause) {
        case "not":
          not.push(clause.pattern.map((t) => (t === _ ? WILD : isBinding(t) ? lookup(t) : this.engine.id(t))));
          break;
        case "where":
          where.push(
            clause.any.map(({ lhs, op, rhs }) => ({
              lhs: bound(lhs, "predicate variable"),
              op: PRED_CODES[op],
              rhs: isBinding(rhs) ? bound(rhs, "predicate variable") : this.engine.id(rhs),
            })),
          );
          break;
        case "order":
          order.push(clause);
          break;
        case "offset":
          spec.offset = clause.count;
          break;
        case "limit":
          spec.limit = clause.count;
          break;
        case "aggregate":
          if (aggregate) throw new Error("a query has at most one aggregate");
          aggregate = clause;
          spec.aggregate = {
            op: AGG_CODES[clause.op],
            input: clause.input ? bound(clause.input, "aggregate input") : WILD,
            group: clause.group.map((g) => bound(g, "group key")),
          };
          break;
      }
    }
    if (not.length > 0) spec.not = not;
    if (where.length > 0) spec.where = where;
    const output = aggregate ? [...aggregate.group.map((g) => g.name), aggregate.output.name] : names;
    if (aggregate && new Set(output).size !== output.length) {
      throw new Error(`aggregate output $.${aggregate.output.name} repeats a group key`);
    }
    const sorts = order.map(({ by, descending }) => {
      const column = output.indexOf(by.name);
      if (column < 0) throw new Error(`order key $.${by.name} is not in the query's output`);
      return { column, descending };
    });
    if (sorts.length > 0) spec.order = sorts;
    return { spec, names: output, order: sorts };
  }

  /** @internal one-off evaluation; the engine returns rows in assertion order, so ordered queries sort here */
  evaluate(compiled: CompiledQuery): Bindings[] {
    const { arity, data, count } = this.engine.query(compiled.spec);
    const { names, order } = compiled;
    const out = new Array<Bindings>(count);
    if (order.length === 0) {
      for (let r = 0; r < count; r++) out[r] = this.bindingsOf(data, r * arity, names);
      return out;
    }
    const rows = Array.from({ length: count }, (_row, r) => r);
    rows.sort((a, b) => {
      for (const { column, descending } of order) {
        const x = data[a * arity + column];
        const y = data[b * arity + column];
        if (x === y) continue;
        const c = compareTerms(this.engine.term(x), this.engine.term(y));
        if (c !== 0) return descending ? -c : c;
      }
      return a - b;
    });
    for (let r = 0; r < count; r++) out[r] = this.bindingsOf(data, rows[r] * arity, names);
    return out;
  }

  /**
   * @internal Rows of a maintained query in result order: the query's sort keys, then the order
   * the facts matching the first pattern were asserted, so a list keyed by entity keeps its
   * order when other attributes change.
   */
  decodeRows(rows: Iterable<Uint32Array>, compiled: CompiledQuery): Bindings[] {
    const { names, order } = compiled;
    const sorted = Array.from(rows).sort(this.engine.rowComparator(names.length, order));
    const out = new Array<Bindings>(sorted.length);
    for (let r = 0; r < sorted.length; r++) out[r] = this.bindingsOf(sorted[r], 0, names);
    return out;
  }

  private bindingsOf(row: ArrayLike<number>, start: number, names: string[]): Bindings {
    const bindings: Bindings = {};
    for (let v = 0; v < names.length; v++) bindings[names[v]] = this.engine.term(row[start + v]);
    return bindings;
  }

  /** @internal */
  attach(index: Index, spec: QuerySpec): QueryHandle {
    const handle = this.engine.register(spec);
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
