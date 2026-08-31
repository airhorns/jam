// Subscriptions — which slices of jam_facts are in memory. Project facts
// (global scope) always; issues and comments only for the project on screen.
// follow() swaps project shapes with overlap, so switching never empties the
// screen first.

import { $, type FactFilter, type SyncHandle } from "@jam/core";
import { projectScope } from "../projects";
import { parseRoute } from "./router";

export function filtersForRoute(url: string | undefined): FactFilter[] {
  const projectId = url === undefined ? undefined : parseRoute(url).projectId;
  return [{ scope: "" }, ...(projectId ? [{ scope: projectScope(projectId) }] : [])];
}

export function startSubscriptions(sync: SyncHandle): () => Promise<void> {
  return sync.follow([["route", "url", $.url]], ([route]) => filtersForRoute(route && String(route.url)));
}
