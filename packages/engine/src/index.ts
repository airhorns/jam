// @jam/engine — the typed surface over the wasm fact engine. Terms are interned
// once here and only ids cross the boundary; ops are batched into one packed
// array per flush and the engine answers with one packed array of events.
//
// A term id is stable while a fact or registered query uses the term. Otherwise
// it is only good until the next flush: the engine frees unused terms and
// reports them, and the mirror here forgets them so a reused id never resolves
// to a stale value. Interned ids should therefore be consumed right away, not
// cached across flushes.

import { JamEngine, wasmMemory } from "./wasm";
import {
  CLAUSE_AGGREGATE,
  CLAUSE_LIMIT,
  CLAUSE_NOT,
  CLAUSE_OFFSET,
  CLAUSE_ORDER,
  CLAUSE_PATTERN,
  CLAUSE_WHERE,
  EV_FACT,
  EV_FREE,
  EV_QUERY,
  FACT_ADDED,
  FACT_DURABLE,
  FACT_EXISTING,
  FACT_REPLACE,
  GLOBAL_SCOPE_ID,
  NONE,
  OP_ASSERT,
  OP_CLEAR,
  OP_DROP,
  OP_REPLACE,
  OP_REVOKE,
  OP_SET_SCOPE,
  ROOT_OWNER,
  STAT_FACT_SLOTS,
  STAT_FACTS,
  STAT_INDEX_BUCKETS,
  STAT_INDEXES,
  STAT_OWNERS,
  STAT_PENDING_EVENTS,
  STAT_QUERIES,
  STAT_RESULT_ROWS,
  STAT_ROUTES,
  STAT_TERM_SLOTS,
  STAT_TERMS,
  VAR_BASE,
  WILD,
} from "./wire";

export * from "./wire";

export type Term = string | number | boolean;
export type Fact = Term[];

/** Matches any term in a `drop`/`facts` pattern without binding it. */
export const _: unique symbol = Symbol("wildcard");
export type Wildcard = typeof _;

/** Facts with no scope belong to the global sync partition. */
export const GLOBAL_SCOPE = "";

export interface FactEvent {
  type: "add" | "delete";
  terms: Fact;
  scope: string;
  /** The root owner holds (or held) the fact. */
  durable: boolean;
  /** The add came from `replace`. */
  replace: boolean;
  /** The fact already existed and the root owner just attached to it. */
  existing: boolean;
}

export type FactEventListener = (event: FactEvent) => void;

/** One clause of a query: interned term ids, `VAR_BASE + i` for variable `i`, or `WILD`. */
export type Clause = number[];

/** `lhs` is a variable word, `op` a `PRED_*` code, `rhs` a variable word or term id. */
export interface Predicate {
  lhs: number;
  op: number;
  rhs: number;
}

/** `op` is an `AGG_*` code; `input` is a variable word, or `WILD` for count; `group` are variable words. */
export interface Aggregate {
  op: number;
  input: number;
  group: readonly number[];
}

/** `column` is a position in the output row, which for aggregates is `group…, value`. */
export interface Sort {
  column: number;
  descending: boolean;
}

/**
 * A query: rows are the variable bindings satisfying every positive pattern, with
 * no match for any `not` pattern and at least one alternative of every `where`
 * filter holding, optionally folded by one aggregate and cut to an ordered window.
 */
export interface QuerySpec {
  patterns: readonly Clause[];
  not?: readonly Clause[];
  where?: readonly (readonly Predicate[])[];
  aggregate?: Aggregate;
  order?: readonly Sort[];
  offset?: number;
  limit?: number;
}

export function isSpec(query: QuerySpec | readonly Clause[]): query is QuerySpec {
  return !Array.isArray(query);
}

