// Sync — core's sync() does all the work: every durable fact is kept in the
// local mirror and, when a server is configured, streamed from and pushed to
// it. Only VDOM and the app's ephemeral facts stay out of it.

import { defaultExclude, sync, type Fact, type FactStorage, type SyncHandle } from "@jam/core";
import { isEphemeral } from "./types";

const localOnly = (fact: Fact): boolean => defaultExclude(fact) || isEphemeral(fact);

export function startSync(storage: FactStorage, url: string | undefined): Promise<SyncHandle> {
  return sync({ url, storage, exclude: localOnly });
}
