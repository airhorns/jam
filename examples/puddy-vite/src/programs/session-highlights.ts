// Session Highlights — visual status indicators on sidebar session rows.
//
// Uses id-based global addressing: session buttons have id="session-{sid}".
// Claims CSS classes: session-active, session-failed, session-ended.

import { program } from "@jam/core";

export const dispose = program("puddy-vite/session-highlights", ({ $, claim, whenever }) =>
  whenever(
    [["session", $.sid, "status", $.status]],
    (sessions) => {
      for (const { sid, status } of sessions) {
        const elId = `session-${sid}`;
        if (status === "active") {
          claim(elId, "class", "session-active");
        } else if (status === "failed") {
          claim(elId, "class", "session-failed");
        } else if (status === "ended") {
          claim(elId, "class", "session-ended");
        }
      }
    },
  ));
