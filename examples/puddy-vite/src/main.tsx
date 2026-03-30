import { h } from "@jam/core/jsx";
import { mount, db } from "@jam/core";
import { App, sessionManager } from "./app";

// Independent programs — each reacts to the shared fact database.
import "./programs/session-highlights";
import "./programs/error-tooltips";
import "./programs/cost-display";
import "./programs/message-counts";
import { startPermissionsMode } from "./programs/permissions-mode";

mount(<App />, document.getElementById("app")!);

// Start programs that need runtime references
startPermissionsMode(sessionManager);

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
