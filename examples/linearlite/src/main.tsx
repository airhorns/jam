import { h } from "@jam/core/jsx";
import { db, mount, persist } from "@jam/core";
import { App } from "./components/App";
import { ELECTRIC_URL, WRITE_SERVER_URL, openLinearliteDatabase, seedCountFromLocation } from "./pglite";
import { startQueries } from "./programs/queries";
import { startRecent } from "./programs/recent";
import { startRouter } from "./programs/router";
import { startUi } from "./programs/ui";
import { startSync } from "./sync";
import "./styles.css";

async function start() {
  const pg = await openLinearliteDatabase({ seed: seedCountFromLocation(location) });

  startRouter();
  startUi();
  startRecent();
  startQueries(pg);
  const persistence = await persist({ pg, include: (fact) => fact[0] === "recent" });

  mount(<App pg={pg} />, document.getElementById("app")!);

  void startSync(pg, { electricUrl: ELECTRIC_URL, writeServerUrl: WRITE_SERVER_URL }).catch((error) => {
    console.error("[linearlite] sync failed to start", error);
  });

  Object.assign(window as object, { __pg: pg, __db: db, __persist: persistence });
}

void start();
