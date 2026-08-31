// Sync — core's sync() does all the work: every durable fact is stored in the
// local jam_facts mirror and, when a sync server is configured, streamed from
// and pushed to it (server.ts fronts Electric and the write path). Only VDOM
// and the app's ephemeral facts stay out of it.

import { defaultExclude, sync, type Fact, type SyncHandle } from "@jam/core";
import type { LinearlitePG } from "./pglite";
import { isEphemeral } from "./types";

const localOnly = (fact: Fact): boolean => defaultExclude(fact) || isEphemeral(fact);

export function startSync(pg: LinearlitePG, syncUrl?: string): Promise<SyncHandle> {
  if (!syncUrl) return sync({ pg, exclude: localOnly });
  return sync({
    pg,
    shapeUrl: new URL("/jam/shape", syncUrl).toString(),
    writeUrl: new URL("/jam/changes", syncUrl).toString(),
    exclude: localOnly,
  });
}
