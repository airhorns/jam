import { describe, expect, it } from "vitest";

import { Engine, FACT_EVENTS_ALL, NONE, ROOT_OWNER, VAR_BASE, WILD, _, compareRows, rowOrder, type FactEvent, type QueryHandle } from "../index";

const v = (i: number) => VAR_BASE + i;

const decodeRows = (e: Engine, q: QueryHandle) =>
  Array.from(q.rows.values())
    .sort(compareRows(q.nvars))
    .map((row) => e.decodeTerms(row, 0, q.nvars));

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
    const orders = Array.from(q.rows.values(), (row) => rowOrder(row, q.nvars));
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
    const freshIds = Array.from({ length: fresh.count }, (_, r) => e.term(fresh.data[r * fresh.nvars]));
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
    expect(() => e.register([])).not.toThrow();
    expect(() => e.raw.register(new Uint32Array([1, 5, WILD]))).toThrow();
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
