// Message Counts — show message count as tooltip on session rows.
//
// Knows: ["message", sid, msgId, sender, kind, content] and session rows
// are keyed by sid.
//
// LIMITATION: We can only claim props/classes on existing elements.
// To actually render a badge *inside* the session row, we'd need a way
// to claim new child elements — which the current system doesn't support
// cleanly (child index conflicts with component-emitted children).
// As a workaround, we set the "title" attribute to show the count on hover.

import { $, claim, whenever } from "@jam/core";

export const dispose = whenever(
  [["message", $.sid, $.msgId, $.sender, $.kind, $.content]],
  (messages) => {
    // Count messages per session
    const counts = new Map<string, number>();
    for (const { sid } of messages) {
      counts.set(sid as string, (counts.get(sid as string) ?? 0) + 1);
    }
    for (const [sid, count] of counts) {
      claim(`k:${sid}`, "prop", "title", `${count} messages`);
    }
  },
);
