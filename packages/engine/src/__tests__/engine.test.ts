import { describe, expect, it, vi } from "vitest";

import {
  AGG_COUNT,
  AGG_MAX,
  AGG_SUM,
  CLAUSE_AGGREGATE,
  CLAUSE_LIMIT,
  CLAUSE_NOT,
  CLAUSE_OFFSET,
  CLAUSE_ORDER,
  CLAUSE_PATTERN,
  CLAUSE_WHERE,
  Engine,
  FACT_EVENTS_ALL,
  NONE,
  PRED_CONTAINS_CI,
  PRED_EQ,
  PRED_GE,
  PRED_LT,
  ROOT_OWNER,
  VAR_BASE,
  WILD,
  _,
  compareRows,
  compareTerms,
  packSpec,
  rowOrder,
  specArity,
  type FactEvent,
  type QueryHandle,
  type QuerySpec,
  type Sort,
} from "../index";

const v = (i: number) => VAR_BASE + i;

const decodeRows = (e: Engine, q: QueryHandle, order: readonly Sort[] = []) =>
  Array.from(q.rows.values())
    .sort(e.rowComparator(q.arity, order))
    .map((row) => e.decodeTerms(row, 0, q.arity));

const decodeQuery = (e: Engine, spec: QuerySpec) => {
  const { arity, count, data } = e.query(spec);
  return Array.from({ length: count }, (_row, r) => e.decodeTerms(data, r * arity, (r + 1) * arity));
};