/** Encode a spec as `n (kind len words…)…`, the form `jam_engine::Spec::unpack` reads. */
export function packSpec(query: QuerySpec | readonly Clause[]): Uint32Array {
  const spec: QuerySpec = isSpec(query) ? query : { patterns: query };
  const words: number[] = [0];
  let n = 0;
  const clause = (kind: number, body: readonly number[]) => {
    words.push(kind, body.length, ...body);
    n++;
  };
  for (const p of spec.patterns) clause(CLAUSE_PATTERN, p);
  for (const p of spec.not ?? []) clause(CLAUSE_NOT, p);
  for (const filter of spec.where ?? []) {
    const body: number[] = [];
    for (const { lhs, op, rhs } of filter) body.push(lhs, op, rhs);
    clause(CLAUSE_WHERE, body);
  }
  if (spec.aggregate) clause(CLAUSE_AGGREGATE, [spec.aggregate.op, spec.aggregate.input, ...spec.aggregate.group]);
  for (const { column, descending } of spec.order ?? []) clause(CLAUSE_ORDER, [VAR_BASE + column, descending ? 1 : 0]);
  if (spec.offset) clause(CLAUSE_OFFSET, [spec.offset]);
  if (spec.limit !== undefined) clause(CLAUSE_LIMIT, [spec.limit]);
  words[0] = n;
  return Uint32Array.from(words);
}

/** Width of the rows a query reports: its group keys plus the aggregate value, or every variable. */
export function specArity(query: QuerySpec | readonly Clause[]): number {
  if (isSpec(query) && query.aggregate) return query.aggregate.group.length + 1;
  return Engine.nvars(isSpec(query) ? query.patterns : query);
}

export type RowListener = (row: Uint32Array, added: boolean) => void;

/**
 * Where a row sits in result order — the assertion sequence of the fact matching the
 * query's first clause, or of a group's first row, or of a window entry — carried as
 * two words after the row's `arity` values. Ordered queries sort by their keys first.
 */
export function rowOrder(row: Uint32Array, arity: number): number {
  return row[arity] * 0x1_0000_0000 + row[arity + 1];
}

/** Sort rows by their order key; ties (only possible with wildcards in the first clause) fall back to the values. */
export function compareRows(arity: number): (a: Uint32Array, b: Uint32Array) => number {
  return (a, b) => {
    const hi = a[arity] - b[arity];
    if (hi !== 0) return hi;
    const lo = a[arity + 1] - b[arity + 1];
    if (lo !== 0) return lo;
    for (let i = 0; i < arity; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  };
}

/** The engine's total order over terms: booleans, then numbers (NaN last), then strings by code point. */
export function compareTerms(a: Term, b: Term): number {
  if (typeof a !== typeof b) return rank(a) - rank(b);
  if (typeof a === "string") return compareStrings(a, b as string);
  if (typeof a === "number") {
    const y = b as number;
    if (a < y) return -1;
    if (a > y) return 1;
    if (a === y) return 0;
    return Number(Number.isNaN(a)) - Number(Number.isNaN(y));
  }
  return Number(a) - Number(b);
}

function rank(term: Term): number {
  return typeof term === "boolean" ? 0 : typeof term === "number" ? 1 : 2;
}

function compareStrings(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x === y) continue;
    const xs = x >= 0xd800 && x <= 0xdfff;
    const ys = y >= 0xd800 && y <= 0xdfff;
    if (xs && !ys && y >= 0xe000) return 1;
    if (ys && !xs && x >= 0xe000) return -1;
    return x - y;
  }
  return a.length - b.length;
}

/**
 * A registered query's live result set. `rows` maps stable row ids to the `arity`
 * output values followed by the row's order key (see `rowOrder`); `version` bumps
 * whenever a row appears or leaves.
 */
export class QueryHandle {
  readonly rows = new Map<number, Uint32Array>();
  version = 0;
  released = false;
  private listeners: RowListener[] = [];

  constructor(
    private readonly engine: Engine,
    readonly qid: number,
    readonly arity: number,
  ) {}

