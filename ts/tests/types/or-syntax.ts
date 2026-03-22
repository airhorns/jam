// or() syntax tests
import { $, _, when, claim, or } from "../../jam";
import "../../skeletons";
import type { Expect, Equal } from "./helpers";

// --- Basic or ---
when([$.x, "is", or("cool", "awesome")], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
  x.toUpperCase();
  claim(x, "is", "impressive");
});

// --- or with all "is" variants ---
when([$.x, "is", or("cool", "awesome", "impressive", "dead")], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
});

// --- or in a different position ---
when([$.x, or("is", "has"), $.y], ({ x, y }) => {
  type _check_x = Expect<Equal<typeof x, string>>;
});

// --- or with typo caught ---
// @ts-expect-error — neither "kool" nor "lame" exist at position 2
when([$.x, "is", or("kool", "lame")], ({ x }) => {});

// --- Partial or: one valid, one invalid → still matches ---
when([$.x, "is", or("cool", "kool")], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
});

// --- or with wrong types ---
// @ts-expect-error — no skeleton has number at position 2 after "is"
when([$.x, "is", or(42, 99)], ({ x }) => {});

// --- or with join ---
when(
  [$.x, "is", or("cool", "awesome")],
  [$.x, "has", $.n, "legs"],
  ({ x, n }) => {
    type _check_x = Expect<Equal<typeof x, string>>;
    type _check_n = Expect<Equal<typeof n, number>>;
  }
);

// --- or with wildcard ---
when([_, "is", or("cool", "dead")], () => {
  claim("somebody", "is", "notable");
});

// --- Extracted or ---
const aliveOrDead = or("cool", "dead");
when([$.x, "is", aliveOrDead], ({ x }) => {
  type _check = Expect<Equal<typeof x, string>>;
});