describe("Engine", () => {
  it("interns terms by value and type", () => {
    const e = new Engine();
    expect(e.id("a")).toBe(e.id("a"));
    expect(e.id(1)).not.toBe(e.id("1"));
    expect(e.id(true)).toBe(1);
    expect(e.id("")).toBe(2);
    expect(e.term(e.id(2.5))).toBe(2.5);
    expect(e.term(e.id("x"))).toBe("x");
    expect(e.term(0)).toBe(false);
  });

  it("maintains query handles across flushes", () => {
    const e = new Engine();
    const issue = e.id("issue");
    const title = e.id("title");
    const project = e.id("project");
    const q = e.register([
      [issue, v(0), project, v(1)],
      [issue, v(0), title, v(2)],
    ]);
    expect(q.rows.size).toBe(0);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "project", "p1"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "title", "Bug"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i2", "title", "Orphan"]);
    const changed = e.flush();
    expect(changed).toEqual([q]);
    expect(q.version).toBe(1);
    expect(decodeRows(e, q)).toEqual([["i1", "p1", "Bug"]]);
    e.replace(ROOT_OWNER, NONE, ["issue", "i1", "title", "Feature"]);
    e.flush();
    expect(decodeRows(e, q)).toEqual([["i1", "p1", "Feature"]]);
    e.drop(["issue", "i1", _, _]);
    expect(e.flush()).toEqual([q]);
    expect(q.rows.size).toBe(0);
    q.release();
    expect(q.released).toBe(true);
    expect(e.stats().queries).toBe(0);
  });

  it("orders rows by the first clause's assertion order", () => {
    const e = new Engine();
    const todo = e.id("todo");
    const q = e.register([
      [todo, v(0), e.id("title"), v(1)],
      [todo, v(0), e.id("done"), v(2)],
    ]);
    for (const id of ["b", "a", "c"]) {
      e.assert(ROOT_OWNER, NONE, ["todo", id, "title", `${id} title`]);
      e.assert(ROOT_OWNER, NONE, ["todo", id, "done", false]);
    }
    e.flush();
    const ids = () => decodeRows(e, q).map((row) => row[0]);
    expect(ids()).toEqual(["b", "a", "c"]);
    const orders = Array.from(q.rows.values(), (row) => rowOrder(row, q.arity));
    expect(orders).toEqual([...orders].sort((x, y) => x - y));

    e.replace(ROOT_OWNER, NONE, ["todo", "a", "done", true]);
    e.flush();
    expect(ids()).toEqual(["b", "a", "c"]);

    e.replace(ROOT_OWNER, NONE, ["todo", "b", "title", "renamed"]);
    e.flush();
    expect(ids()).toEqual(["a", "c", "b"]);

    const fresh = e.query([
      [todo, v(0), e.id("title"), v(1)],
      [todo, v(0), e.id("done"), v(2)],
    ]);
    const freshIds = Array.from({ length: fresh.count }, (_, r) => e.term(fresh.data[r * fresh.arity]));
    expect(freshIds).toEqual(["a", "c", "b"]);
  });

  it("shares handles for identical clauses", () => {
    const e = new Engine();
    const a = e.register([[e.id("k"), v(0)]]);
    const b = e.register([[e.id("k"), v(0)]]);
    expect(a).toBe(b);
    a.release();
    expect(a.released).toBe(false);
    b.release();
    expect(a.released).toBe(true);
  });

  it("reads see queued writes", () => {
    const e = new Engine();
    e.assert(ROOT_OWNER, NONE, ["a", 1]);
    expect(e.has(["a", 1])).toBe(true);
    expect(e.hasPending).toBe(false);
    const result = e.query([[e.id("a"), v(0)]]);
    expect(result.count).toBe(1);
    expect(e.term(result.data[0])).toBe(1);
  });

  it("reports fact events with durability and scope", () => {
    const e = new Engine();
    e.setFactEvents(FACT_EVENTS_ALL);
    const events: FactEvent[] = [];
    e.onFact((ev) => events.push(ev));
    const owner = e.createOwner();
    e.assert(owner, NONE, ["dom", 1, "tag", "div"]);
    e.assert(ROOT_OWNER, e.id("project:p1"), ["issue", "i1", "title", "x"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "status", "open"]);
    e.revoke(owner);
    e.flush();
    expect(events.map((ev) => [ev.type, ev.durable, ev.scope, ev.terms])).toEqual([
      ["add", false, "", ["dom", 1, "tag", "div"]],
      ["add", true, "project:p1", ["issue", "i1", "title", "x"]],
      ["add", true, "project:p1", ["issue", "i1", "status", "open"]],
      ["delete", false, "", ["dom", 1, "tag", "div"]],
    ]);
    expect(e.scopeOf(["issue", "i1", "status", "open"])).toBe("project:p1");
    expect(e.facts("project:p1")).toHaveLength(2);
    expect(e.facts(undefined, ["issue", "i1", "title", _])).toEqual([
      { scope: "project:p1", terms: ["issue", "i1", "title", "x"] },
    ]);
  });

  it("clears everything", () => {
    const e = new Engine();
    const q = e.register([[e.id("a"), v(0)]]);
    e.assert(ROOT_OWNER, NONE, ["a", 1]);
    e.flush();
    expect(q.rows.size).toBe(1);
    e.clear();
    expect(e.flush()).toEqual([q]);
    expect(q.rows.size).toBe(0);
    expect(e.stats().facts).toBe(0);
  });

  it("grows the op buffer", () => {
    const e = new Engine();
    for (let i = 0; i < 5000; i++) e.assert(ROOT_OWNER, NONE, ["n", i, "v", i * 2]);
    e.flush();
    expect(e.stats().facts).toBe(5000);
    expect(e.query([[e.id("n"), v(0), e.id("v"), v(1)]]).count).toBe(5000);
  });

  it("rejects malformed clauses", () => {
    const e = new Engine();
    e.register([]).release();
    expect(() => e.raw.register(new Uint32Array([1, CLAUSE_PATTERN, 0]))).toThrow(/bad pattern length 0/);
    expect(() => e.register({ patterns: [[e.id("a"), v(0)]], where: [[{ lhs: v(1), op: PRED_EQ, rhs: e.id("x") }]] })).toThrow(
      /unbound variable 1/,
    );
    expect(() => e.query({ patterns: [[e.id("a"), v(0)]], order: [{ column: 1, descending: false }] })).toThrow(/outside the output row/);
    expect(e.stats().queries).toBe(0);
  });

  it("packs specs clause by clause", () => {
    const spec: QuerySpec = {
      patterns: [[10, v(0)]],
      not: [[11, v(0)]],
      where: [[{ lhs: v(0), op: PRED_LT, rhs: 12 }, { lhs: v(0), op: PRED_EQ, rhs: v(1) }]],
      aggregate: { op: AGG_COUNT, input: WILD, group: [v(0)] },
      order: [{ column: 1, descending: true }],
      offset: 3,
      limit: 5,
    };
    expect(Array.from(packSpec(spec))).toEqual([
      7,
      CLAUSE_PATTERN, 2, 10, v(0),
      CLAUSE_NOT, 2, 11, v(0),
      CLAUSE_WHERE, 6, v(0), PRED_LT, 12, v(0), PRED_EQ, v(1),
      CLAUSE_AGGREGATE, 3, AGG_COUNT, WILD, v(0),
      CLAUSE_ORDER, 2, v(1), 1,
      CLAUSE_OFFSET, 1, 3,
      CLAUSE_LIMIT, 1, 5,
    ]);
    expect(Array.from(packSpec([[10, v(0), v(1)]]))).toEqual([1, CLAUSE_PATTERN, 3, 10, v(0), v(1)]);
    expect(specArity(spec)).toBe(2);
    expect(specArity([[10, v(0), v(1)]])).toBe(2);
    expect(specArity({ patterns: [[10, v(0), v(1)]], offset: 0 })).toBe(2);
  });

  it("hides rows a negation matches", () => {
    const e = new Engine();
    const [issue, status, archived] = e.termIds(["issue", "status", "archived"]);
    const q = e.register({ patterns: [[issue, v(0), status, v(1)]], not: [[issue, v(0), archived, WILD]] });
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "status", "open"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i2", "status", "open"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i2", "archived", true]);
    e.flush();
    expect(decodeRows(e, q)).toEqual([["i1", "open"]]);
    e.drop(["issue", "i2", "archived", _]);
    e.flush();
    expect(decodeRows(e, q)).toEqual([["i1", "open"], ["i2", "open"]]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "archived", "yes"]);
    expect(e.flush()).toEqual([q]);
    expect(decodeRows(e, q)).toEqual([["i2", "open"]]);
  });

  it("filters rows by predicates over their bindings", () => {
    const e = new Engine();
    const [issue, title, priority] = e.termIds(["issue", "title", "priority"]);
    const spec: QuerySpec = {
      patterns: [
        [issue, v(0), title, v(1)],
        [issue, v(0), priority, v(2)],
      ],
      where: [[{ lhs: v(2), op: PRED_GE, rhs: e.id(2) }], [{ lhs: v(1), op: PRED_CONTAINS_CI, rhs: e.id("bug") }]],
    };
    const q = e.register(spec);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "title", "Login BUG"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "priority", 3]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i2", "title", "Bug in search"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i2", "priority", 1]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i3", "title", "Feature"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i3", "priority", 4]);
    e.flush();
    expect(decodeRows(e, q)).toEqual([["i1", "Login BUG", 3]]);
    expect(decodeQuery(e, spec)).toEqual([["i1", "Login BUG", 3]]);
    e.replace(ROOT_OWNER, NONE, ["issue", "i2", "priority", 2]);
    e.flush();
    expect(decodeRows(e, q).map((row) => row[0])).toEqual(["i1", "i2"]);
  });

  it("aggregates per group and orders windows by their keys", () => {
    const e = new Engine();
    const [issue, status, points] = e.termIds(["issue", "status", "points"]);
    const patterns = [
      [issue, v(0), status, v(1)],
      [issue, v(0), points, v(2)],
    ];
    const count = e.register({ patterns, aggregate: { op: AGG_COUNT, input: WILD, group: [v(1)] } });
    const total = e.register({ patterns, aggregate: { op: AGG_SUM, input: v(2), group: [] } });
    const top = e.register({ patterns, aggregate: { op: AGG_MAX, input: v(2), group: [v(1)] } });
    const order: Sort[] = [{ column: 2, descending: true }, { column: 0, descending: false }];
    const page = e.register({ patterns, order, offset: 1, limit: 2 });
    expect(count.arity).toBe(2);
    expect(total.arity).toBe(1);
    expect(page.arity).toBe(3);
    const rows: [string, string, number][] = [
      ["i1", "todo", 3],
      ["i2", "todo", 5],
      ["i3", "done", 5],
      ["i4", "done", 1],
    ];
    for (const [id, s, p] of rows) {
      e.assert(ROOT_OWNER, NONE, ["issue", id, "status", s]);
      e.assert(ROOT_OWNER, NONE, ["issue", id, "points", p]);
    }
    e.flush();
    expect(decodeRows(e, count)).toEqual([["todo", 2], ["done", 2]]);
    expect(decodeRows(e, total)).toEqual([[14]]);
    expect(decodeRows(e, top)).toEqual([["todo", 5], ["done", 5]]);
    expect(decodeRows(e, page, order)).toEqual([["i3", "done", 5], ["i1", "todo", 3]]);
    expect(decodeQuery(e, { patterns, order, offset: 1, limit: 2 }).map((row) => row[0]).sort()).toEqual(["i1", "i3"]);

    e.replace(ROOT_OWNER, NONE, ["issue", "i4", "status", "todo"]);
    e.flush();
    expect(decodeRows(e, count)).toEqual([["todo", 3], ["done", 1]]);
    expect(decodeRows(e, top)).toEqual([["todo", 5], ["done", 5]]);
    e.drop(["issue", "i3", _, _]);
    e.flush();
    expect(decodeRows(e, count)).toEqual([["todo", 3]]);
    expect(decodeRows(e, total)).toEqual([[9]]);
    expect(decodeRows(e, page, order)).toEqual([["i1", "todo", 3], ["i4", "todo", 1]]);
  });

  it("orders terms as the engine does", () => {
    const sorted = ["b", 2, true, "a", Number.NaN, false, 1, "ä", "\u{1F600}", "�"].sort(compareTerms);
    expect(sorted).toEqual([false, true, 1, 2, Number.NaN, "a", "b", "ä", "�", "\u{1F600}"]);
    expect(compareTerms(Number.NaN, Number.NaN)).toBe(0);
    expect(compareTerms(2, 1)).toBe(1);
    expect(compareTerms(1, 2)).toBe(-1);
    expect(compareTerms(1, Number.NaN)).toBe(-1);
    expect(compareTerms(Number.NaN, 1)).toBe(1);
    expect(compareTerms(true, false)).toBe(1);
    expect(compareTerms(false, true)).toBe(-1);
    expect(compareTerms("ab", "a")).toBeGreaterThan(0);
    expect(compareTerms("\u{1F600}", "�")).toBeGreaterThan(0);
    expect(compareTerms("�", "\u{1F600}")).toBeLessThan(0);
    expect(compareTerms("\u{1F600}", "\u{1F601}")).toBeLessThan(0);
  });

  it("breaks order-key ties between rows by their values", () => {
    const cmp = compareRows(2);
    const row = (a: number, b: number, hi: number, lo: number) => Uint32Array.of(a, b, hi, lo);
    expect(cmp(row(1, 1, 0, 5), row(9, 9, 1, 0))).toBeLessThan(0);
    expect(cmp(row(1, 1, 0, 5), row(9, 9, 0, 4))).toBeGreaterThan(0);
    expect(cmp(row(1, 2, 0, 0), row(1, 3, 0, 0))).toBe(-1);
    expect(cmp(row(2, 0, 0, 0), row(1, 9, 0, 0))).toBe(1);
    expect(cmp(row(1, 2, 0, 0), row(1, 2, 0, 0))).toBe(0);
  });

  it("resolves terms interned directly on the wasm instance", () => {
    const e = new Engine();
    const str = e.raw.intern_str("direct");
    const num = e.raw.intern_num(6.5);
    expect(e.term(str)).toBe("direct");
    expect(e.term(num)).toBe(6.5);
    expect(e.id("direct")).toBe(str);
    expect(e.id(6.5)).toBe(num);
  });

  it("checks owners exist and refuses to nest under a missing one", () => {
    const e = new Engine();
    const owner = e.createOwner();
    expect(e.ownerExists(ROOT_OWNER)).toBe(true);
    expect(e.ownerExists(owner)).toBe(true);
    expect(() => e.createOwner(owner + 1000)).toThrow(/does not exist/);
    e.revoke(owner);
    e.flush();
    expect(e.ownerExists(owner)).toBe(false);
  });

  it("rejects an oversized fact and stays usable afterwards", () => {
    const e = new Engine();
    e.assert(ROOT_OWNER, NONE, Array.from({ length: 9000 }, (_t, i) => `t${i}`));
    expect(() => e.flush()).toThrow(/bad fact length 9000/);
    e.assert(ROOT_OWNER, NONE, ["k", "v"]);
    e.flush();
    expect(e.stats().facts).toBe(1);
  });

  it("keeps dispatching fact events when a listener throws, until it is unsubscribed", () => {
    const e = new Engine();
    e.setFactEvents(FACT_EVENTS_ALL);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const stopThrowing = e.onFact(() => {
      throw new Error("boom");
    });
    const stopSeeing = e.onFact((event) => seen.push(event.type));
    e.assert(ROOT_OWNER, NONE, ["k", "v"]);
    e.flush();
    expect(seen).toEqual(["add"]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[jam] fact listener threw", expect.any(Error));
    stopThrowing();
    stopThrowing();
    e.assert(ROOT_OWNER, NONE, ["k", "w"]);
    e.flush();
    expect(seen).toEqual(["add", "add"]);
    expect(error).toHaveBeenCalledTimes(1);
    stopSeeing();
    e.assert(ROOT_OWNER, NONE, ["k", "x"]);
    e.flush();
    expect(seen).toEqual(["add", "add"]);
    error.mockRestore();
  });

  it("seeds a late registration with existing rows and streams later changes to row listeners", () => {
    const e = new Engine();
    e.assert(ROOT_OWNER, NONE, ["k", "a"]);
    e.assert(ROOT_OWNER, NONE, ["k", "b"]);
    e.flush();
    const q = e.register([[e.id("k"), v(0)]]);
    expect(decodeRows(e, q)).toEqual([["a"], ["b"]]);

    const seen: string[] = [];
    const stop = q.onRow((row, added) => seen.push(`${added ? "+" : "-"}${e.term(row[0])}`));
    e.assert(ROOT_OWNER, NONE, ["k", "c"]);
    e.drop(["k", "a"]);
    e.flush();
    expect(seen.sort()).toEqual(["+c", "-a"]);
    stop();
    stop();
    e.drop(["k", "b"]);
    e.flush();
    expect(seen).toHaveLength(2);
  });

  it("moves facts between scopes and reports no scope for unknown facts", () => {
    const e = new Engine();
    e.assert(ROOT_OWNER, NONE, ["k", "v"]);
    expect(e.scopeOf(["k", "v"])).toBe("");
    expect(e.scopeOf(["k", "missing"])).toBeUndefined();
    e.setScope(e.id("project:p1"), ["k", "v"]);
    expect(e.scopeOf(["k", "v"])).toBe("project:p1");
    e.free();
    expect(() => e.stats()).toThrow();
  });

  it("sorts equal-valued columns by the next one, then by insertion", () => {
    const e = new Engine();
    const q = e.register([[e.id("row"), v(0), v(1), v(2)]]);
    e.assert(ROOT_OWNER, NONE, ["row", "a", 1, "z"]);
    e.assert(ROOT_OWNER, NONE, ["row", "b", 1, "y"]);
    e.assert(ROOT_OWNER, NONE, ["row", "c", 1, "y"]);
    e.flush();
    const order = (...columns: number[]) => columns.map((column) => ({ column, descending: false }));
    expect(decodeRows(e, q, order(1, 2)).map((row) => row[0])).toEqual(["b", "c", "a"]);
    expect(decodeRows(e, q, [{ column: 2, descending: true }]).map((row) => row[0])).toEqual(["a", "b", "c"]);
  });

  it("ignores repeated releases and stale row removals", () => {
    const e = new Engine();
    const q = e.register([[e.id("k"), v(0)]]);
    q.applyRow(12345, null);
    expect(q.rows.size).toBe(0);
    q.release();
    expect(q.released).toBe(true);
    q.release();
    e.releaseHandle(q);
    expect(e.stats().queries).toBe(0);
  });

  it("forgets freed terms so reused ids resolve to their new value", () => {
    const e = new Engine();
    e.setFactEvents(FACT_EVENTS_ALL);
    const base = e.stats().terms;
    e.assert(ROOT_OWNER, NONE, ["k", "old"]);
    e.flush();
    const old = e.id("old");
    const seen: string[] = [];
    e.onFact((event) => seen.push(`${event.type}:${event.terms[1]}`));
    e.replace(ROOT_OWNER, NONE, ["k", "new"]);
    e.flush();
    expect(seen).toEqual(["delete:old", "add:new"]);
    expect(e.term(old)).toBe("old");
    e.flush();
    expect(e.stats().terms).toBe(base + 2);
    expect(() => e.term(old)).toThrow(/unknown term id/);
    expect(e.id("other")).toBe(old);
    expect(e.term(old)).toBe("other");
    expect(e.id("old")).not.toBe(old);
    expect(e.stats().termSlots).toBe(base + 4);
  });

  it("keeps the term table flat under value churn", () => {
    const e = new Engine();
    const q = e.register([[e.id("pos"), e.id("y"), v(0)]]);
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      e.replace(ROOT_OWNER, NONE, ["pos", "y", i * 0.5]);
      e.flush();
      peak = Math.max(peak, e.stats().terms);
    }
    expect(peak).toBeLessThanOrEqual(e.stats().terms + 3);
    expect(e.stats().termSlots).toBeLessThan(20);
    expect(decodeRows(e, q)).toEqual([[1999 * 0.5]]);
  });

  it("lets fact listeners intern terms while freed ids are being reported", () => {
    const e = new Engine();
    e.setFactEvents(FACT_EVENTS_ALL);
    e.assert(ROOT_OWNER, NONE, ["k", "gone"]);
    e.flush();
    const gone = e.id("gone");
    e.drop(["k", "gone"]);
    e.flush();
    let fresh = -1;
    e.onFact(() => {
      fresh = e.id("fresh");
    });
    e.assert(ROOT_OWNER, NONE, ["k", "trigger"]);
    e.flush();
    expect(fresh).toBe(gone);
    expect(e.term(gone)).toBe("fresh");
    expect(e.id("gone")).not.toBe(gone);
    expect(e.id("fresh")).toBe(gone);
  });

  it("holds the literals of registered queries", () => {
    const e = new Engine();
    const q = e.register([[e.id("only-in-query"), v(0)]]);
    const id = e.id("only-in-query");
    e.flush();
    e.flush();
    e.flush();
    expect(e.term(id)).toBe("only-in-query");
    q.release();
    e.flush();
    e.flush();
    expect(() => e.term(id)).toThrow(/unknown term id/);
  });

  it("reports its size, applying queued writes first", () => {
    const e = new Engine();
    const empty = e.stats();
    expect(empty).toMatchObject({ facts: 0, factSlots: 0, owners: 1, indexes: 0, queries: 0, resultRows: 0, routes: 0, pendingEvents: 0 });
    expect(empty.terms).toBe(empty.termSlots);
    expect(empty.wasmMemoryBytes).toBeGreaterThan(0);

    const owner = e.createOwner();
    const q = e.register([
      [e.id("issue"), v(0), e.id("title"), v(1)],
      [e.id("issue"), v(0), e.id("status"), v(2)],
    ]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "title", "a"]);
    e.assert(owner, NONE, ["issue", "i2", "title", "b"]);
    e.assert(ROOT_OWNER, NONE, ["issue", "i1", "status", "open"]);
    expect(e.hasPending).toBe(true);
    const stats = e.stats();
    expect(e.hasPending).toBe(false);
    expect(stats).toMatchObject({ facts: 3, factSlots: 3, owners: 2, queries: 1, resultRows: 1, routes: 2 });
    expect(stats.terms).toBe(empty.terms + 8);
    expect(stats.indexes).toBeGreaterThanOrEqual(1);
    expect(stats.indexBuckets).toBeGreaterThanOrEqual(3);
    expect(stats.pendingEvents).toBeGreaterThan(0);
    e.flush();
    expect(e.stats().pendingEvents).toBe(0);

    e.revoke(owner);
    q.release();
    expect(e.stats()).toMatchObject({ facts: 2, factSlots: 3, owners: 1, queries: 0, resultRows: 0, routes: 0 });
  });
});
