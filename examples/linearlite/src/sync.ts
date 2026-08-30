// Sync — core's sync() does all the work: every durable fact is stored in the
// local jam_facts mirror and, when Electric is configured, streamed from and
// pushed to the server. Only VDOM and the app's ephemeral facts stay out of it.

import { defaultExclude, sync, type Fact, type SyncHandle } from "@jam/core";
import type { LinearlitePG } from "./pglite";
import { isEphemeral } from "./types";

export interface SyncConfig {
  electricUrl?: string;
  writeServerUrl: string;
  sourceId?: string;
  sourceSecret?: string;
}

const localOnly = (fact: Fact): boolean => defaultExclude(fact) || isEphemeral(fact);

export function startSync(pg: LinearlitePG, config: SyncConfig): Promise<SyncHandle> {
  if (!config.electricUrl) return sync({ pg, exclude: localOnly });
  const shapeParams: Record<string, string> = {};
  if (config.sourceId) shapeParams.source_id = config.sourceId;
  if (config.sourceSecret) shapeParams.secret = config.sourceSecret;
  return sync({
    pg,
    shapeUrl: new URL("/v1/shape", config.electricUrl).toString(),
    writeUrl: new URL("/jam/changes", config.writeServerUrl).toString(),
    shapeParams,
    exclude: localOnly,
  });
}
