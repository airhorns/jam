import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, $ } from "../db";
import { remember, replace, when } from "../primitives";
import { Effect, autorun, flush, reaction } from "../reactive";

beforeEach(() => {
  db.clear();
});

describe("Effect", () => {
  it("does nothing once disposed, and disposing again is harmless", () => {
    let runs = 0;
    const effect = new Effect(() => runs++);
    effect.run();
    effect.dispose();
    effect.dispose();
    effect.run();
    expect(runs).toBe(1);
  });

  it("reports a failing effect and keeps the others running", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: number[] = [];
    const stopBroken = autorun(() => {
      if (when(["n", $.v]).length > 0) throw new Error("boom");
    });
    const stopFine = autorun(() => seen.push(when(["n", $.v]).length));
    remember("n", 1);
    expect(errors).toHaveBeenCalledWith("[jam] effect failed", expect.any(Error));
    expect(seen).toEqual([0, 1]);
    stopBroken();
    stopFine();
    errors.mockRestore();
  });

  it("gives up on effects that never settle instead of looping forever", () => {
    const effect = new Effect(() => {
      const n = (when(["counter", $.n])[0]?.n as number | undefined) ?? 0;
      replace("counter", n + 1);
    });
    expect(() => effect.run()).toThrow("effects did not settle after 1000 rounds");
    effect.dispose();
    remember("counter", "reset");
    expect(when(["counter", $.n]).length).toBeGreaterThan(0);
  });
});

describe("flush", () => {
  it("is a no-op while a flush is already running", () => {
    const seen: number[] = [];
    const stop = autorun(() => {
      seen.push(when(["n", $.v]).length);
      flush();
    });
    remember("n", 1);
    expect(seen).toEqual([0, 1]);
    stop();
  });
});

describe("reaction", () => {
  it("compares with the given equality and only fires on change", () => {
    const seen: string[][] = [];
    const stop = reaction(
      () => when(["tag", $.t]).map((b) => String(b.t)).sort(),
      (tags) => seen.push(tags),
      { equals: (a, b) => a.join() === b.join() },
    );
    expect(seen).toEqual([]);
    remember("tag", "a");
    remember("other", 1);
    remember("tag", "a");
    expect(seen).toEqual([["a"]]);
    stop();
  });

  it("uses strict equality by default", () => {
    const seen: number[] = [];
    const stop = reaction(
      () => when(["n", $.v]).length,
      (count) => seen.push(count),
      { fireImmediately: true },
    );
    remember("n", 1);
    remember("m", 1);
    expect(seen).toEqual([0, 1]);
    stop();
  });
});
