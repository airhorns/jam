// Verify binding type inference is per-when-call, not global
import { $, when } from "../../jam";
import "../../skeletons";
import type { Expect, Equal } from "./helpers";

// Same $.x, different pattern → different type for x in each callback

when([$.x, "is", "cool"], (bindings) => {
  type _check = Expect<Equal<typeof bindings.x, string>>;
});

when([$.x, "has", "health", $.hp], (bindings) => {
  type _check_x = Expect<Equal<typeof bindings.x, string>>;
  type _check_hp = Expect<Equal<typeof bindings.hp, number>>;
});

when([$.x, "is", $.y], (bindings) => {
  type _check_y = Expect<Equal<typeof bindings.y, "cool" | "awesome" | "impressive" | "dead">>;
});

when([$.x, "should-render", $.y], (bindings) => {
  // y is string here (from a different skeleton), NOT the union above
  type _check_y = Expect<Equal<typeof bindings.y, string>>;
});

when([$.x, "has", $.n, "legs"], (bindings) => {
  type _check_x = Expect<Equal<typeof bindings.x, string>>;
  type _check_n = Expect<Equal<typeof bindings.n, number>>;
});
