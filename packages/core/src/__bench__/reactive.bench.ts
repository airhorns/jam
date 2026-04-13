// Benchmarks for the reactive system: when(), whenever(), transaction(),
// and the full reactive chain from state mutation → index recompute → observer.

import { bench, describe, beforeEach } from "vitest";
import { autorun } from "mobx";
import { FactDB, $, _ } from "../db";
import {
  claim,
  forget,
  remember,
  when,
  whenever,
  transaction,
} from "../primitives";
import { db } from "../db";

// ============================================================================
// WHEN (reactive query)
// ============================================================================

describe("when() — reactive query", () => {
  beforeEach(() => db.clear());

  bench("when() on empty db", () => {
    when(["todo", $.id, "title", $.title]);
  });

  bench("when() with 100 todos", () => {
    for (let i = 0; i < 100; i++) {
      db.insert("todo", i, "title", `Task ${i}`);
    }
    when(["todo", $.id, "title", $.title]);
  });

  bench("when() repeated reads (MobX cached)", () => {
    for (let i = 0; i < 50; i++) {
      db.insert("todo", i, "title", `Task ${i}`);
    }
    when(["todo", $.id, "title", $.title]); // prime
    for (let i = 0; i < 100; i++) {
      when(["todo", $.id, "title", $.title]);
    }
  });

  bench("when() 2-pattern join with 100 todos", () => {
    for (let i = 0; i < 100; i++) {
      db.insert("todo", i, "title", `Task ${i}`);
      db.insert("todo", i, "done", i % 3 === 0);
    }
    when(["todo", $.id, "title", $.title], ["todo", $.id, "done", $.done]);
  });
});

// ============================================================================
// REACTIVE CHAIN: mutation → index invalidation → observer
// ============================================================================

describe("reactive chain: remember → when → autorun", () => {
  beforeEach(() => db.clear());

  bench("remember triggers autorun (1 index, small db)", () => {
    let count = 0;
    const disposer = autorun(() => {
      count = when(["item", $.id, $.val]).length;
    });
    for (let i = 0; i < 50; i++) {
      remember("item", i, i * 2);
    }
    disposer();
  });

  bench("remember triggers autorun (upsert, 1 index)", () => {
    let val = 0;
    const disposer = autorun(() => {
      val = (when(["counter", "value", $.val])[0]?.val as number) ?? 0;
    });
    for (let i = 0; i < 100; i++) {
      remember("counter", "value", i);
    }
    disposer();
  });

  bench("remember with 5 active indexes (only 1 matches)", () => {
    when(["todo", $.id, "title", $.title]);
    when(["session", $.sid, "status", $.status]);
    when(["connection", "status", $.s]);
    when(["plan", $.sid, $.eid, $.c, $.st, $.p]);

    let count = 0;
    const disposer = autorun(() => {
      count = when(["item", $.id, $.val]).length;
    });
    for (let i = 0; i < 50; i++) {
      remember("item", i, i);
    }
    disposer();
  });

  bench("transaction batches 50 asserts into 1 autorun", () => {
    let runs = 0;
    const disposer = autorun(() => {
      when(["item", $.id, $.val]);
      runs++;
    });
    runs = 0;

    transaction(() => {
      for (let i = 0; i < 50; i++) {
        remember("item", i, i);
      }
    });
    disposer();
  });
});

// ============================================================================
// WHENEVER
// ============================================================================

describe("whenever", () => {
  beforeEach(() => db.clear());

  bench("whenever fires on 50 matching facts", () => {
    let count = 0;
    const disposer = whenever([["todo", $.id, "done", true]], (matches) => {
      count = matches.length;
    });
    for (let i = 0; i < 50; i++) {
      remember("todo", i, "done", true);
    }
    disposer();
  });

  bench("whenever with claim() side-effects", () => {
    const disposer = whenever([["todo", $.id, "done", true]], (matches) => {
      for (const { id } of matches) {
        db.insert(`todo-${id}`, "class", "strikethrough");
      }
    });
    for (let i = 0; i < 50; i++) {
      remember("todo", i, "done", true);
    }
    disposer();
  });

  bench("whenever cleanup on disposal (50 derived facts)", () => {
    const disposer = whenever([["src", $.id, $.val]], (matches) => {
      for (const { id, val } of matches) {
        db.insert("derived", id, val);
      }
    });
    for (let i = 0; i < 50; i++) {
      remember("src", i, i * 10);
    }
    disposer();
  });
});

// ============================================================================
// TRANSACTION
// ============================================================================

describe("transaction overhead", () => {
  beforeEach(() => db.clear());

  bench("100 asserts WITHOUT transaction", () => {
    for (let i = 0; i < 100; i++) {
      remember(`item-${i}`, "val", i);
    }
  });

  bench("100 asserts WITH transaction", () => {
    transaction(() => {
      for (let i = 0; i < 100; i++) {
        remember(`item-${i}`, "val", i);
      }
    });
  });

  bench("forget + 100 asserts in transaction (plan-style)", () => {
    for (let i = 0; i < 50; i++) {
      remember("plan", "s-1", `e-${i}`, `content ${i}`, "pending", "medium");
    }
    transaction(() => {
      forget("plan", "s-1", _, _, _, _);
      for (let i = 0; i < 100; i++) {
        remember(
          "plan",
          "s-1",
          `e-${i}`,
          `new content ${i}`,
          "in_progress",
          "high",
        );
      }
    });
  });
});
