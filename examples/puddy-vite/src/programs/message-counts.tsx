// Message Counts — show message count badges on session rows.
//
// Uses id-based addressing and injectVdom to add a badge element
// as a child of each session button. Demonstrates external programs
// injecting new DOM nodes into component-rendered elements.

import { h } from "@jam/core/jsx";
import { program } from "@jam/core";
import { Text } from "@jam/ui";

export const dispose = program("puddy-vite/message-counts", ({ $, whenever, injectVdom }) =>
  whenever(
    [["message", $.sid, $.msgId, $.sender, $.kind, $.content]],
    (messages) => {
      const counts = new Map<string, number>();
      for (const { sid } of messages) {
        counts.set(sid as string, (counts.get(sid as string) ?? 0) + 1);
      }
      for (const [sid, count] of counts) {
        // Inject a badge element as a child of the session button (at high index)
        injectVdom(
          `session-${sid}`,
          1000,
          <Text class="msg-count-badge">{String(count)}</Text>,
        );
      }
    },
  ));
