import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { $, FactDB, type Fact } from "../db";
import { ENGINE_STATS_FACT, publishStats } from "../stats";

describe("publishStats", () => {
  let db: FactDB;
  const stat = (name: string) => db.query([ENGINE_STATS_FACT, name, $.value])[0]?.value;

  beforeEach(() => {
    vi.useFakeTimers();
    db = new FactDB();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes every field of db.stats() and refreshes changed ones on the interval", () => {
    db.insert("todo", 1, "title", "a");
    const stop = publishStats({ db, interval: 100 });
    const published = db.query([ENGINE_STATS_FACT, $.name, $.value]).map((row) => row.name);
    expect(new Set(published)).toEqual(new Set(Object.keys(db.stats())));
    expect(stat("facts")).toBe(1);

    db.insert("todo", 2, "title", "b");
    expect(stat("facts")).toBe(1);
    vi.advanceTimersByTime(100);
    expect(stat("facts")).toBe(2 + published.length);

    stop();
    expect(db.query([ENGINE_STATS_FACT, $.name, $.value])).toEqual([]);
    db.insert("todo", 3, "title", "c");
    vi.advanceTimersByTime(200);
    expect(db.query([ENGINE_STATS_FACT, $.name, $.value])).toEqual([]);
  });

  it("never reports its facts as durable", () => {
    const durable: Fact[] = [];
    db.observe((type, _key, fact) => {
      if (type === "add") durable.push(fact);
    });
    const stop = publishStats({ db, interval: 100 });
    db.insert("todo", 1, "title", "a");
    vi.advanceTimersByTime(100);
    stop();
    expect(durable).toEqual([["todo", 1, "title", "a"]]);
  });
});
