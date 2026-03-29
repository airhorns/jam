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
  const len = pattern.length;
  if (len !== fact.length) return null;

  // Fast path: check all literals FIRST before allocating bindings.
  // This avoids allocation for the common case where most facts don't match.
  for (let i = 0; i < len; i++) {
    const p = pattern[i];
    if (p === _ || (p !== null && typeof p === "object")) continue; // wildcard or binding
    if (p !== fact[i]) return null;
  }

  // All literals matched — now do the binding pass
  let bindings: Bindings | null = null;
  for (let i = 0; i < len; i++) {
    const p = pattern[i];
    if (p === _ || typeof p !== "object" || p === null) continue;
    // p is a BindingMarker
    const name = (p as BindingMarker).name;
    const f = fact[i];
    if (bindings === null) bindings = {};
    if (name in bindings) {
      if (bindings[name] !== f) return null;
    } else {
      bindings[name] = f;
    }
  }
  return bindings ?? {};
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

  /** When non-null, assert() collects keys here (for tracking component-emitted facts). */
  emitCollector: Set<string> | null = null;

  /** Index of fact keys by first term, for fast querySingle when pattern has a literal first term. */
  private factsByFirstTerm = new Map<Term, Set<string>>();

  /**
   * Per-pattern-set version counters. Each registered pattern set gets
   * its own observable version. When a fact is written/removed, only
   * versions for patterns that could match it are bumped.
   */
  private patternVersions = new Map<string, { patterns: Pattern[]; version: { get(): number; set(v: number): void } }>();

  /**
   * Index of pattern entries by their first literal term (for fast invalidation).
   * Patterns whose first term is a binding/wildcard go into the null bucket.
   */
  private patternsByFirstTerm = new Map<Term | null, Set<string>>();

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
    const firstTerm = fact[0];
    // Check patterns indexed by this fact's first term
    const exact = this.patternsByFirstTerm.get(firstTerm);
    if (exact) this.invalidateEntries(exact, fact);
    // Also check patterns with wildcard/binding first term
    const wild = this.patternsByFirstTerm.get(null);
    if (wild) this.invalidateEntries(wild, fact);
  }

  private invalidateEntries(keys: Set<string>, fact: Fact): void {
    for (const key of keys) {
      const entry = this.patternVersions.get(key);
      if (!entry) continue;
      for (const pattern of entry.patterns) {
        if (couldMatch(pattern, fact)) {
          entry.version.set(entry.version.get() + 1);
          break;
        }
      }
    }
  }

  assert(...terms: Term[]): void {
    const key = this.factKey(terms);
    if (!this.facts.has(key)) {
      this.facts.set(key, terms);
      if (this.emitCollector) this.emitCollector.add(key);
      // Maintain first-term index
      const first = terms[0];
      let bucket = this.factsByFirstTerm.get(first);
      if (!bucket) { bucket = new Set(); this.factsByFirstTerm.set(first, bucket); }
      bucket.add(key);
      this.invalidatePatterns(terms);
    }
  }

  retract(...terms: (Term | Wildcard)[]): void {
    if (!terms.includes(_)) {
      const key = this.factKey(terms as Term[]);
      if (this.facts.has(key)) {
        this.facts.delete(key);
        this.factsByFirstTerm.get((terms as Term[])[0])?.delete(key);
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
      this.factsByFirstTerm.get(fact[0])?.delete(key);
      this.invalidatePatterns(fact);
    }
  }

  set(...terms: Term[]): void {
    if (terms.length < 2) throw new Error("set() requires at least 2 terms");
    // Inline wildcard retract to avoid array allocation from slice + spread.
    // Retract any fact matching [terms[0], ..., terms[n-2], _].
    const prefixLen = terms.length - 1;
    const toRemove: string[] = [];
    for (const [key, fact] of this.facts) {
      if (fact.length !== terms.length) continue;
      let matches = true;
      for (let i = 0; i < prefixLen; i++) {
        if (terms[i] !== fact[i]) { matches = false; break; }
      }
      if (matches) toRemove.push(key);
    }
    for (const key of toRemove) {
      const fact = this.facts.get(key)!;
      this.facts.delete(key);
      this.factsByFirstTerm.get(fact[0])?.delete(key);
      this.invalidatePatterns(fact);
    }
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
      // Register in first-term index for fast invalidation
      for (const pattern of patterns) {
        const first = pattern[0];
        const indexKey: Term | null = (first !== _ && !isBinding(first)) ? first as Term : null;
        let bucket = this.patternsByFirstTerm.get(indexKey);
        if (!bucket) { bucket = new Set(); this.patternsByFirstTerm.set(indexKey, bucket); }
        bucket.add(key);
      }
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

  /** Return facts to scan for a pattern's first term. Uses the index for literals. */
  private iterFacts(firstPatternTerm: PatternTerm): Iterable<Fact> {
    if (firstPatternTerm !== _ && !isBinding(firstPatternTerm)) {
      const bucket = this.factsByFirstTerm.get(firstPatternTerm as Term);
      if (!bucket) return [];
      // Resolve keys to facts, filtering any stale entries
      const facts: Fact[] = [];
      for (const key of bucket) {
        const fact = this.facts.get(key);
        if (fact) facts.push(fact);
      }
      return facts;
    }
    return this.facts.values();
  }

  /** Query all facts matching patterns (non-reactive, point-in-time). */
  query(...patterns: Pattern[]): Bindings[] {
    if (patterns.length === 0) return [];
    if (patterns.length === 1) return this.querySingle(patterns[0]);
    return this.queryJoin(patterns);
  }

  private querySingle(pattern: Pattern): Bindings[] {
    const first = pattern[0];
    const results: Bindings[] = [];

    // If the first term is a literal, use the first-term index to skip irrelevant facts
    if (first !== _ && !isBinding(first)) {
      const bucket = this.factsByFirstTerm.get(first as Term);
      if (!bucket) return results;
      for (const key of bucket) {
        const fact = this.facts.get(key);
        if (!fact) continue;
        const bindings = matchPattern(pattern, fact);
        if (bindings) results.push(bindings);
      }
    } else {
      // Wildcard/binding first term — must scan all facts
      for (const fact of this.facts.values()) {
        const bindings = matchPattern(pattern, fact);
        if (bindings) results.push(bindings);
      }
    }
    return results;
  }

  private queryJoin(patterns: Pattern[]): Bindings[] {
    let current = this.querySingle(patterns[0]);
    for (let i = 1; i < patterns.length; i++) {
      const pattern = patterns[i];

      // Find shared binding names between current results and this pattern
      const patternBindingNames: string[] = [];
      for (const t of pattern) {
        if (isBinding(t)) patternBindingNames.push(t.name);
      }
      const currentBindingNames = current.length > 0 ? Object.keys(current[0]) : [];
      const sharedVars = patternBindingNames.filter(n => currentBindingNames.includes(n));

      if (sharedVars.length > 0) {
        // Hash join: index pattern matches by the shared variable(s),
        // then probe with current bindings. O(n+m) instead of O(n*m).
        const joinKey = sharedVars[0]; // use first shared var as hash key

        // Find which position in the pattern has this binding
        let joinPos = -1;
        for (let p = 0; p < pattern.length; p++) {
          const t = pattern[p];
          if (isBinding(t) && t.name === joinKey) { joinPos = p; break; }
        }

        // Build hash index: joinValue → Bindings[]
        const index = new Map<Term, Bindings[]>();
        for (const fact of this.iterFacts(pattern[0])) {
          const factBindings = matchPattern(pattern, fact);
          if (factBindings) {
            const key = factBindings[joinKey];
            let bucket = index.get(key);
            if (!bucket) { bucket = []; index.set(key, bucket); }
            bucket.push(factBindings);
          }
        }

        // Probe: for each current binding, look up matching entries
        const next: Bindings[] = [];
        for (const existing of current) {
          const key = existing[joinKey];
          const bucket = index.get(key);
          if (bucket) {
            for (const factBindings of bucket) {
              const merged = mergeBindings(existing, factBindings);
              if (merged) next.push(merged);
            }
          }
        }
        current = next;
      } else {
        // No shared variables — cross product, first-term filtered
        const next: Bindings[] = [];
        for (const existing of current) {
          for (const fact of this.iterFacts(pattern[0])) {
            const factBindings = matchPattern(pattern, fact);
            if (factBindings) {
              const merged = mergeBindings(existing, factBindings);
              if (merged) next.push(merged);
            }
          }
        }
        current = next;
      }
    }
    return current;
  }

  /** Clear all facts, pattern versions, and refs. */
  clear(): void {
    this.facts.clear();
    this.factsByFirstTerm.clear();
    this.patternVersions.clear();
    this.patternsByFirstTerm.clear();
    this.refs.clear();
  }

  // --- Refs ---

  setRef(key: string, value: unknown): void { this.refs.set(key, value); }
  getRef(key: string): unknown { return this.refs.get(key); }
  deleteRef(key: string): void { this.refs.delete(key); }
}

// Global singleton
export const db = new FactDB();
