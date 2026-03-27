// Error Tooltips — show failure details as tooltips on failed session rows.
//
// Knows: ["session", sid, "statusDetail", reason] and that session rows
// are keyed by sid. Claims a "title" prop on the session button element.

import { $, claim, whenever } from "@jam/core";

export const dispose = whenever(
  [["session", $.sid, "status", "failed"], ["session", $.sid, "statusDetail", $.reason]],
  (failed) => {
    for (const { sid, reason } of failed) {
      claim(`k:${sid}`, "prop", "title", `Error: ${reason}`);
    }
  },
);
