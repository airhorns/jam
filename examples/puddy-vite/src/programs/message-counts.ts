// Message Counts — show message count as tooltip on session rows.
//
// Uses id-based addressing: session buttons have id="session-{sid}".

import { $, claim, whenever } from "@jam/core";

export const dispose = whenever(
  [["message", $.sid, $.msgId, $.sender, $.kind, $.content]],
  (messages) => {
    const counts = new Map<string, number>();
    for (const { sid } of messages) {
      counts.set(sid as string, (counts.get(sid as string) ?? 0) + 1);
    }
    for (const [sid, count] of counts) {
      claim(`session-${sid}`, "prop", "title", `${count} messages`);
    }
  },
);
