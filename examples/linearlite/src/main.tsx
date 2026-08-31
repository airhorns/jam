import { h } from "@jam/core/jsx";
import { $, _, db, describeUI, drive, indexedDBStorage, mount, outlineUI, persist, press } from "@jam/core";
import { createJamUI, defaultConfig } from "@jam/ui";
import { App } from "./components/App";
import { seedCountFromLocation, syncUrlFromLocation } from "./config";
import { startQueries } from "./programs/queries";
import { startRecent } from "./programs/recent";
import { startRouter } from "./programs/router";
import { startSubscriptions } from "./programs/subscriptions";
import { startUi } from "./programs/ui";
import { seedLocal } from "./seed";
import { startSync } from "./sync";

createJamUI(defaultConfig);

async function start() {
  const url = syncUrlFromLocation(location);
  const storage = await indexedDBStorage(url ? "linearlite-synced" : "linearlite");
  const seed = seedCountFromLocation(location);
  if (seed) await seedLocal(storage, seed);
  const sync = await startSync(storage, url);
  const persistence = await persist({ name: "linearlite-local", include: (fact) => fact[0] === "recent" });

  startRouter();
  startUi();
  startRecent();
  startQueries();
  startSubscriptions(sync);

  mount(<App />, document.getElementById("app")!);

  Object.assign(window as object, { __jam: { $, _, describeUI, outlineUI, drive, press }, __db: db, __storage: storage, __sync: sync, __persist: persistence });
}

void start();
