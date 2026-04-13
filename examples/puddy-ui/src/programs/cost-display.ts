// Cost Display — show session cost as a tooltip on the connection bar.
//
// Uses select() to find the connection-bar element by CSS class,
// since it doesn't have an explicit id. Demonstrates querying VDOM
// facts with CSS selectors from an external program.

import { program } from "@jam/core";

export const dispose = program("puddy-ui/cost-display", ({ $, claim, whenever, select }) =>
  whenever(
    [["session", $.sid, "costAmount", $.amount], ["session", $.sid, "costCurrency", $.currency]],
    (sessions) => {
      let totalCost = 0;
      let currency = "USD";
      for (const { amount, currency: cur } of sessions) {
        totalCost += amount as number;
        currency = cur as string;
      }

      const label = `Total cost: ${currency} ${totalCost.toFixed(4)}`;
      for (const el of select(".connection-bar")) {
        claim(el.id, "prop", "title", label);
      }
    },
  ));
