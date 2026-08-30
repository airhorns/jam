import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, replace, type FactFilter, type FactSubscription, type SyncHandle } from "@jam/core";
import { projectScope } from "../projects";
import { startSubscriptions } from "../programs/subscriptions";

interface FakeSubscription extends FactSubscription {
  filter: FactFilter;
  disposed: boolean;
  resolve: () => void;
}

function fakeSync() {
  const subscriptions: FakeSubscription[] = [];
  const handle = {
    subscribe(filter: FactFilter = {}) {
      let resolve!: () => void;
      const ready = new Promise<void>((r) => (resolve = r));
      const subscription: FakeSubscription = {
        id: JSON.stringify(filter),
        filter,
        ready,
        disposed: false,
        resolve,
        dispose: async () => {
          subscription.disposed = true;
        },
      };
      subscriptions.push(subscription);
      return subscription;
    },
  } as unknown as SyncHandle;
  const active = () => subscriptions.filter((s) => !s.disposed).map((s) => s.filter.scope);
  return { handle, subscriptions, active };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

let stop: (() => Promise<void>) | undefined;

beforeEach(() => db.clear());
afterEach(async () => {
  await stop?.();
  stop = undefined;
  db.clear();
});

describe("startSubscriptions", () => {
  it("always holds the global scope and follows the route's project", async () => {
    const sync = fakeSync();
    replace("route", "url", "/web");
    stop = startSubscriptions(sync.handle);
    expect(sync.active()).toEqual(["", projectScope("web")]);

    replace("route", "url", "/web/board?status=todo");
    await tick();
    expect(sync.subscriptions).toHaveLength(2);
  });

  it("releases the previous project only after the next one is ready", async () => {
    const sync = fakeSync();
    replace("route", "url", "/web");
    stop = startSubscriptions(sync.handle);
    const [, web] = sync.subscriptions;
    web.resolve();
    await tick();

    replace("route", "url", "/mobile");
    const mobile = sync.subscriptions[2];
    expect(mobile.filter.scope).toBe(projectScope("mobile"));
    await tick();
    expect(web.disposed).toBe(false);

    mobile.resolve();
    await tick();
    expect(web.disposed).toBe(true);
    expect(sync.active()).toEqual(["", projectScope("mobile")]);
  });

  it("drops a superseded subscription that never became current", async () => {
    const sync = fakeSync();
    replace("route", "url", "/web");
    stop = startSubscriptions(sync.handle);
    const [, web] = sync.subscriptions;
    web.resolve();
    await tick();

    replace("route", "url", "/mobile");
    replace("route", "url", "/api");
    const [, , mobile, api] = sync.subscriptions;
    mobile.resolve();
    api.resolve();
    await tick();
    expect(mobile.disposed).toBe(true);
    expect(web.disposed).toBe(true);
    expect(sync.active()).toEqual(["", projectScope("api")]);
  });

  it("disposes everything on stop", async () => {
    const sync = fakeSync();
    replace("route", "url", "/web");
    const stopAll = startSubscriptions(sync.handle);
    sync.subscriptions[1].resolve();
    await tick();
    await stopAll();
    expect(sync.active()).toEqual([]);
  });
});
