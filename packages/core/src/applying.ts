// Shared mute switch for stores that mirror external data into facts: while a
// store is writing facts it read from storage, every store's write side must
// ignore them or the same change would be written straight back out.

import { db } from "./db";
import { transaction } from "./reactive";

let depth = 0;

/** True while some store is applying external changes to the FactDB. */
export function isApplying(): boolean {
  return depth > 0;
}

/**
 * Run `fn` with all write sides muted. Listeners hear the changes made inside
 * before the mute lifts; effects run afterwards, unmuted.
 */
export function applyFacts<T>(fn: () => T): T {
  return transaction(() => {
    db.drain();
    depth++;
    try {
      return fn();
    } finally {
      db.drain();
      depth--;
    }
  });
}
