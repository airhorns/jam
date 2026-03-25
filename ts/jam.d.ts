// ============================================================================
// Jam Type Declarations
//
// Provides TypeScript type inference for the Jam reactive rule engine.
// Binding types are inferred from patterns matched against KnownSkeletons.
//
// The ONLY generated part is KnownSkeletons in skeletons.d.ts.
// Everything else here is static library code.
// ============================================================================

// --- Term types (mirrors Rust Term enum) ---

export type Term = string | number | boolean;

// --- Binding marker ---

declare const __bindingBrand: unique symbol;

export type Binding<Name extends string = string> = {
  readonly [__bindingBrand]: "binding";
  readonly name: Name;
};

// --- The $ proxy: creates bindings ---

export type BindingProxy = {
  readonly [K in
    | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i"
    | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r"
    | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"]: Binding<K>;
} & {
  readonly entity: Binding<"entity">;
  readonly name: Binding<"name">;
  readonly hp: Binding<"hp">;
  readonly source: Binding<"source">;
  readonly target: Binding<"target">;
  readonly value: Binding<"value">;
  readonly color: Binding<"color">;
  readonly type: Binding<"type">;
  readonly id: Binding<"id">;
  readonly adj: Binding<"adj">;
  readonly verb: Binding<"verb">;
  readonly what: Binding<"what">;
  readonly who: Binding<"who">;
  readonly [key: string]: Binding<string>;
};

export declare const $: BindingProxy;

// --- Wildcard ---

declare const __wildcardBrand: unique symbol;
export type Wildcard = typeof __wildcardBrand;
export declare const _: Wildcard;

// --- Or: term-level alternatives ---

export type Or<Values extends readonly Term[]> = {
  readonly __or: true;
  readonly values: Values;
};

export declare function or<const V extends readonly Term[]>(...values: V): Or<V>;

// --- Pattern term: what can appear in a pattern position ---

export type PatternTerm = Term | Binding<string> | Wildcard | Or<readonly Term[]>;

// ============================================================================
// TYPE-LEVEL PATTERN MATCHING ENGINE
// ============================================================================

// A skeleton term matches a pattern term if:
// - Binding → matches anything (captures it)
// - Wildcard → matches anything
// - Or<[...]> → at least one value matches the skeleton term
// - Literal → must equal the skeleton term, or skeleton is a wide type containing it
type TermMatches<P, S> =
  P extends Binding<any> ? true :
  P extends Wildcard ? true :
  P extends Or<infer Values> ? _OrTermMatches<Values, S> :
  P extends S ? true :
  S extends P ? true :
  false;

type _OrTermMatches<Values, S> =
  Values extends readonly [infer Head, ...infer Tail]
    ? Head extends S ? true
      : S extends Head ? true
      : _OrTermMatches<Tail, S>
    : false;

// Check if a pattern matches a skeleton (same length, each term matches)
type PatternMatchesSkeleton<P extends readonly any[], S extends readonly any[]> =
  P["length"] extends S["length"]
    ? _AllTermsMatch<P, S>
    : false;

type _AllTermsMatch<P extends readonly any[], S extends readonly any[], I extends any[] = []> =
  I["length"] extends P["length"]
    ? true
    : TermMatches<P[I["length"]], S[I["length"]]> extends true
      ? _AllTermsMatch<P, S, [...I, any]>
      : false;

// Find which skeleton keys a pattern matches
type MatchingSkeletonKeys<P extends readonly any[]> = {
  [K in keyof KnownSkeletons]: KnownSkeletons[K] extends readonly any[]
    ? PatternMatchesSkeleton<P, KnownSkeletons[K]> extends true
      ? K
      : never
    : never;
}[keyof KnownSkeletons];

// Does this pattern match at least one skeleton?
export type HasMatchingSkeleton<P extends readonly any[]> =
  MatchingSkeletonKeys<P> extends never ? false : true;

// Union of all matching skeleton tuples
type MatchingSkeletonUnion<P extends readonly any[]> =
  KnownSkeletons[MatchingSkeletonKeys<P> & keyof KnownSkeletons];

// Infer the type of a binding at a given name from matched skeletons
type InferBindingType<P extends readonly any[], Name extends string> =
  _InferFromSkeletons<P, Name, MatchingSkeletonUnion<P>>;

type _InferFromSkeletons<P extends readonly any[], Name extends string, S> =
  S extends readonly any[]
    ? _FindBindingPosition<P, Name> extends infer Pos
      ? Pos extends number
        ? S[Pos]
        : Term
      : Term
    : Term;

type _FindBindingPosition<P extends readonly any[], Name extends string, I extends any[] = []> =
  I["length"] extends P["length"]
    ? never
    : P[I["length"]] extends Binding<Name>
      ? I["length"]
      : _FindBindingPosition<P, Name, [...I, any]>;

// Extract all binding names from a pattern
type ExtractBindingNames<P extends readonly any[]> =
  P[number] extends infer U
    ? U extends Binding<infer N> ? N : never
    : never;

// Build the full bindings object type for a pattern
export type InferBindings<P extends readonly any[]> = {
  [K in ExtractBindingNames<P>]: InferBindingType<P, K>;
};

// Merge bindings from two patterns (for joins)
type MergeBindings<P1 extends readonly any[], P2 extends readonly any[]> =
  InferBindings<P1> & InferBindings<P2>;

type MergeBindings3<
  P1 extends readonly any[],
  P2 extends readonly any[],
  P3 extends readonly any[],
> = InferBindings<P1> & InferBindings<P2> & InferBindings<P3>;

// ============================================================================
// PUBLIC API
// ============================================================================

export type Rule = { readonly __rule: true };

// Pattern validation: produces a readable error if the pattern is unreachable
type ValidatedPattern<P extends readonly PatternTerm[]> =
  HasMatchingSkeleton<P> extends true
    ? readonly [...P]
    : ["ERROR: pattern does not match any known statement shape"];

// Single-pattern when
export declare function when<const P extends readonly PatternTerm[]>(
  pattern: ValidatedPattern<P>,
  body: (bindings: InferBindings<P>) => void,
): Rule;

// Two-pattern when (join)
export declare function when<
  const P1 extends readonly PatternTerm[],
  const P2 extends readonly PatternTerm[],
>(
  pattern1: ValidatedPattern<P1>,
  pattern2: ValidatedPattern<P2>,
  body: (bindings: MergeBindings<P1, P2>) => void,
): Rule;

// Three-pattern when (join)
export declare function when<
  const P1 extends readonly PatternTerm[],
  const P2 extends readonly PatternTerm[],
  const P3 extends readonly PatternTerm[],
>(
  pattern1: ValidatedPattern<P1>,
  pattern2: ValidatedPattern<P2>,
  pattern3: ValidatedPattern<P3>,
  body: (bindings: MergeBindings3<P1, P2, P3>) => void,
): Rule;

// claim() and wish() — assert facts (lifecycle-managed)
export declare function claim(...terms: Term[]): void;
export declare function wish(...terms: Term[]): void;

// assert() / retract() — raw fact operations (no lifecycle management)
// Facts persist until explicitly retracted. Can be called from anywhere.
export declare function assert(...terms: Term[]): void;
export declare function retract(...terms: Term[]): void;

// hold() — persistent mutable state (like Folk's Hold!)
// Creates a scope where claim() calls accumulate facts.
// When called again with the same key, old facts are retracted and new ones asserted.
//
// Usage:
//   hold(() => { claim("counter", "count", 0); });              // auto-key from context
//   hold("counter", () => { claim("counter", "count", 0); });   // explicit key
export declare function hold(fn: () => void): void;
export declare function hold(key: string, fn: () => void): void;

// $this — current entity identity (like Folk's $this)
// Scoped by child() calls. Defaults to "root".
export declare const $this: string;

// child() — create a nested entity scope
// Derives child ID as `${parent}/${name}`, auto-claims parent-child relationship,
// and sets $this to the child ID for the duration of fn.
export declare function child(name: string, fn: () => void): void;

// ============================================================================
// JSX SUPPORT
// ============================================================================

// Element descriptor returned by h()
export interface JamElement {
  readonly __jamElement: true;
  readonly type: string | Function;
  readonly props: Record<string, any>;
  readonly children: any[];
  readonly key?: string;
}

// JSX factory function — transpiled from JSX syntax by OXC
export declare function h(
  type: string | Function,
  props: Record<string, any> | null,
  ...children: any[]
): JamElement;

// Fragment — for grouping elements without a wrapper entity
export declare const Fragment: symbol;

// Render a JSX element tree into claims
export declare function render(element: JamElement, parentId?: string): void;

// Re-export component types for convenience
export type {
  Font,
  Color,
  Alignment,
  VStackProps,
  HStackProps,
  ZStackProps,
  TextProps,
  ButtonProps,
  SpacerProps,
  ImageProps,
} from "./components";

// Re-export components
export {
  VStack,
  HStack,
  ZStack,
  Text,
  Button,
  Spacer,
  Image,
} from "./components";

// ============================================================================
// JSX IntrinsicElements — TypeScript uses this for JSX type checking
// ============================================================================

import type {
  VStackProps,
  HStackProps,
  ZStackProps,
  TextProps,
  ButtonProps,
  SpacerProps,
  ImageProps,
} from "./components";

declare global {
  namespace JSX {
    type Element = JamElement;
    interface IntrinsicElements {}
  }
}

// ============================================================================
// GENERATED: KnownSkeletons
// This interface is the ONLY part that changes. It's augmented by skeletons.d.ts.
// ============================================================================

export interface KnownSkeletons {}
