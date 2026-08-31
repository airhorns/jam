import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { autorun } from "../reactive";
import {
  $,
  _,
  count,
  forget,
  limit,
  max,
  min,
  not,
  offset,
  orderBy,
  remember,
  replace,
  sum,
  transaction,
  when,
  whenever,
  where,
  type Bindings,
} from "../primitives";

beforeEach(() => {
  db.clear();
});

function seedIssues() {
  transaction(() => {
    const rows: [string, string, number, string][] = [
      ["i1", "todo", 3, "Login bug"],
      ["i2", "todo", 1, "Search is slow"],
      ["i3", "done", 5, "BUG: crash on save"],
      ["i4", "backlog", 2, "Dark mode"],
    ];
    for (const [id, status, priority, title] of rows) {
      remember("issue", id, "status", status);
      remember("issue", id, "priority", priority);
      remember("issue", id, "title", title);
    }
    remember("issue", "i3", "archived", true);
  });
}

const ids = (rows: Bindings[]) => rows.map((row) => row.id);

/** Evaluate the clauses both one-off and as a maintained index; the two must agree. */
function both(...clauses: Parameters<typeof when>): Bindings[] {
  const fresh = db.query(...clauses);
  let live: Bindings[] = [];
  const stop = autorun(() => {
    live = when(...clauses);
  });
  stop();
  expect(live).toEqual(fresh);
  return fresh;
}

describe("not", () => {
  it("hides rows the negated pattern matches", () => {
    seedIssues();
    const rows = both(["issue", $.id, "status", $.status], not("issue", $.id, "archived", _));
    expect(ids(rows)).toEqual(["i1", "i2", "i4"]);
  });

  it("joins negation variables through the row", () => {
    transaction(() => {
      remember("issue", "a", "status", "todo");
      remember("issue", "b", "status", "todo");
      remember("issue", "a", "blockedBy", "b");
    });
    expect(ids(both(["issue", $.id, "status", "todo"], not("issue", $.id, "blockedBy", $.other)))).toEqual(["b"]);
    expect(ids(both(["issue", $.id, "status", "todo"], not("issue", $.id, "blockedBy", "a")))).toEqual(["a", "b"]);
  });

  it("tracks negations reactively", () => {
    seedIssues();
    const seen: string[][] = [];
    const stop = whenever([["issue", $.id, "status", "todo"], not("issue", $.id, "archived", _)], (rows) => {
      seen.push(ids(rows) as string[]);
    });
    remember("issue", "i1", "archived", true);
    forget("issue", "i1", "archived", _);
    stop();
    expect(seen).toEqual([["i1", "i2"], ["i2"], ["i1", "i2"]]);
  });
});

describe("where", () => {
  it("compares against literals and other variables", () => {
    seedIssues();
    const issues = ["issue", $.id, "priority", $.p];
    expect(ids(both(issues, where($.p, ">=", 3)))).toEqual(["i1", "i3"]);
    expect(ids(both(issues, where($.p, "<", 3)))).toEqual(["i2", "i4"]);
    expect(ids(both(issues, where($.p, "!=", 1)))).toEqual(["i1", "i3", "i4"]);
    expect(ids(both(issues, ["issue", "i4", "priority", $.q], where($.p, "<=", $.q)))).toEqual(["i2", "i4"]);
  });

  it("matches substrings with and without case", () => {
    seedIssues();
    const titled = ["issue", $.id, "title", $.t];
    expect(ids(both(titled, where($.t, "contains", "bug")))).toEqual(["i1"]);
    expect(ids(both(titled, where($.t, "icontains", "bug")))).toEqual(["i1", "i3"]);
    expect(ids(both(titled, where($.t, "startsWith", "BUG")))).toEqual(["i3"]);
    expect(ids(both(titled, where($.t, "istartsWith", "s")))).toEqual(["i2"]);
  });

  it("accepts a list of values and a disjunction of clauses", () => {
    seedIssues();
    const status = ["issue", $.id, "status", $.s];
    expect(ids(both(status, where($.s, "in", ["todo", "backlog"])))).toEqual(["i1", "i2", "i4"]);
    expect(ids(both(status, where($.s, "in", [])))).toEqual([]);
    const rows = both(
      status,
      ["issue", $.id, "priority", $.p],
      where.any(where($.s, "=", "done"), where($.p, "=", 1)),
    );
    expect(ids(rows)).toEqual(["i2", "i3"]);
  });

  it("conjoins several where clauses", () => {
    seedIssues();
    const rows = both(
      ["issue", $.id, "status", $.s],
      ["issue", $.id, "priority", $.p],
      where($.s, "=", "todo"),
      where($.p, ">", 1),
    );
    expect(ids(rows)).toEqual(["i1"]);
  });

  it("re-evaluates when a compared value changes", () => {
    seedIssues();
    const seen: string[][] = [];
    const stop = whenever([["issue", $.id, "priority", $.p], where($.p, ">=", 3)], (rows) => {
      seen.push(ids(rows) as string[]);
    });
    replace("issue", "i2", "priority", 4);
    replace("issue", "i1", "priority", 0);
    stop();
    expect(seen).toEqual([["i1", "i3"], ["i1", "i3", "i2"], ["i3", "i2"]]);
  });

  it("rejects variables no pattern binds", () => {
    expect(() => db.query(["issue", $.id, "status", $.s], where($.p, "=", 1))).toThrow(
      "predicate variable $.p is not bound by a pattern",
    );
    expect(() => db.query(["issue", $.id, "status", $.s], where($.s, "=", $.p))).toThrow(
      "predicate variable $.p is not bound by a pattern",
    );
  });
});

