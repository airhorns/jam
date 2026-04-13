// Benchmarks for the core FactDB operations.
//
// Run: pnpm bench
// These establish a performance baseline for:
//   - Fact assertion (single, bulk, with pattern invalidation)
//   - Fact removeion (exact, wildcard)
//   - Set (upsert)
//   - Query (single pattern, multi-pattern join)
//   - Pattern invalidation cost as registered patterns scale
//   - JSON.stringify factKey cost

import { bench, describe, beforeEach } from "vitest";
import { FactDB, $, _ } from "../db";

// --- Helpers ---

function freshDb(): FactDB {
  return new FactDB();
}

/** Populate a DB with N todo-style entities (2 facts each: title + done). */
function populateTodos(db: FactDB, n: number): void {
  for (let i = 0; i < n; i++) {
    db.insert("todo", i, "title", `Task ${i}`);
    db.insert("todo", i, "done", i % 3 === 0);
  }
}

/** Populate a DB with a realistic mix of app-state + VDOM facts. */
function populateRealistic(db: FactDB): void {
  // 50 todos (100 app-state facts)
  populateTodos(db, 50);
  // UI state
  db.insert("ui", "selectedSession", "s-1");
  db.insert("ui", "filter", "all");
  // 5 sessions (10 facts)
  for (let i = 0; i < 5; i++) {
    db.insert("session", `s-${i}`, "agent", "claude");
    db.insert("session", `s-${i}`, "status", "active");
  }
  // Connection
  db.insert("connection", "status", "connected");
  db.insert("connection", "hostname", "localhost");
  // VDOM-ish facts (200 element facts simulating a rendered tree)
  for (let i = 0; i < 50; i++) {
    db.insert(
      `e${i}`,
      "tag",
      i % 3 === 0 ? "div" : i % 3 === 1 ? "span" : "button",
    );
    db.insert(`e${i}`, "class", "some-class");
    db.insert(`e${i}`, "prop", "data-idx", i);
    if (i > 0)
      db.insert(`e${Math.floor((i - 1) / 3)}`, "child", i % 3, `e${i}`);
  }
}

// ============================================================================
// ASSERT
// ============================================================================

describe("remember", () => {
  bench("remember single fact (empty db)", () => {
    const db = freshDb();
    db.insert("todo", 1, "title", "Buy milk");
  });

  bench("remember 1000 unique facts", () => {
    const db = freshDb();
    for (let i = 0; i < 1000; i++) {
      db.insert("item", i, "value", i * 2);
    }
  });

  bench("remember duplicate fact (no-op)", () => {
    const db = freshDb();
    db.insert("todo", 1, "title", "Buy milk");
    // Bench the no-op path
    for (let i = 0; i < 100; i++) {
      db.insert("todo", 1, "title", "Buy milk");
    }
  });

  bench("remember with 10 registered patterns", () => {
    const db = freshDb();
    // Register patterns
    for (let i = 0; i < 10; i++) {
      db.index(["todo", $.id, "title", $.title]);
      db.index(["session", $.sid, "status", $.status]);
      db.index(["item", $.id, `attr${i}`, $.val]);
    }
    for (let i = 0; i < 100; i++) {
      db.insert("todo", i, "title", `Task ${i}`);
    }
  });

  bench("remember with 50 registered patterns", () => {
    const db = freshDb();
    for (let i = 0; i < 50; i++) {
      db.index([`type${i}`, $.id, `attr${i}`, $.val]);
    }
    for (let i = 0; i < 100; i++) {
      db.insert("todo", i, "title", `Task ${i}`);
    }
  });
});

// ============================================================================
// RETRACT
// ============================================================================

describe("forget", () => {
  bench("forget exact fact", () => {
    const db = freshDb();
    populateTodos(db, 100);
    // Retract one
    db.drop("todo", 50, "title", "Task 50");
  });

  bench("forget with wildcard (small db, 200 facts)", () => {
    const db = freshDb();
    populateTodos(db, 100);
    db.drop("todo", 50, _, _);
  });

  bench("forget with wildcard (large db, 2000 facts)", () => {
    const db = freshDb();
    populateTodos(db, 1000);
    db.drop("todo", 500, _, _);
  });
});

// ============================================================================
// SET (upsert)
// ============================================================================

describe("remember", () => {
  bench("remember on empty db", () => {
    const db = freshDb();
    db.insert("counter", "value", 0);
  });

  bench("remember upsert (replace existing)", () => {
    const db = freshDb();
    db.insert("counter", "value", 0);
    for (let i = 1; i <= 100; i++) {
      db.insert("counter", "value", i);
    }
  });

  bench("remember 100 different keys", () => {
    const db = freshDb();
    for (let i = 0; i < 100; i++) {
      db.insert("item", i, "score", Math.random());
    }
  });
});

// ============================================================================
// QUERY — single pattern
// ============================================================================

