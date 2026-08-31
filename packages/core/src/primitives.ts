// Primitives — the public API for interacting with the fact database.

import {
  db,
  type AggregateClause,
  type Bindings,
  type BindingMarker,
  type ComparisonOp,
  type LimitClause,
  type NotClause,
  type OffsetClause,
  type OrderClause,
  type PatternTerm,
  type QueryClause,
  type Term,
  type WhereClause,
  _ as wildcard,
} from "./db";
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

// --- Query clauses ---

/** Hide rows for which this pattern has a match; variables shared with the patterns join through the row. */
export function not(...pattern: PatternTerm[]): NotClause {
  return { __clause: "not", pattern };
}

/**
 * Keep rows for which the comparison holds. `"in"` accepts a list of values; string
 * operators (`contains`, `startsWith` and their case-insensitive `i` forms) only match strings.
 */
export function where(lhs: BindingMarker, op: ComparisonOp, rhs: Term | BindingMarker): WhereClause;
export function where(lhs: BindingMarker, op: "in", values: readonly Term[]): WhereClause;
export function where(lhs: BindingMarker, op: ComparisonOp | "in", rhs: Term | BindingMarker | readonly Term[]): WhereClause {
  if (op === "in") {
    const values = rhs as readonly Term[];
    // An empty list can never hold, which `x != x` says without a special case downstream.
    const any = values.length === 0 ? [{ lhs, op: "!=" as const, rhs: lhs }] : values.map((v) => ({ lhs, op: "=" as const, rhs: v }));
    return { __clause: "where", any };
  }
  return { __clause: "where", any: [{ lhs, op, rhs: rhs as Term | BindingMarker }] };
}

/** Keep rows for which any of the clauses holds. */
where.any = (...clauses: WhereClause[]): WhereClause => ({ __clause: "where", any: clauses.flatMap((c) => c.any) });

/** Sort by a variable; several `orderBy` clauses compose most significant first. Ties keep assertion order. */
export function orderBy(by: BindingMarker, direction: "asc" | "desc" = "asc"): OrderClause {
  return { __clause: "order", by, descending: direction === "desc" };
}

export function offset(count: number): OffsetClause {
  return { __clause: "offset", count };
}

export function limit(count: number): LimitClause {
  return { __clause: "limit", count };
}

/** Bind `output` to the number of rows, per distinct combination of `group` variables. */
export function count(output: BindingMarker, ...group: BindingMarker[]): AggregateClause {
  return { __clause: "aggregate", op: "count", input: null, output, group };
}

/** Bind `output` to the sum of `input` over the rows of each group. */
export function sum(input: BindingMarker, output: BindingMarker, ...group: BindingMarker[]): AggregateClause {
  return { __clause: "aggregate", op: "sum", input, output, group };
}

/** Bind `output` to the least `input` of each group, in the engine's total order over terms. */
export function min(input: BindingMarker, output: BindingMarker, ...group: BindingMarker[]): AggregateClause {
  return { __clause: "aggregate", op: "min", input, output, group };
}

/** Bind `output` to the greatest `input` of each group, in the engine's total order over terms. */
export function max(input: BindingMarker, output: BindingMarker, ...group: BindingMarker[]): AggregateClause {
  return { __clause: "aggregate", op: "max", input, output, group };
}

/**
 * Reactive query. Returns the current matching Bindings[]. Inside a component
 * render or whenever() the caller re-runs when the result changes.
 */
export function when(...clauses: QueryClause[]): Bindings[] {
  return db.index(...clauses).get();
}

/**
 * Reactive rule: run body with the current matches now and whenever they change.
 * Facts the body claims are revoked before the next run. Returns a disposer.
 */
export function whenever(clauses: QueryClause[], body: (matches: Bindings[]) => void): () => void {
  const idx = db.index(...clauses);
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
