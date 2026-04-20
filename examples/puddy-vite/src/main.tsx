import { h } from "@jam/core/jsx";
import { mount, db, persist } from "@jam/core";
import { App, sessionManager } from "./app";

// Independent programs — each reacts to the shared fact database.
import "./programs/session-highlights";
import "./programs/error-tooltips";
import "./programs/cost-display";
import "./programs/message-counts";
import { startPermissionsMode } from "./programs/permissions-mode";
import { startTerminalEmulator } from "./programs/terminal-emulator";

async function start() {
  // Restore persisted facts (sessions, UI state, permissions, etc.)
  await persist({ name: "puddy" });

  mount(<App />, document.getElementById("app")!);
  startPermissionsMode(sessionManager);
  startTerminalEmulator(sessionManager);
}

start();

if (typeof window !== "undefined") {
  (window as any).__db = db;
}
