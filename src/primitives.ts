// Primitives — the public API for interacting with the fact database.
//
// Everything lives in one unified fact map. Fine-grained per-pattern
// indexes prevent circular reactivity: writing a VDOM fact only bumps
// version counters for patterns that could match it. App-state patterns
// like ["todo", $.id, "title", $.title] don't match VDOM facts like
// ["e1", "tag", "div"], so component re-execution doesn't trigger.

import { action, computed, reaction, runInAction, comparer, IComputedValue } from "mobx";
import { db, type Term, type Pattern, type Bindings, _ as wildcard } from "./db";
export { $, _ } from "./db";
export type { Term, Pattern, Bindings } from "./db";

/** Assert a fact into the database. */
export const assert: (...terms: Term[]) => void = action((...terms: Term[]) => {
  db.assert(...terms);
});

/** Retract a fact. Supports _ wildcard for bulk retraction. */
export const retract: (...terms: (Term | typeof wildcard)[]) => void = action((...terms: (Term | typeof wildcard)[]) => {
  db.retract(...terms);
});

/** Set (upsert): retract any fact matching [...keyTerms, _], then assert [...keyTerms, value]. */
export const set: (...terms: Term[]) => void = action((...terms: Term[]) => {
  db.set(...terms);
});

/**
 * Claim a fact — semantic alias for assert.
 * Convention: use claim() for VDOM / decoration facts,
 * assert() for app-state facts. Same underlying operation.
 */
export const claim = assert;

/** Retract a claim — semantic alias for retract. */
export const retractClaim = retract;

/**
 * Batch multiple mutations into a single transaction. Reactions only
 * fire once, after the transaction completes, seeing the final state.
 * Use this when you need to retract + assert multiple related facts
 * atomically (e.g. replacing a set of plan entries).
 */
export function transaction<T>(fn: () => T): T {
  return runInAction(fn);
}

/**
 * Reactive query with fine-grained tracking. Returns a per-pattern
 * computed index with structural equality. Only re-evaluates when a
 * fact that could match these patterns is written or removed.
 */
export function when(...patterns: Pattern[]): IComputedValue<Bindings[]> {
  return db.index(...patterns);
}

/**
 * Reactive rule: when patterns match, run body.
 * Body can assert/claim facts freely.
 * Returns a disposer.
 */
export function whenever(
  patterns: Pattern[],
  body: (matches: Bindings[]) => void,
): () => void {
  let prevFactKeys: string[] = [];

  const idx = db.index(...patterns);

  const disposer = reaction(
    () => idx.get(),
    (matches) => {
      runInAction(() => {
        for (const key of prevFactKeys) db.facts.delete(key);
        prevFactKeys = [];

        const before = new Set(db.facts.keys());
        body(matches);

        for (const key of db.facts.keys()) {
          if (!before.has(key)) prevFactKeys.push(key);
        }
      });
    },
    { fireImmediately: true, equals: comparer.structural },
  );

  return () => {
    runInAction(() => {
      for (const key of prevFactKeys) db.facts.delete(key);
      prevFactKeys = [];
    });
    disposer();
  };
}
