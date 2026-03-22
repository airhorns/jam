// Multi-word / arbitrary-length statement patterns
import { $, _, when, claim, or } from "../../jam";
import "../../skeletons";
import type { Expect, Equal } from "./helpers";

// --- "harry is too hot" ---
when([$.x, "is", "too", $.y], ({ x, y }) => {
  type _check_x = Expect<Equal<typeof x, string>>;
  type _check_y = Expect<Equal<typeof y, string>>;
  x.toUpperCase();
  y.toUpperCase();
  claim(x, "is", "cool");
});

// --- Wildcard in middle ---
when([$.x, "is", "too", _], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
});

// --- Only capture the adjective ---
when([_, "is", "too", $.adj], ({ adj }) => {
  type _check = Expect<Equal<typeof adj, string>>;
});

// --- 4-term doesn't cross-match 3-term ---
when([$.x, "is", "cool"], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
});

// --- Typo in 4-term fixed term ---
// @ts-expect-error
when([$.x, "is", "toooo", $.y], ({ x, y }) => {});

// --- or in 4-term pattern ---
when([$.x, "is", "too", or("hot", "cold")], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
});

// --- Join 3-term and 4-term ---
when(
  [$.x, "is", "cool"],
  [$.x, "is", "too", $.y],
  ({ x, y }) => {
    type _check_x = Expect<Equal<typeof x, string>>;
    type _check_y = Expect<Equal<typeof y, string>>;
    claim(x, "is", "impressive");
  }
);
