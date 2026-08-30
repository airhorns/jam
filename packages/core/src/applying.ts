// Shared mute switch for stores that mirror external data into facts: while a
// store is writing facts it read from storage, every store's write side must
// ignore them or the same change would be written straight back out.

import { runInAction } from "mobx";

let depth = 0;

/** True while some store is applying external changes to the FactDB. */
export function isApplying(): boolean {
  return depth > 0;
}

/** Run `fn` in one MobX action with all write sides muted. Reactions fire after the action, unmuted. */
export function applyFacts(fn: () => void): void {
  runInAction(() => {
    depth++;
    try {
      fn();
    } finally {
      depth--;
    }
  });
}
