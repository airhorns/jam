// Benchmarks for the reactive system: when(), whenever(), transaction(),
// and the full reactive chain from state mutation → index recompute → observer.
//
// These measure the overhead of MobX reactivity on top of raw DB operations.

import { bench, describe, beforeEach } from "vitest";
import { autorun } from "mobx";
import { FactDB, $, _ } from "../db";
import { assert, retract, set, when, whenever, transaction } from "../primitives";
import { db } from "../db";

// ============================================================================
// WHEN (reactive query)
// ============================================================================

describe("when() — reactive query", () => {
  beforeEach(() => db.clear());

  bench("when().get() on empty db", () => {
    const idx = when(["todo", $.id, "title", $.title]);
    idx.get();
  });

  bench("when().get() with 100 todos", () => {
    for (let i = 0; i < 100; i++) {
      db.assert("todo", i, "title", `Task ${i}`);
    }
    const idx = when(["todo", $.id, "title", $.title]);
    idx.get();
  });

  bench("when().get() repeated reads (MobX cached)", () => {
    for (let i = 0; i < 50; i++) {
      db.assert("todo", i, "title", `Task ${i}`);
    }
    const idx = when(["todo", $.id, "title", $.title]);
    idx.get(); // prime
    for (let i = 0; i < 100; i++) {
      idx.get();
    }
  });

  bench("when() 2-pattern join with 100 todos", () => {
    for (let i = 0; i < 100; i++) {
      db.assert("todo", i, "title", `Task ${i}`);
      db.assert("todo", i, "done", i % 3 === 0);
    }
    const idx = when(
      ["todo", $.id, "title", $.title],
      ["todo", $.id, "done", $.done],
    );
    idx.get();
  });
});

// ============================================================================
// REACTIVE CHAIN: mutation → index invalidation → observer
// ============================================================================

describe("reactive chain: assert → when → autorun", () => {
  beforeEach(() => db.clear());

  bench("assert triggers autorun (1 index, small db)", () => {
    const idx = when(["item", $.id, $.val]);
    let count = 0;
    const disposer = autorun(() => { count = idx.get().length; });
    for (let i = 0; i < 50; i++) {
      assert("item", i, i * 2);
    }
    disposer();
  });

  bench("set triggers autorun (upsert, 1 index)", () => {
    const idx = when(["counter", "value", $.val]);
    let val = 0;
    const disposer = autorun(() => { val = (idx.get()[0]?.val as number) ?? 0; });
    for (let i = 0; i < 100; i++) {
      set("counter", "value", i);
    }
    disposer();
  });

  bench("assert with 5 active indexes (only 1 matches)", () => {
    when(["todo", $.id, "title", $.title]);
    when(["session", $.sid, "status", $.status]);
    when(["connection", "status", $.s]);
    when(["plan", $.sid, $.eid, $.c, $.st, $.p]);
    const idx = when(["item", $.id, $.val]);

    let count = 0;
    const disposer = autorun(() => { count = idx.get().length; });
    for (let i = 0; i < 50; i++) {
      assert("item", i, i);
    }
    disposer();
  });

  bench("transaction batches 50 asserts into 1 autorun", () => {
    const idx = when(["item", $.id, $.val]);
    let runs = 0;
    const disposer = autorun(() => { idx.get(); runs++; });
    runs = 0; // reset after initial run

    transaction(() => {
      for (let i = 0; i < 50; i++) {
        assert("item", i, i);
      }
    });
    // Should have run exactly once
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
    const disposer = whenever(
      [["todo", $.id, "done", true]],
      (matches) => { count = matches.length; },
    );
    for (let i = 0; i < 50; i++) {
      assert("todo", i, "done", true);
    }
    disposer();
  });

  bench("whenever with claim() side-effects", () => {
    const disposer = whenever(
      [["todo", $.id, "done", true]],
      (matches) => {
        for (const { id } of matches) {
          db.assert(`todo-${id}`, "class", "strikethrough");
        }
      },
    );
    for (let i = 0; i < 50; i++) {
      assert("todo", i, "done", true);
    }
    disposer();
  });

  bench("whenever cleanup on disposal (50 derived facts)", () => {
    const disposer = whenever(
      [["src", $.id, $.val]],
      (matches) => {
        for (const { id, val } of matches) {
          db.assert("derived", id, val);
        }
      },
    );
    for (let i = 0; i < 50; i++) {
      assert("src", i, i * 10);
    }
    disposer(); // should retract all derived facts
  });
});

// ============================================================================
// TRANSACTION
// ============================================================================

describe("transaction overhead", () => {
  beforeEach(() => db.clear());

  bench("100 asserts WITHOUT transaction", () => {
    for (let i = 0; i < 100; i++) {
      assert(`item-${i}`, "val", i);
    }
  });

  bench("100 asserts WITH transaction", () => {
    transaction(() => {
      for (let i = 0; i < 100; i++) {
        assert(`item-${i}`, "val", i);
      }
    });
  });

  bench("retract + 100 asserts in transaction (plan-style)", () => {
    // Simulate initial plan
    for (let i = 0; i < 50; i++) {
      assert("plan", "s-1", `e-${i}`, `content ${i}`, "pending", "medium");
    }
    // Replace all
    transaction(() => {
      retract("plan", "s-1", _, _, _, _);
      for (let i = 0; i < 100; i++) {
        assert("plan", "s-1", `e-${i}`, `new content ${i}`, "in_progress", "high");
      }
    });
  });
});
