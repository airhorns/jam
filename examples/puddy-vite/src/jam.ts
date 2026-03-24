// Jam — in-memory fact database with reactive queries via Preact signals.
//
// Implements the core When/Claim/Hold primitives from the Jam framework
// using a simple fact store + Preact signals for reactivity.

import { signal, computed, type ReadonlySignal } from "@preact/signals";

// --- Types ---

export type Term = string | number | boolean;
export type Fact = Term[];

interface BindingMarker {
  __binding: true;
  name: string;
}

interface OrMarker {
  __or: true;
  values: Term[];
}

export type PatternTerm = Term | BindingMarker | typeof _ | OrMarker;
export type Pattern = PatternTerm[];
export type Bindings = Record<string, Term>;

// --- Pattern primitives ---

/**
 * Binding proxy. Access any property to create a named pattern variable.
 * @example $.value, $.x, $.sid
 */
export const $: Record<string, BindingMarker> = new Proxy(
  {} as Record<string, BindingMarker>,
  {
    get(_target, prop: string | symbol): BindingMarker | undefined {
      if (typeof prop === "symbol") return undefined;
      return { __binding: true, name: prop };
    },
  },
);

/** Wildcard. Matches any value without capturing. */
export const _ = Symbol("wildcard");

/** Match any of the given values at a pattern position. */
export function or(...values: Term[]): OrMarker {
  return { __or: true, values };
}

// --- Pattern matching ---

function isBinding(x: unknown): x is BindingMarker {
  return x != null && typeof x === "object" && (x as any).__binding === true;
}

function isOr(x: unknown): x is OrMarker {
  return x != null && typeof x === "object" && (x as any).__or === true;
}

/**
 * Match a single pattern against a single fact, returning bindings or null.
 * Ported from ts/runtime.ts __matchPattern.
 */
export function matchPattern(
  pattern: Pattern,
  fact: Fact,
): Bindings | null {
  if (pattern.length !== fact.length) return null;
  const bindings: Bindings = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    const f = fact[i];
    if (isBinding(p)) {
      if (p.name in bindings && bindings[p.name] !== f) return null;
      bindings[p.name] = f;
    } else if (p === _) {
      // Wildcard — matches anything
    } else if (isOr(p)) {
      if (!p.values.includes(f)) return null;
    } else if (p !== f) {
      return null;
    }
  }
  return bindings;
}

/**
 * Merge two binding sets. Returns null if they conflict on any shared key.
 */
function mergeBindings(a: Bindings, b: Bindings): Bindings | null {
  const merged = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k in merged && merged[k] !== v) return null;
    merged[k] = v;
  }
  return merged;
}

// --- Fact Database ---

class FactDB {
  /** Version counter — increments on any mutation. Signals subscribe to this. */
  readonly version = signal(0);

  /** Facts stored as JSON key → Fact for O(1) dedup and removal. */
  private facts = new Map<string, Fact>();

  /** Hold state: key → set of fact JSON keys owned by that hold. */
  private holds = new Map<string, Set<string>>();

  /** Hold collector for accumulating claims inside hold() callbacks. */
  private holdCollector: Fact[] | null = null;

  private factKey(fact: Fact): string {
    return JSON.stringify(fact);
  }

  /** Assert a fact. No-op if already present. */
  assertFact(...terms: Term[]): void {
    const key = this.factKey(terms);
    if (this.facts.has(key)) return;
    this.facts.set(key, terms);
    this.version.value++;
  }

  /** Retract a fact. No-op if not present. */
  retractFact(...terms: Term[]): void {
    const key = this.factKey(terms);
    if (!this.facts.has(key)) return;
    this.facts.delete(key);
    this.version.value++;
  }

