// @jam/engine — the typed surface over the wasm fact engine. Terms are interned
// once here and only ids cross the boundary; ops are batched into one packed
// array per flush and the engine answers with one packed array of events.

import { JamEngine } from "./wasm";
import {
  EV_FACT,
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

/**
 * A registered query's live result set. `rows` maps stable row ids to the
 * bound variable ids in order; `version` bumps whenever a row appears or leaves.
 */
export class QueryHandle {
  readonly rows = new Map<number, Uint32Array>();
  version = 0;
  released = false;

  constructor(
    private readonly engine: Engine,
    readonly qid: number,
    readonly nvars: number,
  ) {}

  /** Drop one registration; the handle stays live while other registrations share it. */
  release(): void {
    if (this.released) return;
    this.engine.releaseHandle(this);
  }
}

export interface QueryResult {
  nvars: number;
  /** `nrows * nvars` variable ids, row-major. */
  data: Uint32Array;
  count: number;
}

export interface StoredFact {
  terms: Fact;
  scope: string;
}

export class Engine {
  readonly raw: JamEngine;
  private readonly ids = new Map<Term, number>([
    [false, 0],
    [true, 1],
    ["", GLOBAL_SCOPE_ID],
  ]);
  private terms: Term[] = [false, true, ""];
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
        const nvars = events[i + 2];
        const n = events[i + 3];
        i += 4;
        const entry = this.handles.get(qid);
        const handle = entry?.handle;
        for (let r = 0; r < n; r++) {
          const rid = events[i];
          const flag = events[i + 1];
          i += 2;
          if (flag === 1) {
            handle?.rows.set(rid, events.slice(i, i + nvars));
            i += nvars;
          } else {
            handle?.rows.delete(rid);
          }
        }
        if (handle && n > 0) {
          handle.version++;
          changed.push(handle);
        }
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

  private packClauses(clauses: readonly Clause[]): Uint32Array {
    let size = 1;
    for (const c of clauses) size += 1 + c.length;
    const packed = new Uint32Array(size);
    packed[0] = clauses.length;
    let i = 1;
    for (const c of clauses) {
      packed[i++] = c.length;
      packed.set(c, i);
      i += c.length;
    }
    return packed;
  }

  static nvars(clauses: readonly Clause[]): number {
    let max = -1;
    for (const c of clauses) for (const p of c) if (p >= VAR_BASE && p < WILD && p - VAR_BASE > max) max = p - VAR_BASE;
    return max + 1;
  }

  /** Register (or share) a maintained query; call `release()` on the handle when done. */
  register(clauses: readonly Clause[]): QueryHandle {
    this.applyPending();
    const qid = this.raw.register(this.packClauses(clauses));
    const existing = this.handles.get(qid);
    if (existing) {
      existing.refs++;
      return existing.handle;
    }
    const handle = new QueryHandle(this, qid, Engine.nvars(clauses));
    const packed = this.raw.rows(qid);
    const nvars = packed[0];
    const n = packed[1];
    let i = 2;
    for (let r = 0; r < n; r++) {
      handle.rows.set(packed[i], packed.slice(i + 1, i + 1 + nvars));
      i += 1 + nvars;
    }
    this.handles.set(qid, { handle, refs: 1 });
    return handle;
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

  /** Evaluate once without registering. */
  query(clauses: readonly Clause[]): QueryResult {
    this.applyPending();
    const packed = this.raw.query(this.packClauses(clauses));
    return { nvars: packed[0], count: packed[1], data: packed.subarray(2) };
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

  get factCount(): number {
    this.applyPending();
    return this.raw.fact_count();
  }

  get indexCount(): number {
    return this.raw.index_count();
  }

  get queryCount(): number {
    return this.raw.query_count();
  }
}

export function factKey(terms: readonly Term[]): string {
  return JSON.stringify(terms);
}