  /** Called for every row that appears or leaves during a flush. */
  onRow(listener: RowListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** @internal */
  applyRow(rid: number, row: Uint32Array | null): void {
    if (row) {
      this.rows.set(rid, row);
      for (const listener of this.listeners) listener(row, true);
    } else {
      const old = this.rows.get(rid);
      if (!old) return;
      this.rows.delete(rid);
      for (const listener of this.listeners) listener(old, false);
    }
  }

  /** Drop one registration; the handle stays live while other registrations share it. */
  release(): void {
    if (this.released) return;
    this.engine.releaseHandle(this);
  }
}

export interface QueryResult {
  arity: number;
  /** `count * arity` term ids, row-major, in assertion order of the rows' first-clause facts. */
  data: Uint32Array;
  count: number;
}

export interface StoredFact {
  terms: Fact;
  scope: string;
}

export interface EngineStats {
  /** Live facts. */
  facts: number;
  /** Fact slots allocated so far, live or free. */
  factSlots: number;
  /** Terms some fact or query uses, plus any interned since the last two flushes. */
  terms: number;
  /** Term ids handed out so far, including freed ones awaiting reuse. */
  termSlots: number;
  /** Live owners, the root included. */
  owners: number;
  /** Secondary indexes built for query clauses. */
  indexes: number;
  /** Distinct fact prefixes plus the buckets of every index. */
  indexBuckets: number;
  /** Registered queries. */
  queries: number;
  /** Live result rows across every registered query. */
  resultRows: number;
  /** Clauses a changed fact may be checked against. */
  routes: number;
  /** Event words waiting for the next flush. */
  pendingEvents: number;
  /** Linear memory of the wasm module, shared by every engine in this process. */
  wasmMemoryBytes: number;
}

export class Engine {
  readonly raw: JamEngine;
  private readonly ids = new Map<Term, number>([
    [false, 0],
    [true, 1],
    ["", GLOBAL_SCOPE_ID],
  ]);
  private terms: (Term | undefined)[] = [false, true, ""];
  private ops = new Uint32Array(4096);
  private opLen = 0;
  private readonly handles = new Map<number, { handle: QueryHandle; refs: number }>();
  private readonly factListeners: FactEventListener[] = [];

  constructor() {
    this.raw = new JamEngine();
  }

  // --- terms ---

  id(term: Term): number {
    let id = this.ids.get(term);
    if (id === undefined) {
      id = typeof term === "string" ? this.raw.intern_str(term) : this.raw.intern_num(term as number);
      this.ids.set(term, id);
      this.terms[id] = term;
    }
    return id;
  }

  term(id: number): Term {
    const term = this.terms[id];
    if (term !== undefined) return term;
    switch (this.raw.term_kind(id)) {
      case 0:
        return (this.terms[id] = this.raw.term_str(id)!);
      case 1:
        return (this.terms[id] = this.raw.term_num(id));
      case 2:
        return (this.terms[id] = id === 1);
      default:
        throw new Error(`unknown term id ${id}`);
    }
  }

  private forget(id: number): void {
    const term = this.terms[id];
    if (term === undefined) return;
    this.terms[id] = undefined;
    this.ids.delete(term);
  }

  termIds(terms: readonly Term[]): number[] {
    const out = new Array<number>(terms.length);
    for (let i = 0; i < terms.length; i++) out[i] = this.id(terms[i]);
    return out;
  }

  decodeTerms(ids: ArrayLike<number>, start = 0, end = ids.length): Fact {
    const out = new Array<Term>(end - start);
    for (let i = start; i < end; i++) out[i - start] = this.term(ids[i]);
    return out;
  }

  /** Encode a pattern of terms and wildcards for `drop`/`facts`. */
  encodePattern(pattern: readonly (Term | Wildcard)[]): number[] {
    const out = new Array<number>(pattern.length);
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      out[i] = p === _ ? WILD : this.id(p);
    }
    return out;
  }

  // --- owners ---

  createOwner(parent: number = ROOT_OWNER): number {
    const id = this.raw.create_owner(parent);
    if (id === NONE) throw new Error(`owner ${parent} does not exist`);
    return id;
  }

  ownerExists(owner: number): boolean {
    return this.raw.owner_exists(owner);
  }

  // --- ops (batched until flush) ---

  private push(...words: number[]): void {
    this.reserve(words.length);
    for (const w of words) this.ops[this.opLen++] = w;
  }

  private pushTerms(terms: readonly Term[]): void {
    this.reserve(terms.length + 1);
    this.ops[this.opLen++] = terms.length;
    for (let i = 0; i < terms.length; i++) this.ops[this.opLen++] = this.id(terms[i]);
  }

  private reserve(n: number): void {
    if (this.opLen + n <= this.ops.length) return;
    let size = this.ops.length * 2;
    while (size < this.opLen + n) size *= 2;
    const next = new Uint32Array(size);
    next.set(this.ops.subarray(0, this.opLen));
    this.ops = next;
  }

