// Basic type tests: binding inference, typo detection, wildcards, joins
import { $, _, when, claim, wish, or } from "../../jam";
import "../../skeletons";

// --- Single-pattern binding inference ---
when([$.x, "is", "cool"], ({ x }) => {
  // @ts-expect-error — x is string, not number
  const _bad: number = x;
  const _ok: string = x;
  x.toUpperCase();
  claim(x, "is", "awesome");
});

// --- Number binding ---
when([$.entity, "has", "health", $.hp], ({ entity, hp }) => {
  entity.toUpperCase();
  hp.toFixed(2);
  // @ts-expect-error — hp is number, not string
  hp.toUpperCase();
});

// --- Typo in pattern ---
// @ts-expect-error — "kool" matches no skeleton
when([$.x, "is", "kool"], ({ x }) => {
  claim(x, "is", "awesome");
});

// --- Wildcard ---
when([_, "is", "cool"], () => {
  claim("somebody", "is", "cool");
});

// --- Multiple matching skeletons ---
when([$.x, "is", $.y], ({ x, y }) => {
  x.toUpperCase();
  y.toUpperCase();
});

// --- Join ---
when(
  [$.x, "is", "cool"],
  [$.x, "has", $.n, "legs"],
  ({ x, n }) => {
    x.toUpperCase();
    n.toFixed(2);
    // @ts-expect-error — n is number, not string
    n.toUpperCase();
  }
);

// --- Wrong binding name in callback ---
when([$.x, "is", "cool"], ({
  // @ts-expect-error — 'y' is not a binding in this pattern
  y
}) => {
  console.log(y);
});

// --- Works through alias ---
const myWhen = when;
myWhen([$.x, "is", "cool"], ({ x }) => {
  x.toUpperCase();
});

// --- All-wildcard pattern ---
when([_, "is", "cool"], () => {
  claim("world", "is", "awesome");
});

// --- Wrong length patterns ---
// @ts-expect-error
when([$.x, "is"], ({ x }) => {});

// @ts-expect-error
when([$.x, "is", "cool", "very"], ({ x }) => {});

// --- claim/wish with mixed types ---
claim("omar", "is", "cool");
claim("omar", "has", "health", 100);
wish("omar", "should-render", "sparkles");
