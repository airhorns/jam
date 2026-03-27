// Session Highlights — visual status indicators on sidebar session rows.
//
// Knows: ["session", sid, "status", status] facts, and that session rows
// are keyed by sid (addressable as "k:{sid}").
// Adds CSS classes: session-active, session-failed, session-ended.

import { $, claim, whenever } from "@jam/core";

export const dispose = whenever(
  [["session", $.sid, "status", $.status]],
  (sessions) => {
    for (const { sid, status } of sessions) {
      if (status === "active") {
        claim(`k:${sid}`, "class", "session-active");
      } else if (status === "failed") {
        claim(`k:${sid}`, "class", "session-failed");
      } else if (status === "ended") {
        claim(`k:${sid}`, "class", "session-ended");
      }
    }
  },
);
