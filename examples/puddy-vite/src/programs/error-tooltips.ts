// Error Tooltips — show failure details as tooltips on failed session rows.
//
// Uses id-based addressing: session buttons have id="session-{sid}".

import { program } from "@jam/core";

export const dispose = program("puddy-vite/error-tooltips", ({ $, claim, whenever }) =>
  whenever(
    [["session", $.sid, "status", "failed"], ["session", $.sid, "statusDetail", $.reason]],
    (failed) => {
      for (const { sid, reason } of failed) {
        claim(`session-${sid}`, "prop", "title", `Error: ${reason}`);
      }
    },
  ));
