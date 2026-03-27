// Cost Display — show session cost as a tooltip on the connection bar.
//
// This program demonstrates querying VDOM facts to find non-keyed elements.
// It finds the connection-bar element by querying for [$.el, "class", "connection-bar"],
// then claims a "title" prop on it showing the cost.
//
// NOTE: This is fragile because the connection-bar gets a new auto-generated
// entity ID on every component re-render. The whenever fires each time.

import { $, claim, whenever } from "@jam/core";

export const dispose = whenever(
  [
    ["session", $.sid, "costAmount", $.amount],
    ["session", $.sid, "costCurrency", $.currency],
    [$.el, "class", "connection-bar"],
  ],
  (matches) => {
    // Sum costs across sessions, then claim tooltip on the connection bar
    const costBySid = new Map<string, { amount: number; currency: string }>();
    const elements = new Set<string>();
    for (const { sid, amount, currency, el } of matches) {
      costBySid.set(sid as string, { amount: amount as number, currency: currency as string });
      elements.add(el as string);
    }

    let totalCost = 0;
    let cur = "USD";
    for (const { amount, currency } of costBySid.values()) {
      totalCost += amount;
      cur = currency;
    }

    const label = `Total cost: ${cur} ${totalCost.toFixed(4)}`;
    for (const el of elements) {
      claim(el, "prop", "title", label);
    }
  },
);
