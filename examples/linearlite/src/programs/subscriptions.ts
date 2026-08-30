// Subscriptions — which slices of jam_facts are in memory. Project facts
// (global scope) always; issues and comments only for the project on screen.
// The next project's subscription becomes ready before the previous one is
// released, so switching never empties the screen first.

import { $, whenever, type FactSubscription, type SyncHandle } from "@jam/core";
import { projectScope } from "../projects";
import { parseRoute } from "./router";

export function startSubscriptions(sync: SyncHandle): () => Promise<void> {
  const global = sync.subscribe({ scope: "" });
  let target: string | undefined;
  let current: FactSubscription | undefined;
  let generation = 0;

  async function switchTo(projectId: string | undefined) {
    if (target === projectId) return;
    target = projectId;
    const gen = ++generation;
    const next = projectId ? sync.subscribe({ scope: projectScope(projectId) }) : undefined;
    if (next) await next.ready;
    if (gen !== generation) {
      await next?.dispose();
      return;
    }
    const previous = current;
    current = next;
    await previous?.dispose();
  }

  const stopRoute = whenever([["route", "url", $.url]], ([match]) => {
    if (match) void switchTo(parseRoute(String(match.url)).projectId);
  });

  return async () => {
    stopRoute();
    generation++;
    await Promise.all([global.dispose(), current?.dispose()]);
  };
}
