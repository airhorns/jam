// Advanced: deep nesting, extracted patterns, pattern objects
import { $, _, when, claim } from "../../jam";
import "../../skeletons";
import type { Expect, Equal } from "./helpers";

// --- Deep nesting ---
when([$.entity, "is", "cool"], ({ entity }) => {
  claim(entity, "is", "awesome");

  when([$.x, "has", "health", $.hp], ({ x, hp }) => {
    type _check_x = Expect<Equal<typeof x, string>>;
    type _check_hp = Expect<Equal<typeof hp, number>>;

    if (hp <= 0) {
      claim(x, "is", "dead");
    }

    when([$.y, "is", "dead"], ({ y }) => {
      type _check_y = Expect<Equal<typeof y, string>>;
      claim(y, "should-render", "tombstone");

      when([$.z, "should-render", $.what], ({ z, what }) => {
        type _check_z = Expect<Equal<typeof z, string>>;
        type _check_what = Expect<Equal<typeof what, string>>;
      });
    });
  });
});

// --- Extracted patterns ---
const coolPattern = [$.x, "is", "cool"] as const;
const healthPattern = [$.entity, "has", "health", $.hp] as const;
const legsPattern = [$.x, "has", $.n, "legs"] as const;

when(coolPattern, (bindings) => {
  type _check = Expect<Equal<typeof bindings.x, string>>;
});

when(healthPattern, (bindings) => {
  type _check_entity = Expect<Equal<typeof bindings.entity, string>>;
  type _check_hp = Expect<Equal<typeof bindings.hp, number>>;
});

// Join with extracted patterns
when(coolPattern, legsPattern, (bindings) => {
  type _check_x = Expect<Equal<typeof bindings.x, string>>;
  type _check_n = Expect<Equal<typeof bindings.n, number>>;
});

// Reuse same pattern
when(coolPattern, ({ x }) => { claim(x, "is", "awesome"); });
when(coolPattern, ({ x }) => { claim(x, "is", "impressive"); });

// Patterns in an object
const patterns = {
  cool: [$.x, "is", "cool"] as const,
  health: [$.entity, "has", "health", $.hp] as const,
  dead: [$.x, "is", "dead"] as const,
};

when(patterns.cool, (bindings) => {
  type _check = Expect<Equal<typeof bindings.x, string>>;
});

when(patterns.health, (bindings) => {
  type _check_hp = Expect<Equal<typeof bindings.hp, number>>;
});

// Direct const assignment
const dynamicPattern = [$.x, "is", "cool" as const] as const;
when(dynamicPattern, (bindings) => {
  type _check = Expect<Equal<typeof bindings.x, string>>;
});

// --- Bad extracted pattern still caught ---
const badPattern = [$.x, "is", "kool"] as const;
// @ts-expect-error
when(badPattern, ({ x }) => {});

const badInObject = { p: [$.x, "is", "kool"] as const };
// @ts-expect-error
when(badInObject.p, ({ x }) => {});

// --- Complex join chains via nesting ---
when([$.a, "is", "cool"], ({ a }) => {
  when([$.a, "has", "health", $.hp], ({ a: a2, hp }) => {
    when([$.a, "has", $.n, "legs"], ({ a: a3, n }) => {
      type _a = Expect<Equal<typeof a, string>>;
      type _hp = Expect<Equal<typeof hp, number>>;
      type _n = Expect<Equal<typeof n, number>>;
    });
  });
});
