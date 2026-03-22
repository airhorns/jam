// Negative tests: verify type assertions are real, not vacuously passing
import { $, when } from "../../jam";
import "../../skeletons";
import type { Expect, Equal } from "./helpers";

// --- Sanity: Equal rejects mismatches ---
// @ts-expect-error
type _s1 = Expect<Equal<string, number>>;
// @ts-expect-error
type _s2 = Expect<Equal<"cool", string>>;

// --- x is NOT any/number ---
when([$.x, "is", "cool"], (bindings) => {
  // @ts-expect-error
  type _bad = Expect<Equal<typeof bindings.x, number>>;
});

// --- hp is number, NOT string ---
when([$.entity, "has", "health", $.hp], (bindings) => {
  // @ts-expect-error
  type _bad = Expect<Equal<typeof bindings.hp, string>>;
  type _good = Expect<Equal<typeof bindings.hp, number>>;
});

// --- Unreachable pattern rejected ---
// @ts-expect-error
when([$.x, "is", "kool"], ({ x }) => {});

// --- Wrong length rejected ---
// @ts-expect-error
when([$.x, "is"], ({ x }) => {});

// --- Binding name mismatch caught ---
when([$.x, "is", "cool"], ({
  // @ts-expect-error
  y
}) => {});

// --- y is the full union, not just "cool" ---
when([$.x, "is", $.y], (bindings) => {
  // @ts-expect-error
  type _bad = Expect<Equal<typeof bindings.y, "cool">>;
  type _good = Expect<Equal<typeof bindings.y, "cool" | "awesome" | "impressive" | "dead">>;
});

// --- Join: n is number, not string ---
when(
  [$.x, "is", "cool"],
  [$.x, "has", $.n, "legs"],
  (bindings) => {
    // @ts-expect-error
    type _bad = Expect<Equal<typeof bindings.n, string>>;
    type _good = Expect<Equal<typeof bindings.n, number>>;
  }
);
