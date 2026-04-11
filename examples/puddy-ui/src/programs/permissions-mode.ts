// Permissions Mode Toggle — switch between Claude Code permission modes.
//
// Injects a toggle bar into the detail header showing three modes:
//   - Default: normal permissions (ask before risky actions)
//   - Plan: read-only planning mode
//   - YOLO: bypass all permission checks
//
// Sends "/permissions-mode <mode>" as a prompt to the backend when toggled.
// Tracks the current mode as a fact: ["permissions", sid, "mode", mode].

import { h } from "@jam/core/jsx";
import { $, when, whenever, assert, set, claim, injectVdom } from "@jam/core";
import { SessionManager } from "../networking/session-manager";

type PermMode = "default" | "plan" | "bypassPermissions";

const MODES: { id: PermMode; label: string; description: string }[] = [
  { id: "default", label: "Default", description: "Ask before risky actions" },
  { id: "plan", label: "Plan", description: "Read-only planning mode" },
  { id: "bypassPermissions", label: "YOLO", description: "Bypass all permissions" },
];

export function startPermissionsMode(sessionManager: SessionManager) {
  // Initialize default mode for new sessions
  const initDispose = whenever(
    [["session", $.sid, "status", $.status]],
    (sessions) => {
      for (const { sid } of sessions) {
        // Only set if not already set
        const existing = when(["permissions", sid, "mode", $.mode]);
        if (existing.length === 0) {
          assert("permissions", sid, "mode", "default");
        }
      }
    },
  );

  // Inject toggle bar into detail header when a session is selected
  const uiDispose = whenever(
    [["ui", "selectedSession", $.sid]],
    (selections) => {
      const sid = selections[0]?.sid as string;
      if (!sid) return;

      const currentMode = when(["permissions", sid, "mode", $.mode]);
      const mode = (currentMode[0]?.mode as PermMode) ?? "default";

      injectVdom("detail-header", 1000,
        h("div", { id: "permissions-toggle", class: "permissions-toggle hstack gap-4" },
          ...MODES.map(m =>
            h("button", {
              class: `perm-btn ${mode === m.id ? "perm-btn-active" : ""}`,
              onClick: () => {
                set("permissions", sid, "mode", m.id);
                // Send mode change to backend
                sessionManager.sendMessage(sid, `/permissions-mode ${m.id}`);
              },
            }, m.label),
          ),
        ),
      );
    },
  );

  return () => {
    initDispose();
    uiDispose();
  };
}