describe("query — single pattern", () => {
  bench("query 100-fact db, match all", () => {
    const db = freshDb();
    populateTodos(db, 50); // 100 facts
    db.query(["todo", $.id, "title", $.title]);
  });

  bench("query 100-fact db, match none", () => {
    const db = freshDb();
    populateTodos(db, 50);
    db.query(["nonexistent", $.id, $.val]);
  });

  bench("query 1000-fact db, selective (match ~33%)", () => {
    const db = freshDb();
    populateTodos(db, 500);
    db.query(["todo", $.id, "done", true]);
  });

  bench("query 2000-fact db, match all titles", () => {
    const db = freshDb();
    populateTodos(db, 1000);
    db.query(["todo", $.id, "title", $.title]);
  });

  bench("query realistic db (~320 facts), app-state pattern", () => {
    const db = freshDb();
    populateRealistic(db);
    db.query(["todo", $.id, "title", $.title]);
  });

  bench("query realistic db (~320 facts), VDOM pattern", () => {
    const db = freshDb();
    populateRealistic(db);
    db.query([$.el, "tag", "div"]);
  });
});

// ============================================================================
// QUERY — multi-pattern join
// ============================================================================

describe("query — multi-pattern join", () => {
  bench("2-pattern join, 100-fact db (50 todos)", () => {
    const db = freshDb();
    populateTodos(db, 50);
    db.query(["todo", $.id, "title", $.title], ["todo", $.id, "done", $.done]);
  });

  bench("2-pattern join, 2000-fact db (1000 todos)", () => {
    const db = freshDb();
    populateTodos(db, 1000);
    db.query(["todo", $.id, "title", $.title], ["todo", $.id, "done", $.done]);
  });

  bench("2-pattern join, selective (only done=true)", () => {
    const db = freshDb();
    populateTodos(db, 500);
    db.query(["todo", $.id, "done", true], ["todo", $.id, "title", $.title]);
  });

  bench("2-pattern join on realistic db, session+status", () => {
    const db = freshDb();
    populateRealistic(db);
    db.query(
      ["session", $.sid, "agent", $.agent],
      ["session", $.sid, "status", $.status],
    );
  });
});

// ============================================================================
// INDEX (per-pattern computed)
// ============================================================================

describe("index", () => {
  bench("create index (first call)", () => {
    const db = freshDb();
    db.index(["todo", $.id, "title", $.title]);
  });

  bench("index.get() on 100-fact db", () => {
    const db = freshDb();
    populateTodos(db, 50);
    const idx = db.index(["todo", $.id, "title", $.title]);
    idx.get();
  });

  bench("index.get() on 2000-fact db", () => {
    const db = freshDb();
    populateTodos(db, 1000);
    const idx = db.index(["todo", $.id, "title", $.title]);
    idx.get();
  });

  bench("index.get() repeated (cached, no changes)", () => {
    const db = freshDb();
    populateTodos(db, 100);
    const idx = db.index(["todo", $.id, "title", $.title]);
    idx.get(); // prime
    for (let i = 0; i < 100; i++) {
      idx.get(); // should be cached
    }
  });
});

// ============================================================================
// PATTERN INVALIDATION COST
// ============================================================================

describe("invalidatePatterns", () => {
  bench("remember with 0 registered patterns", () => {
    const db = freshDb();
    for (let i = 0; i < 100; i++) {
      db.insert("x", i, "val", i);
    }
  });

  bench("remember with 10 registered patterns (no match)", () => {
    const db = freshDb();
    for (let i = 0; i < 10; i++) {
      db.index([`nomatch${i}`, $.id, $.val]);
    }
    for (let i = 0; i < 100; i++) {
      db.insert("x", i, "val", i);
    }
  });

  bench("remember with 100 registered patterns (no match)", () => {
    const db = freshDb();
    for (let i = 0; i < 100; i++) {
      db.index([`nomatch${i}`, $.id, $.val]);
    }
    for (let i = 0; i < 100; i++) {
      db.insert("x", i, "val", i);
    }
  });

  bench("remember with 100 registered patterns (all match)", () => {
    const db = freshDb();
    for (let i = 0; i < 100; i++) {
      db.index(["x", $.id, "val", $.val]);
    }
    for (let i = 0; i < 100; i++) {
      db.insert("x", i, "val", i);
    }
  });
});

// ============================================================================
// JSON.stringify (factKey) cost
// ============================================================================

describe("factKey (JSON.stringify)", () => {
  bench("short fact [string, number, string, string]", () => {
    JSON.stringify(["todo", 1, "title", "Buy milk"]);
  });

  bench("long fact [string, string, string, string, string, string]", () => {
    JSON.stringify([
      "message",
      "s-123",
      "msg-456",
      "assistant",
      "text",
      "Hello world, this is a longer message content",
    ]);
  });

  bench("numeric fact [string, number, string, number]", () => {
    JSON.stringify(["session", 42, "contextUsed", 98304]);
  });
});
