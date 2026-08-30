// The shape of a fact and of the patterns that match it. Pure types plus the
// wildcard symbol, shared by the FactDB and by server code that must not pull
// in the reactive runtime.

export type Term = string | number | boolean;
export type Fact = Term[];

/** Facts with no scope belong to the global partition. */
export const GLOBAL_SCOPE = "";

export interface BindingMarker {
  __binding: true;
  name: string;
}

export const _: unique symbol = Symbol("wildcard");
export type Wildcard = typeof _;

export type PatternTerm = Term | BindingMarker | Wildcard;
export type Pattern = PatternTerm[];
export type Bindings = Record<string, Term>;

export function isBinding(x: unknown): x is BindingMarker {
  return x != null && typeof x === "object" && (x as { __binding?: unknown }).__binding === true;
}
