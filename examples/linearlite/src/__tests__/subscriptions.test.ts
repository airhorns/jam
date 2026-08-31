import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, replace, type Bindings, type FactFilter, type Pattern, type SyncHandle } from "@jam/core";
import { projectScope } from "../projects";
import { filtersForRoute, startSubscriptions } from "../programs/subscriptions";

const scopes = (filters: FactFilter[]) => filters.map((f) => f.scope);

beforeEach(() => db.clear());
afterEach(() => db.clear());

describe("filtersForRoute", () => {
  it("always wants the global scope and adds the route's project", () => {
    expect(scopes(filtersForRoute(undefined))).toEqual([""]);
    expect(scopes(filtersForRoute("/"))).toEqual([""]);
    expect(scopes(filtersForRoute("/web"))).toEqual(["", projectScope("web")]);
    expect(scopes(filtersForRoute("/web/board?status=todo"))).toEqual(["", projectScope("web")]);
    expect(scopes(filtersForRoute("/mobile/issue/abc"))).toEqual(["", projectScope("mobile")]);
  });
});

describe("startSubscriptions", () => {
  it("follows the route url and hands back follow's stop", async () => {
    let followed: { patterns: Pattern[]; wanted: (matches: Bindings[]) => FactFilter[] } | undefined;
    let stopped = false;
    const handle = {
      follow(patterns: Pattern[], wanted: (matches: Bindings[]) => FactFilter[]) {
        followed = { patterns, wanted };
        return async () => {
          stopped = true;
        };
      },
    } as unknown as SyncHandle;

    const stop = startSubscriptions(handle);
    expect(followed!.patterns).toEqual([["route", "url", expect.anything()]]);
    expect(scopes(followed!.wanted([]))).toEqual([""]);
    expect(scopes(followed!.wanted([{ url: "/api" }]))).toEqual(["", projectScope("api")]);

    replace("route", "url", "/web");
    expect(scopes(followed!.wanted(db.query(...followed!.patterns)))).toEqual(["", projectScope("web")]);

    await stop();
    expect(stopped).toBe(true);
  });
});
