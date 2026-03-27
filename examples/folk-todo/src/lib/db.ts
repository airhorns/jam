// FactDB — MobX-backed fact store with pattern matching.
//
// All facts (app state + VDOM) live here. Facts are tuples of Terms.
// MobX observability means any computed/autorun reading query results
// automatically re-runs when the underlying facts change.

import { observable, action, makeObservable } from "mobx";

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

// --- FactDB ---

export class FactDB {
  /** Observable map: JSON key → Fact. Reading this in a computed/autorun tracks it. */
  readonly facts = observable.map<string, Fact>();

  /** Side-channel for non-serializable values (function refs for event handlers). */
  readonly refs = new Map<string, unknown>();

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

  assert(...terms: Term[]): void {
    const key = this.factKey(terms);
    if (!this.facts.has(key)) {
      this.facts.set(key, terms);
    }
  }

  retract(...terms: (Term | Wildcard)[]): void {
    // If no wildcards, direct removal
    if (!terms.includes(_)) {
      const key = this.factKey(terms as Term[]);
      this.facts.delete(key);
      return;
    }
    // Wildcard retraction: match and remove all matching facts
    const toRemove: string[] = [];
    for (const [key, fact] of this.facts) {
      if (fact.length !== terms.length) continue;
      let matches = true;
      for (let i = 0; i < terms.length; i++) {
        if (terms[i] === _) continue;
        if (terms[i] !== fact[i]) {
          matches = false;
          break;
        }
      }
      if (matches) toRemove.push(key);
    }
    for (const key of toRemove) {
      this.facts.delete(key);
    }
  }

  /**
   * Set: upsert the last term. Retracts any fact matching [...keyTerms, _],
   * then asserts [...keyTerms, value].
   */
  set(...terms: Term[]): void {
    if (terms.length < 2) throw new Error("set() requires at least 2 terms");
    // Build the retraction pattern: everything except the last term, then wildcard
    const keyTerms = terms.slice(0, -1);
    const retractPattern: (Term | Wildcard)[] = [...keyTerms, _];
    this.retract(...retractPattern);
    this.assert(...terms);
  }

  /** Query with one or more patterns, returning all matching binding sets. */
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

  /** Store a non-serializable ref (e.g. event handler function). */
  setRef(key: string, value: unknown): void {
    this.refs.set(key, value);
  }

  getRef(key: string): unknown {
    return this.refs.get(key);
  }

  deleteRef(key: string): void {
    this.refs.delete(key);
  }
}

// Global singleton
export const db = new FactDB();
