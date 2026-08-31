// Primitives — the public API for interacting with the fact database.

import { db, type Term, type Pattern, type Bindings, _ as wildcard } from "./db";
import { Effect, transaction as batch, untracked } from "./reactive";
export { $, _ } from "./db";
export type { Term, Pattern, Bindings } from "./db";

/** Claim a fact into the current ownership scope. */
export function claim(...terms: Term[]): void {
  db.assert(...terms);
}

/** Remember a durable fact not bound to the current ownership scope. */
export function remember(...terms: Term[]): void {
  db.insert(...terms);
}

/** Forget matching facts immediately from shared state. Supports _ wildcard for bulk removal. */
export function forget(...terms: (Term | typeof wildcard)[]): void {
  db.drop(...terms);
}

/** Replace the current durable value for a prefix by forgetting prior matches and remembering the new fact. */
export function replace(...terms: Term[]): void {
  db.replace(...terms);
}

/**
 * Facts written inside fn belong to the sync partition `scope`. Outside any
 * scoped() call a fact inherits the scope of the fact it replaces, else of the
 * entity it describes (same first two terms), else the global partition — so
 * wrapping an entity's creation is enough to keep all of its facts together.
 */
export function scoped<T>(scope: string, fn: () => T): T {
  return db.withScope(scope, () => batch(fn));
}

/**
 * Batch multiple mutations into a single transaction. Reactions only
 * fire once, after the transaction completes, seeing the final state.
 */
export function transaction<T>(fn: () => T): T {
  return batch(fn);
}

/**
 * Reactive query. Returns the current matching Bindings[]. Inside a component
 * render or whenever() the caller re-runs when the result changes.
 */
export function when(...patterns: Pattern[]): Bindings[] {
  return db.index(...patterns).get();
}

/**
 * Reactive rule: run body with the current matches now and whenever they change.
 * Facts the body claims are revoked before the next run. Returns a disposer.
 */
export function whenever(patterns: Pattern[], body: (matches: Bindings[]) => void): () => void {
  const idx = db.index(...patterns);
  const parentOwner = db.createChildOwner(db.getCurrentOwnerId(), "rule-parent");
  let currentRunOwner: string | null = null;

  const effect = new Effect(() => {
    const matches = idx.get();
    untracked(() => {
      if (currentRunOwner) db.revokeOwner(currentRunOwner);
      currentRunOwner = db.createChildOwner(parentOwner, "run");
      db.withOwnerScope(currentRunOwner, () => body(matches));
    });
  });
  effect.run();

  return () => {
    effect.dispose();
    batch(() => {
      if (currentRunOwner) db.revokeOwner(currentRunOwner);
      db.revokeOwner(parentOwner);
    });
  };
}
