// FactDB — MobX-backed fact store with fine-grained per-pattern reactivity.
//
// Single unified fact space. Per-pattern indexes prevent circular
// reactivity: when a fact is written, only patterns that could match
// it are invalidated. VDOM facts don't match app-state patterns, so
// writing VDOM doesn't trigger component re-execution.

import { observable, action, computed, untracked, makeObservable, comparer, type IComputedValue } from "mobx";

export type Term = string | number | boolean;
export type Fact = Term[];

// --- Pattern types ---

export interface BindingMarker {
  __binding: true;
  name: string;
}

export const _: unique symbol = Symbol("wildcard");
export type Wildcard = typeof _;

export type PatternTerm = Term | BindingMarker | Wildcard;
export type Pattern = PatternTerm[];
export type Bindings = Record<string, Term>;

// --- Pattern helpers ---

export const $: Record<string, BindingMarker> = new Proxy(
  {} as Record<string, BindingMarker>,
  {
    get(_target, prop: string | symbol): BindingMarker | undefined {
      if (typeof prop === "symbol") return undefined;
      return { __binding: true, name: prop };
    },
  },
);

function isBinding(x: unknown): x is BindingMarker {
  return x != null && typeof x === "object" && (x as any).__binding === true;
}

// --- Pattern matching ---

export function matchPattern(pattern: Pattern, fact: Fact): Bindings | null {
  if (pattern.length !== fact.length) return null;
  const bindings: Bindings = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    const f = fact[i];
    if (p === _) continue;
    if (isBinding(p)) {
      if (p.name in bindings && bindings[p.name] !== f) return null;
      bindings[p.name] = f;
    } else if (p !== f) {
      return null;
    }
  }
  return bindings;
}

function mergeBindings(a: Bindings, b: Bindings): Bindings | null {
  const merged = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k in merged && merged[k] !== v) return null;
    merged[k] = v;
  }
  return merged;
}

/**
 * Could a fact possibly match a pattern? Quick check using only the
 * literal (non-binding, non-wildcard) terms in the pattern. If any
 * literal at a fixed position doesn't match, the fact can't match.
 */
function couldMatch(pattern: Pattern, fact: Fact): boolean {
  if (pattern.length !== fact.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p === _ || isBinding(p)) continue;
    if (p !== fact[i]) return false;
  }
  return true;
}

/** Serialize a pattern set for use as a cache key. */
function patternsKey(patterns: Pattern[]): string {
  return JSON.stringify(patterns.map(p =>
    p.map(t => {
      if (t === _) return "__WILD__";
      if (isBinding(t)) return `__BIND__${t.name}`;
      return t;
    })
  ));
}

// --- FactDB ---

export class FactDB {
  /** All facts — app state, VDOM, decorations. One unified space. */
  readonly facts = observable.map<string, Fact>();

  /** Side-channel for non-serializable values (function refs for event handlers). */
  readonly refs = new Map<string, unknown>();

  /**
   * Per-pattern-set version counters. Each registered pattern set gets
   * its own observable version. When a fact is written/removed, only
   * versions for patterns that could match it are bumped.
   */
  private patternVersions = new Map<string, { patterns: Pattern[]; version: { get(): number; set(v: number): void } }>();

  constructor() {
    makeObservable(this, {
      assert: action,
      retract: action,
      set: action,
    });
  }

  private factKey(fact: Fact): string {
    return JSON.stringify(fact);
  }

  /** Bump version counters for pattern sets that could match this fact. */
  private invalidatePatterns(fact: Fact): void {
    for (const entry of this.patternVersions.values()) {
      for (const pattern of entry.patterns) {
        if (couldMatch(pattern, fact)) {
          entry.version.set(entry.version.get() + 1);
          break; // only need to bump once per pattern set
        }
      }
    }
  }

  assert(...terms: Term[]): void {
    const key = this.factKey(terms);
    if (!this.facts.has(key)) {
      this.facts.set(key, terms);
      this.invalidatePatterns(terms);
    }
  }

  retract(...terms: (Term | Wildcard)[]): void {
    if (!terms.includes(_)) {
      const key = this.factKey(terms as Term[]);
      if (this.facts.has(key)) {
        this.facts.delete(key);
        this.invalidatePatterns(terms as Term[]);
      }
      return;
    }
    const toRemove: [string, Fact][] = [];
    for (const [key, fact] of this.facts) {
      if (fact.length !== terms.length) continue;
      let matches = true;
      for (let i = 0; i < terms.length; i++) {
        if (terms[i] === _) continue;
        if (terms[i] !== fact[i]) { matches = false; break; }
      }
      if (matches) toRemove.push([key, fact]);
    }
    for (const [key, fact] of toRemove) {
      this.facts.delete(key);
      this.invalidatePatterns(fact);
    }
  }

  set(...terms: Term[]): void {
    if (terms.length < 2) throw new Error("set() requires at least 2 terms");
    this.retract(...terms.slice(0, -1), _);
    this.assert(...terms);
  }

  /**
   * Create a per-pattern-set computed index. Returns a computed that:
   * - Tracks only the version counter for these patterns (fine-grained)
   * - Re-evaluates (scans all facts) only when that counter bumps
   * - Uses structural comparison so observers only re-run on actual changes
   */
  index(...patterns: Pattern[]): IComputedValue<Bindings[]> {
    const key = patternsKey(patterns);
    if (!this.patternVersions.has(key)) {
      this.patternVersions.set(key, { patterns, version: observable.box(0) });
    }
    const entry = this.patternVersions.get(key)!;

    return computed(
      () => {
        entry.version.get(); // track ONLY this pattern set's version
        return untracked(() => this.query(...patterns)); // scan facts WITHOUT tracking the map
      },
      { equals: comparer.structural },
    );
  }

  /** Query all facts matching patterns (non-reactive, point-in-time). */
  query(...patterns: Pattern[]): Bindings[] {
    if (patterns.length === 0) return [];
    if (patterns.length === 1) return this.querySingle(patterns[0]);
    return this.queryJoin(patterns);
  }

  private querySingle(pattern: Pattern): Bindings[] {
    const results: Bindings[] = [];
    for (const fact of this.facts.values()) {
      const bindings = matchPattern(pattern, fact);
      if (bindings) results.push(bindings);
    }
    return results;
  }

  private queryJoin(patterns: Pattern[]): Bindings[] {
    let current = this.querySingle(patterns[0]);
    for (let i = 1; i < patterns.length; i++) {
      const pattern = patterns[i];
      const next: Bindings[] = [];
      for (const existing of current) {
        for (const fact of this.facts.values()) {
          const factBindings = matchPattern(pattern, fact);
          if (factBindings) {
            const merged = mergeBindings(existing, factBindings);
            if (merged) next.push(merged);
          }
        }
      }
      current = next;
    }
    return current;
  }

  // --- Refs ---

  setRef(key: string, value: unknown): void { this.refs.set(key, value); }
  getRef(key: string): unknown { return this.refs.get(key); }
  deleteRef(key: string): void { this.refs.delete(key); }
}

// Global singleton
export const db = new FactDB();
