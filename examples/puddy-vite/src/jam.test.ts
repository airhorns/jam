import { describe, it, expect, beforeEach } from "vitest";
import {
  db,
  assert,
  retract,
  hold,
  claim,
  useWhen,
  matchPattern,
  $,
  _,
  or,
} from "./jam";

beforeEach(() => {
  db.clear();
});

// ============================================================================
// Pattern matching
// ============================================================================

describe("matchPattern", () => {
  it("matches exact literals", () => {
    expect(matchPattern(["a", "b", "c"], ["a", "b", "c"])).toEqual({});
    expect(matchPattern(["a", "b", "c"], ["a", "b", "d"])).toBeNull();
  });

  it("rejects length mismatches", () => {
    expect(matchPattern(["a", "b"], ["a", "b", "c"])).toBeNull();
    expect(matchPattern(["a", "b", "c"], ["a", "b"])).toBeNull();
  });

  it("captures bindings", () => {
    expect(matchPattern([$.x, "is", "cool"], ["omar", "is", "cool"])).toEqual({
      x: "omar",
    });
  });

  it("captures multiple bindings", () => {
    expect(
      matchPattern([$.x, "has", $.y, "legs"], ["dog", "has", 4, "legs"]),
    ).toEqual({ x: "dog", y: 4 });
  });

  it("enforces consistent bindings", () => {
    // Same variable must match same value
    expect(matchPattern([$.x, $.x], ["a", "a"])).toEqual({ x: "a" });
    expect(matchPattern([$.x, $.x], ["a", "b"])).toBeNull();
  });

  it("matches wildcards", () => {
    expect(matchPattern([_, "is", "cool"], ["anyone", "is", "cool"])).toEqual(
      {},
    );
    expect(
      matchPattern([_, "is", "cool"], ["anyone", "is", "bad"]),
    ).toBeNull();
  });

  it("matches or patterns", () => {
    expect(
      matchPattern(
        [$.x, "is", or("cool", "awesome")],
        ["omar", "is", "cool"],
      ),
    ).toEqual({ x: "omar" });
    expect(
      matchPattern(
        [$.x, "is", or("cool", "awesome")],
        ["omar", "is", "awesome"],
      ),
    ).toEqual({ x: "omar" });
    expect(
      matchPattern([$.x, "is", or("cool", "awesome")], ["omar", "is", "bad"]),
    ).toBeNull();
  });

  it("handles boolean and number terms", () => {
    expect(matchPattern([$.x, true, 42], ["key", true, 42])).toEqual({
      x: "key",
    });
    expect(matchPattern([$.x, true, 42], ["key", false, 42])).toBeNull();
  });
});

// ============================================================================
// Assert / Retract
// ============================================================================

describe("assert / retract", () => {
  it("adds facts", () => {
    assert("omar", "is", "cool");
    expect(db.size).toBe(1);
    expect(db.allFacts()).toEqual([["omar", "is", "cool"]]);
  });

  it("deduplicates facts", () => {
    assert("omar", "is", "cool");
    assert("omar", "is", "cool");
    expect(db.size).toBe(1);
  });

  it("retracts facts", () => {
    assert("omar", "is", "cool");
    retract("omar", "is", "cool");
    expect(db.size).toBe(0);
  });

  it("retract of non-existent is no-op", () => {
    retract("omar", "is", "cool");
    expect(db.size).toBe(0);
  });

  it("increments version on assert", () => {
    const v0 = db.version.value;
    assert("a", "b");
    expect(db.version.value).toBe(v0 + 1);
  });

  it("increments version on retract", () => {
    assert("a", "b");
    const v1 = db.version.value;
    retract("a", "b");
    expect(db.version.value).toBe(v1 + 1);
  });

  it("does not increment version on duplicate assert", () => {
    assert("a", "b");
    const v1 = db.version.value;
    assert("a", "b");
    expect(db.version.value).toBe(v1);
  });

  it("does not increment version on retract of non-existent", () => {
    const v0 = db.version.value;
    retract("a", "b");
    expect(db.version.value).toBe(v0);
  });
});

// ============================================================================
// Query (single pattern)
// ============================================================================

describe("query (single pattern)", () => {
  it("returns empty for no matches", () => {
    assert("omar", "is", "cool");
    expect(db.query([$.x, "is", "bad"])).toEqual([]);
  });

  it("returns matching bindings", () => {
    assert("omar", "is", "cool");
    assert("alice", "is", "cool");
    assert("bob", "is", "bad");

    const results = db.query([$.x, "is", "cool"]);
    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ x: "omar" });
    expect(results).toContainEqual({ x: "alice" });
  });

  it("returns empty bindings for fully literal pattern", () => {
    assert("omar", "is", "cool");
    const results = db.query(["omar", "is", "cool"]);
    expect(results).toEqual([{}]);
  });

  it("queries with wildcards", () => {
    assert("omar", "is", "cool");
    assert("alice", "is", "awesome");

    const results = db.query([_, "is", _]);
    expect(results).toHaveLength(2);
  });

  it("queries with or", () => {
    assert("omar", "is", "cool");
    assert("alice", "is", "awesome");
    assert("bob", "is", "bad");

    const results = db.query([$.x, "is", or("cool", "awesome")]);
    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ x: "omar" });
    expect(results).toContainEqual({ x: "alice" });
  });
});

// ============================================================================
// Query (multi-pattern joins)
// ============================================================================