  /**
   * Hold: replace all facts under a key atomically.
   * Runs fn() which should call claim() to accumulate facts.
   * Previous facts under this key are retracted, new ones asserted.
   */
  holdFacts(key: string, fn: () => void): void {
    // Save previous collector
    const prevCollector = this.holdCollector;
    this.holdCollector = [];

    try {
      fn();
    } finally {
      const newFacts = this.holdCollector!;
      this.holdCollector = prevCollector;

      // Compute new key set
      const newKeys = new Set(newFacts.map((f) => this.factKey(f)));

      // Retract facts no longer in the new set
      const oldKeys = this.holds.get(key);
      if (oldKeys) {
        for (const oldKey of oldKeys) {
          if (!newKeys.has(oldKey)) {
            this.facts.delete(oldKey);
          }
        }
      }

      // Assert new facts not already present
      for (const fact of newFacts) {
        const fk = this.factKey(fact);
        this.facts.set(fk, fact);
      }

      this.holds.set(key, newKeys);
      this.version.value++;
    }
  }

  /**
   * Claim: inside a hold() callback, accumulates into the collector.
   * Outside hold(), directly asserts.
   */
  claimFact(...terms: Term[]): void {
    if (this.holdCollector !== null) {
      this.holdCollector.push(terms);
    } else {
      this.assertFact(...terms);
    }
  }

  /** Query the database with one or more patterns, returning all matching bindings. */
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
    // Start with matches for the first pattern
    let currentBindings = this.querySingle(patterns[0]);

    // For each subsequent pattern, join with current bindings
    for (let i = 1; i < patterns.length; i++) {
      const pattern = patterns[i];
      const nextBindings: Bindings[] = [];

      for (const existing of currentBindings) {
        // Apply existing bindings to the pattern to narrow the search
        for (const fact of this.facts.values()) {
          const factBindings = matchPattern(pattern, fact);
          if (factBindings) {
            const merged = mergeBindings(existing, factBindings);
            if (merged) nextBindings.push(merged);
          }
        }
      }

      currentBindings = nextBindings;
    }

    return currentBindings;
  }

  /** Get all current facts. */
  allFacts(): Fact[] {
    return Array.from(this.facts.values());
  }

  /** Get the number of facts. */
  get size(): number {
    return this.facts.size;
  }

  /** Clear all facts and holds. */
  clear(): void {
    this.facts.clear();
    this.holds.clear();
    this.version.value++;
  }
}

// --- Global singleton ---

export const db = new FactDB();

// --- Public API (operates on the global singleton) ---

/** Assert a raw fact into the database. */
export function assert(...terms: Term[]): void {
  db.assertFact(...terms);
}

/** Retract a raw fact from the database. */
export function retract(...terms: Term[]): void {
  db.retractFact(...terms);
}

/**
 * Persistent mutable state. Replaces all facts under the given key.
 * Inside the callback, use claim() to accumulate facts.
 */
export function hold(key: string, fn: () => void): void {
  db.holdFacts(key, fn);
}

/**
 * Assert a fact. Inside hold(), accumulates for atomic replacement.
 * Outside hold(), directly asserts.
 */
export function claim(...terms: Term[]): void {
  db.claimFact(...terms);
}

/** Alias for claim. Convention: desired states another system should fulfill. */
export function wish(...terms: Term[]): void {
  db.claimFact(...terms);
}

/**
 * Reactive query hook for Preact components.
 * Returns a computed signal containing all matching bindings.
 * Re-evaluates when any fact changes.
 *
 * @example
 * const sessions = useWhen(
 *   ["session", $.sid, "agent", $.agent],
 *   ["session", $.sid, "status", $.status],
 * );
 * // sessions.value is Bindings[] e.g. [{ sid: "s1", agent: "claude", status: "active" }]
 */
export function useWhen(...patterns: Pattern[]): ReadonlySignal<Bindings[]> {
  return computed(() => {
    // Subscribe to version changes
    db.version.value;
    return db.query(...patterns);
  });
}

// Expose db on window for e2e test injection
if (typeof window !== "undefined") {
  (window as any).__db = db;
}
