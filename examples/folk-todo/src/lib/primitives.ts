// Primitives — the public API for interacting with the fact database.
//
// assert/retract/set: imperative mutations
// when: reactive query (returns MobX IObservableArray)
// whenever: reactive rule (when patterns match, run body that produces derived facts)

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
 * Reactive query. Returns a MobX computed that re-evaluates when facts change.
 * Access .get() to read the current Bindings[].
 * MobX automatically tracks this as a dependency in autorun/computed/reaction.
 */
export function when(...patterns: Pattern[]): IComputedValue<Bindings[]> {
  return computed(() => db.query(...patterns));
}

/**
 * Reactive rule: when patterns match, run body. Body can assert derived facts.
 * Returns a disposer function to stop the rule.
 *
 * Unlike `when` (which just queries), `whenever` runs a side-effecting body
 * and manages the lifecycle of facts it produces.
 */
export function whenever(
  patterns: Pattern[],
  body: (matches: Bindings[]) => void,
): () => void {
  // Track which facts this rule has asserted so we can retract them on re-run
  let previousFactKeys: string[] = [];

  // Use reaction to separate the tracking (data) from the effect (body).
  // The data function reads from db.facts (tracked by MobX).
  // The effect function runs the body and manages derived facts (untracked writes).
  const disposer = reaction(
    () => db.query(...patterns),
    (matches) => {
      runInAction(() => {
        // Retract facts from previous run
        for (const key of previousFactKeys) {
          const fact = JSON.parse(key) as Term[];
          db.retract(...fact);
        }
        previousFactKeys = [];

        // Collect facts asserted during body execution
        const before = new Set(db.facts.keys());
        body(matches);

        // Track newly asserted facts
        for (const key of db.facts.keys()) {
          if (!before.has(key)) {
            previousFactKeys.push(key);
          }
        }
      });
    },
    { fireImmediately: true, equals: comparer.structural },
  );

  return () => {
    // On disposal, retract all facts this rule produced
    runInAction(() => {
      for (const key of previousFactKeys) {
        const fact = JSON.parse(key) as Term[];
        db.retract(...fact);
      }
      previousFactKeys = [];
    });
    disposer();
  };
}