describe("query (joins)", () => {
  it("joins on shared variable", () => {
    assert("session", "s1", "agent", "claude");
    assert("session", "s1", "status", "active");
    assert("session", "s2", "agent", "gpt");
    assert("session", "s2", "status", "ended");

    const results = db.query(
      ["session", $.sid, "agent", $.agent],
      ["session", $.sid, "status", $.status],
    );

    expect(results).toHaveLength(2);
    expect(results).toContainEqual({
      sid: "s1",
      agent: "claude",
      status: "active",
    });
    expect(results).toContainEqual({
      sid: "s2",
      agent: "gpt",
      status: "ended",
    });
  });

  it("cross product with no shared variables", () => {
    assert("a", "1");
    assert("b", "2");

    const results = db.query([$.x, "1"], [$.y, "2"]);
    expect(results).toEqual([{ x: "a", y: "b" }]);
  });

  it("filters on shared variables", () => {
    assert("session", "s1", "agent", "claude");
    assert("session", "s1", "status", "active");
    assert("session", "s2", "agent", "gpt");
    // s2 has no status — join should only return s1

    const results = db.query(
      ["session", $.sid, "agent", $.agent],
      ["session", $.sid, "status", $.status],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      sid: "s1",
      agent: "claude",
      status: "active",
    });
  });

  it("three-pattern join", () => {
    assert("session", "s1", "agent", "claude");
    assert("session", "s1", "status", "active");
    assert("session", "s1", "mode", "architect");

    const results = db.query(
      ["session", $.sid, "agent", $.agent],
      ["session", $.sid, "status", $.status],
      ["session", $.sid, "mode", $.mode],
    );

    expect(results).toEqual([
      { sid: "s1", agent: "claude", status: "active", mode: "architect" },
    ]);
  });
});

// ============================================================================
// Hold
// ============================================================================

describe("hold", () => {
  it("asserts facts from callback", () => {
    hold("test", () => {
      claim("a", "b");
      claim("c", "d");
    });
    expect(db.size).toBe(2);
    expect(db.allFacts()).toContainEqual(["a", "b"]);
    expect(db.allFacts()).toContainEqual(["c", "d"]);
  });

  it("replaces facts on second call", () => {
    hold("test", () => {
      claim("a", "old");
    });
    expect(db.query(["a", $.v])).toEqual([{ v: "old" }]);

    hold("test", () => {
      claim("a", "new");
    });
    expect(db.query(["a", $.v])).toEqual([{ v: "new" }]);
    expect(db.size).toBe(1);
  });

  it("retracts all facts with empty callback", () => {
    hold("test", () => {
      claim("a", "b");
      claim("c", "d");
    });
    expect(db.size).toBe(2);

    hold("test", () => {});
    expect(db.size).toBe(0);
  });

  it("different keys are independent", () => {
    hold("key1", () => {
      claim("a", 1);
    });
    hold("key2", () => {
      claim("b", 2);
    });
    expect(db.size).toBe(2);

    hold("key1", () => {});
    expect(db.size).toBe(1);
    expect(db.allFacts()).toEqual([["b", 2]]);
  });

  it("increments version once per hold call", () => {
    const v0 = db.version.value;
    hold("test", () => {
      claim("a", 1);
      claim("b", 2);
      claim("c", 3);
    });
    // Should increment exactly once regardless of how many claims
    expect(db.version.value).toBe(v0 + 1);
  });
});

// ============================================================================
// Claim outside hold
// ============================================================================

describe("claim outside hold", () => {
  it("directly asserts", () => {
    claim("a", "b");
    expect(db.size).toBe(1);
    expect(db.allFacts()).toEqual([["a", "b"]]);
  });
});

// ============================================================================
// useWhen (reactive queries)
// ============================================================================

describe("useWhen", () => {
  it("returns current matches", () => {
    assert("omar", "is", "cool");
    assert("alice", "is", "cool");

    const result = useWhen([$.x, "is", "cool"]);
    expect(result.value).toHaveLength(2);
    expect(result.value).toContainEqual({ x: "omar" });
    expect(result.value).toContainEqual({ x: "alice" });
  });

  it("updates when facts change", () => {
    const result = useWhen([$.x, "is", "cool"]);
    expect(result.value).toEqual([]);

    assert("omar", "is", "cool");
    expect(result.value).toEqual([{ x: "omar" }]);

    assert("alice", "is", "cool");
    expect(result.value).toHaveLength(2);

    retract("omar", "is", "cool");
    expect(result.value).toEqual([{ x: "alice" }]);
  });

  it("works with multi-pattern joins", () => {
    const result = useWhen(
      ["session", $.sid, "agent", $.agent],
      ["session", $.sid, "status", $.status],
    );
    expect(result.value).toEqual([]);

    assert("session", "s1", "agent", "claude");
    // Still no match — need both patterns
    assert("session", "s1", "status", "active");
    expect(result.value).toEqual([
      { sid: "s1", agent: "claude", status: "active" },
    ]);
  });

  it("updates reactively with hold", () => {
    const result = useWhen(["connection", "status", $.status]);

    hold("connection", () => {
      claim("connection", "status", "checking");
    });
    expect(result.value).toEqual([{ status: "checking" }]);

    hold("connection", () => {
      claim("connection", "status", "connected");
    });
    expect(result.value).toEqual([{ status: "connected" }]);
  });
});
