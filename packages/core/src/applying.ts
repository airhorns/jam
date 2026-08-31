// Shared mute switch for stores that mirror external data into facts: while a
// store is writing facts it read from storage, every store's write side must
// ignore them or the same change would be written straight back out.

import { db as defaultDb, type FactDB } from "./db";
import { transaction } from "./reactive";

let depth = 0;

/** True while some store is applying external changes to a FactDB. */
export function isApplying(): boolean {
  return depth > 0;
}

/**
 * Run `fn` with all write sides muted. Listeners of `target` hear the changes
 * made inside before the mute lifts; effects run afterwards, unmuted.
 */
export function applyFacts<T>(fn: () => T, target: FactDB = defaultDb): T {
  return transaction(() => {
    target.drain();
    depth++;
    try {
      return fn();
    } finally {
      target.drain();
      depth--;
    }
  });
}