  /** Hold `terms` under `owner`; `scope` is a term id or `NONE` to inherit. */
  assert(owner: number, scope: number, terms: readonly Term[]): void {
    this.push(OP_ASSERT, owner, scope);
    this.pushTerms(terms);
  }

  /** Drop every fact sharing the prefix `terms[..-1]`, then assert. */
  replace(owner: number, scope: number, terms: readonly Term[]): void {
    this.push(OP_REPLACE, owner, scope);
    this.pushTerms(terms);
  }

  drop(pattern: readonly (Term | Wildcard)[]): void {
    this.push(OP_DROP, pattern.length);
    this.reserve(pattern.length);
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      this.ops[this.opLen++] = p === _ ? WILD : this.id(p);
    }
  }

  revoke(owner: number): void {
    this.push(OP_REVOKE, owner);
  }

  setScope(scope: number, terms: readonly Term[]): void {
    this.push(OP_SET_SCOPE, scope);
    this.pushTerms(terms);
  }

  clear(): void {
    this.push(OP_CLEAR);
  }

  get hasPending(): boolean {
    return this.opLen > 0;
  }

  /** Release the WASM instance now instead of waiting for garbage collection; the engine is unusable afterwards. */
  free(): void {
    this.raw.free();
  }

  /** Apply queued ops without reporting; events accumulate until the next flush. */
  applyPending(): void {
    if (this.opLen === 0) return;
    const batch = this.ops.subarray(0, this.opLen);
    this.opLen = 0;
    this.raw.apply(batch);
  }

  /**
   * Apply queued ops, dispatch fact events to listeners, fold query deltas into
   * their handles, and return the handles whose rows changed.
   */
  flush(): QueryHandle[] {
    this.applyPending();
    const events = this.raw.drain();
    const changed: QueryHandle[] = [];
    let i = 0;
    while (i < events.length) {
      const code = events[i];
      if (code === EV_FACT) {
        const flags = events[i + 1];
        const scope = events[i + 2];
        const len = events[i + 3];
        i += 4;
        if (this.factListeners.length > 0) {
          const event: FactEvent = {
            type: flags & FACT_ADDED ? "add" : "delete",
            terms: this.decodeTerms(events, i, i + len),
            scope: this.term(scope) as string,
            durable: (flags & FACT_DURABLE) !== 0,
            replace: (flags & FACT_REPLACE) !== 0,
            existing: (flags & FACT_EXISTING) !== 0,
          };
          for (const listener of this.factListeners.slice()) {
            try {
              listener(event);
            } catch (e) {
              console.error("[jam] fact listener threw", e);
            }
          }
        }
        i += len;
      } else if (code === EV_QUERY) {
        const qid = events[i + 1];
        const arity = events[i + 2];
        const n = events[i + 3];
        i += 4;
        const entry = this.handles.get(qid);
        const handle = entry?.handle;
        for (let r = 0; r < n; r++) {
          const rid = events[i];
          const flag = events[i + 1];
          i += 2;
          if (flag === 1) {
            handle?.applyRow(rid, events.slice(i, i + arity + 2));
            i += arity + 2;
          } else {
            handle?.applyRow(rid, null);
          }
        }
        if (handle && n > 0) {
          handle.version++;
          changed.push(handle);
        }
      } else if (code === EV_FREE) {
        const n = events[i + 1];
        i += 2;
        for (let k = 0; k < n; k++) this.forget(events[i + k]);
        i += n;
      } else {
        throw new Error(`bad event code ${code} at ${i}`);
      }
    }
    return changed;
  }

  // --- fact events ---

  /** Level: `FACT_EVENTS_NONE`, `FACT_EVENTS_DURABLE` or `FACT_EVENTS_ALL`. */
  setFactEvents(level: number): void {
    this.raw.set_fact_events(level);
  }

  onFact(listener: FactEventListener): () => void {
    this.factListeners.push(listener);
    return () => {
      const i = this.factListeners.indexOf(listener);
      if (i >= 0) this.factListeners.splice(i, 1);
    };
  }

  // --- queries ---

  static nvars(clauses: readonly Clause[]): number {
    let max = -1;
    for (const c of clauses) for (const p of c) if (p >= VAR_BASE && p < WILD && p - VAR_BASE > max) max = p - VAR_BASE;
    return max + 1;
  }

  /**
   * Register (or share) a maintained query; call `release()` on the handle when done.
   * Throws when the spec is malformed or references an unbound variable.
   */
  register(query: QuerySpec | readonly Clause[]): QueryHandle {
    this.applyPending();
    const qid = this.raw.register(packSpec(query));
    const existing = this.handles.get(qid);
    if (existing) {
      existing.refs++;
      return existing.handle;
    }
    const packed = this.raw.rows(qid);
    const arity = packed[0];
    const handle = new QueryHandle(this, qid, arity);
    const n = packed[1];
    let i = 2;
    for (let r = 0; r < n; r++) {
      handle.rows.set(packed[i], packed.slice(i + 1, i + 3 + arity));
      i += 3 + arity;
    }
    this.handles.set(qid, { handle, refs: 1 });
    return handle;
  }

  /**
   * Sort rows of a query with `order` keys: by each key's term in the engine's total
   * order, then by the rows' order keys. Without `order` this is `compareRows`.
   */
  rowComparator(arity: number, order: readonly Sort[] = []): (a: Uint32Array, b: Uint32Array) => number {
    const bySeq = compareRows(arity);
    if (order.length === 0) return bySeq;
    return (a, b) => {
      for (const { column, descending } of order) {
        if (a[column] === b[column]) continue;
        const c = compareTerms(this.term(a[column]), this.term(b[column]));
        if (c !== 0) return descending ? -c : c;
      }
      return bySeq(a, b);
    };
  }

  releaseHandle(handle: QueryHandle): void {
    const entry = this.handles.get(handle.qid);
    if (!entry || entry.handle !== handle) return;
    entry.refs--;
    this.raw.release(handle.qid);
    if (entry.refs === 0) {
      this.handles.delete(handle.qid);
      handle.released = true;
    }
  }

  /** Evaluate once without registering. Rows of an ordered query still need sorting by their keys. */
  query(query: QuerySpec | readonly Clause[]): QueryResult {
    this.applyPending();
    const packed = this.raw.query(packSpec(query));
    return { arity: packed[0], count: packed[1], data: packed.subarray(2) };
  }

  /** Every fact, optionally within a scope and/or matching a pattern of terms and wildcards. */
  facts(scope?: string, pattern?: readonly (Term | Wildcard)[]): StoredFact[] {
    this.applyPending();
    const packed = this.raw.facts(
      scope === undefined ? NONE : this.id(scope),
      pattern ? Uint32Array.from(this.encodePattern(pattern)) : new Uint32Array(0),
    );
    const n = packed[0];
    const out = new Array<StoredFact>(n);
    let i = 1;
    for (let r = 0; r < n; r++) {
      const scopeId = packed[i];
      const len = packed[i + 1];
      i += 2;
      out[r] = { scope: this.term(scopeId) as string, terms: this.decodeTerms(packed, i, i + len) };
      i += len;
    }
    return out;
  }

  has(terms: readonly Term[]): boolean {
    this.applyPending();
    return this.raw.has_fact(Uint32Array.from(this.termIds(terms)));
  }

  scopeOf(terms: readonly Term[]): string | undefined {
    this.applyPending();
    const id = this.raw.scope_of(Uint32Array.from(this.termIds(terms)));
    return id === NONE ? undefined : (this.term(id) as string);
  }

  /** The engine's size right now, pending ops applied first. */
  stats(): EngineStats {
    this.applyPending();
    const s = this.raw.stats();
    return {
      facts: s[STAT_FACTS],
      factSlots: s[STAT_FACT_SLOTS],
      terms: s[STAT_TERMS],
      termSlots: s[STAT_TERM_SLOTS],
      owners: s[STAT_OWNERS],
      indexes: s[STAT_INDEXES],
      indexBuckets: s[STAT_INDEX_BUCKETS],
      queries: s[STAT_QUERIES],
      resultRows: s[STAT_RESULT_ROWS],
      routes: s[STAT_ROUTES],
      pendingEvents: s[STAT_PENDING_EVENTS],
      wasmMemoryBytes: wasmMemory.buffer.byteLength,
    };
  }
}

export function factKey(terms: readonly Term[]): string {
  return JSON.stringify(terms);
}