describe("orderBy / offset / limit", () => {
  it("sorts by keys in the engine's term order, then by assertion order", () => {
    seedIssues();
    const issues = [
      ["issue", $.id, "priority", $.p],
      ["issue", $.id, "status", $.s],
    ];
    expect(ids(both(...issues, orderBy($.p)))).toEqual(["i2", "i4", "i1", "i3"]);
    expect(ids(both(...issues, orderBy($.p, "desc")))).toEqual(["i3", "i1", "i4", "i2"]);
    expect(ids(both(...issues, orderBy($.s), orderBy($.p, "desc")))).toEqual(["i4", "i3", "i1", "i2"]);
    remember("issue", "i5", "priority", 3);
    remember("issue", "i5", "status", "todo");
    expect(ids(both(...issues, orderBy($.p)))).toEqual(["i2", "i4", "i1", "i5", "i3"]);
  });

  it("windows the ordered rows", () => {
    seedIssues();
    const issues = ["issue", $.id, "priority", $.p];
    expect(ids(both(issues, orderBy($.p), limit(2)))).toEqual(["i2", "i4"]);
    expect(ids(both(issues, orderBy($.p), offset(1), limit(2)))).toEqual(["i4", "i1"]);
    expect(ids(both(issues, orderBy($.p), offset(3)))).toEqual(["i3"]);
    expect(ids(both(issues, orderBy($.p), offset(9)))).toEqual([]);
  });

  it("keeps a maintained window in order as rows move", () => {
    seedIssues();
    const seen: string[][] = [];
    const stop = whenever([["issue", $.id, "priority", $.p], orderBy($.p, "desc"), limit(2)], (rows) => {
      seen.push(ids(rows) as string[]);
    });
    replace("issue", "i2", "priority", 9);
    forget("issue", "i2", _, _);
    stop();
    expect(seen).toEqual([["i3", "i1"], ["i2", "i3"], ["i3", "i1"]]);
  });

  it("rejects order keys outside the output", () => {
    expect(() => db.query(["issue", $.id, "status", $.s], orderBy($.p))).toThrow("order key $.p is not in the query's output");
    expect(() => db.query(["issue", $.id, "status", $.s], count($.n), orderBy($.id))).toThrow(
      "order key $.id is not in the query's output",
    );
  });
});

describe("aggregates", () => {
  it("counts rows overall and per group", () => {
    seedIssues();
    expect(both(["issue", $.id, "status", $.s], count($.n))).toEqual([{ n: 4 }]);
    expect(both(["issue", $.id, "status", $.s], count($.n, $.s))).toEqual([
      { s: "todo", n: 2 },
      { s: "done", n: 1 },
      { s: "backlog", n: 1 },
    ]);
    expect(both(["issue", $.id, "status", "nope"], count($.n))).toEqual([]);
  });

  it("sums and takes extremes per group", () => {
    seedIssues();
    const issues = [
      ["issue", $.id, "status", $.s],
      ["issue", $.id, "priority", $.p],
    ];
    expect(both(...issues, sum($.p, $.total))).toEqual([{ total: 11 }]);
    expect(both(...issues, max($.p, $.top, $.s))).toEqual([
      { s: "todo", top: 3 },
      { s: "done", top: 5 },
      { s: "backlog", top: 2 },
    ]);
    expect(both(...issues, min($.p, $.low, $.s), orderBy($.low, "desc"))).toEqual([
      { s: "done", low: 5 },
      { s: "backlog", low: 2 },
      { s: "todo", low: 1 },
    ]);
  });

  it("combines with filters and negations", () => {
    seedIssues();
    const rows = both(["issue", $.id, "status", $.s], not("issue", $.id, "archived", _), where($.s, "!=", "backlog"), count($.n));
    expect(rows).toEqual([{ n: 2 }]);
  });

  it("maintains counts reactively", () => {
    seedIssues();
    const seen: number[] = [];
    const stop = whenever([["issue", $.id, "status", "todo"], count($.n)], (rows) => {
      seen.push((rows[0]?.n as number) ?? 0);
    });
    replace("issue", "i4", "status", "todo");
    forget("issue", "i1", _, _);
    forget("issue", "i2", _, _);
    forget("issue", "i4", _, _);
    stop();
    expect(seen).toEqual([2, 3, 2, 1, 0]);
  });

  it("rejects malformed aggregates", () => {
    const issues = ["issue", $.id, "status", $.s];
    expect(() => db.query(issues, count($.n), count($.m))).toThrow("a query has at most one aggregate");
    expect(() => db.query(issues, sum($.p, $.n))).toThrow("aggregate input $.p is not bound by a pattern");
    expect(() => db.query(issues, count($.n, $.p))).toThrow("group key $.p is not bound by a pattern");
    expect(() => db.query(issues, count($.s, $.s))).toThrow("aggregate output $.s repeats a group key");
  });
});

describe("index sharing", () => {
  it("keys maintained queries by every clause", () => {
    seedIssues();
    const a = db.index(["issue", $.id, "priority", $.p], where($.p, ">", 2));
    const b = db.index(["issue", $.id, "priority", $.p], where($.p, ">", 2));
    const c = db.index(["issue", $.id, "priority", $.p], where($.p, ">", 1));
    const d = db.index(["issue", $.id, "priority", $.p], orderBy($.p), limit(1));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    const stop = autorun(() => {
      a.get();
      c.get();
      d.get();
    });
    expect(db.stats().queries).toBe(3);
    stop();
  });
});
