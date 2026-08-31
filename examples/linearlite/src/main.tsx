import { h } from "@jam/core/jsx";
import { $, _, db, mount, persist } from "@jam/core";
import { createJamUI, defaultConfig } from "@jam/ui";
import { App } from "./components/App";
import { SYNC_URL, openLinearliteDatabase, seedCountFromLocation } from "./pglite";
import { startQueries } from "./programs/queries";
import { startRecent } from "./programs/recent";
import { startRouter } from "./programs/router";
import { startSubscriptions } from "./programs/subscriptions";
import { startUi } from "./programs/ui";
import { startSync } from "./sync";

createJamUI(defaultConfig);

async function start() {
  const pg = await openLinearliteDatabase({ seed: seedCountFromLocation(location) });
  const sync = await startSync(pg, SYNC_URL);
  const persistence = await persist({ pg, include: (fact) => fact[0] === "recent" });

  startRouter();
  startUi();
  startRecent();
  startQueries();
  startSubscriptions(sync);

  mount(<App />, document.getElementById("app")!);

  Object.assign(window as object, { __jam: { $, _ }, __db: db, __pg: pg, __sync: sync, __persist: persistence });
}

void start();
