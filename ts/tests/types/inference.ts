// Detailed inference tests: verify exact types via type-level assertions
import { $, _, when, type Binding } from "../../jam";
import "../../skeletons";
import type { Expect, Equal } from "./helpers";

// --- Binding proxy types ---
type _t1 = Expect<Equal<typeof $.x, Binding<"x">>>;
type _t2 = Expect<Equal<typeof $.entity, Binding<"entity">>>;

// --- Single pattern: x is string ---
when([$.x, "is", "cool"], (bindings) => {
  type _check = Expect<Equal<typeof bindings.x, string>>;
});

// --- entity: string, hp: number ---
when([$.entity, "has", "health", $.hp], (bindings) => {
  type _check1 = Expect<Equal<typeof bindings.entity, string>>;
  type _check2 = Expect<Equal<typeof bindings.hp, number>>;
});

// --- x: string, n: number ---
when([$.x, "has", $.n, "legs"], (bindings) => {
  type _check1 = Expect<Equal<typeof bindings.x, string>>;
  type _check2 = Expect<Equal<typeof bindings.n, number>>;
});

// --- Multi-skeleton match: y is union of position-2 values ---
when([$.x, "is", $.y], (bindings) => {
  type _check = Expect<Equal<typeof bindings.y, "cool" | "awesome" | "impressive" | "dead">>;
});

// --- Fully open pattern ---
when([$.a, $.b, $.c], (bindings) => {
  type _check_a = Expect<Equal<typeof bindings.a, string>>;
});

// --- Join infers from both ---
when(
  [$.x, "is", "cool"],
  [$.x, "has", $.n, "legs"],
  (bindings) => {
    type _check1 = Expect<Equal<typeof bindings.x, string>>;
    type _check2 = Expect<Equal<typeof bindings.n, number>>;
  }
);

// --- Alias preserves inference ---
const customWhen = when;
customWhen([$.x, "is", "cool"], (bindings) => {
  type _check = Expect<Equal<typeof bindings.x, string>>;
});
