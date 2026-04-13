// Primitives — the public API for interacting with the fact database.
//
// Everything lives in one unified fact map. Fine-grained per-pattern
// indexes prevent circular reactivity: writing a VDOM fact only bumps
// version counters for patterns that could match it. App-state patterns
// like ["todo", $.id, "title", $.title] don't match VDOM facts like
// ["e1", "tag", "div"], so component re-execution doesn't trigger.

import { action, reaction, runInAction, comparer } from "mobx";
import { db, type Term, type Pattern, type Bindings, _ as wildcard } from "./db";
export { $, _ } from "./db";
export type { Term, Pattern, Bindings } from "./db";

/** Claim a fact into the current ownership scope. */
export const claim: (...terms: Term[]) => void = action((...terms: Term[]) => {
  db.assert(...terms);
});

/** Remember a durable fact not bound to the current ownership scope. */
export const remember: (...terms: Term[]) => void = action((...terms: Term[]) => {
  db.insert(...terms);
});

/** Forget matching facts immediately from shared state. Supports _ wildcard for bulk removal. */
export const forget: (...terms: (Term | typeof wildcard)[]) => void = action((...terms: (Term | typeof wildcard)[]) => {
  db.drop(...terms);
});

/** Replace the current durable value for a prefix by forgetting prior matches and remembering the new fact. */
export const replace: (...terms: Term[]) => void = action((...terms: Term[]) => {
  db.replace(...terms);
});

/**
 * Batch multiple mutations into a single transaction. Reactions only
 * fire once, after the transaction completes, seeing the final state.
 * Use this when you need to forget + remember multiple related facts
 * atomically (e.g. replacing a batch of plan entries).
 */
export function transaction<T>(fn: () => T): T {
  return runInAction(fn);
}

/**
 * Reactive query. Returns the current matching Bindings[].
 * When called inside a MobX tracking context (component render,
 * autorun, reaction), establishes fine-grained dependency tracking
 * so the context re-runs when results change.
 */
export function when(...patterns: Pattern[]): Bindings[] {
  return db.index(...patterns).get();
}

/**
 * Reactive rule: when patterns match, run body.
 * Body can claim facts freely.
 * Returns a disposer.
 */
export function whenever(
  patterns: Pattern[],
  body: (matches: Bindings[]) => void,
): () => void {
  const idx = db.index(...patterns);
  const parentOwner = db.createChildOwner(db.getCurrentOwnerId(), "rule-parent");
  let currentRunOwner: string | null = null;

  const disposer = reaction(
    () => idx.get(),
    (matches) => {
      runInAction(() => {
        if (currentRunOwner) db.revokeOwner(currentRunOwner);
        currentRunOwner = db.createChildOwner(parentOwner, "run");
        db.withOwnerScope(currentRunOwner, () => {
          body(matches);
        });
      });
    },
    { fireImmediately: true, equals: comparer.structural },
  );

  return () => {
    disposer();
    runInAction(() => {
      if (currentRunOwner) db.revokeOwner(currentRunOwner);
      db.revokeOwner(parentOwner);
    });
  };
}
