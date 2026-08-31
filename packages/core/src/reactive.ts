// The scheduler: effects subscribe to dependencies (query indexes, the VDOM
// index) and re-run when the engine reports those changed. Writes are queued in
// the engine and drained at the end of the outermost transaction, then the
// affected effects run, and the cycle repeats until nothing is dirty.

const MAX_ROUNDS = 1000;

export interface Dependency {
  readonly subscribers: Set<Effect>;
  /** Called at the end of a flush once the last subscriber has gone. */
  onIdle?(): void;
}

let activeTracker: Effect | null = null;
let batchDepth = 0;
let flushing = false;
const dirty = new Set<Effect>();
const drainers = new Set<() => void>();
const idle = new Set<Dependency>();

export class Effect {
  private deps = new Set<Dependency>();
  disposed = false;

  constructor(private readonly fn: () => void) {}

  run(): void {
    if (this.disposed) return;
    transaction(() => {
      const previous = this.deps;
      this.deps = new Set();
      const outer = activeTracker;
      activeTracker = this;
      try {
        this.fn();
      } catch (e) {
        console.error("[jam] effect failed", e);
      } finally {
        activeTracker = outer;
      }
      for (const dep of previous) if (!this.deps.has(dep)) unsubscribe(dep, this);
    });
  }

  /** @internal */
  track(dep: Dependency): void {
    if (this.deps.has(dep)) return;
    this.deps.add(dep);
    dep.subscribers.add(this);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    dirty.delete(this);
    for (const dep of this.deps) unsubscribe(dep, this);
    this.deps.clear();
    settle();
  }
}

function unsubscribe(dep: Dependency, effect: Effect): void {
  dep.subscribers.delete(effect);
  if (dep.subscribers.size === 0 && dep.onIdle) idle.add(dep);
}

/** Record that the running effect read `dep`. */
export function recordRead(dep: Dependency): void {
  activeTracker?.track(dep);
}

export function isTracking(): boolean {
  return activeTracker !== null;
}

export function untracked<T>(fn: () => T): T {
  const outer = activeTracker;
  activeTracker = null;
  try {
    return fn();
  } finally {
    activeTracker = outer;
  }
}

/** Schedule every effect subscribed to `dep`. */
export function markDirty(dep: Dependency): void {
  for (const effect of dep.subscribers) dirty.add(effect);
}

/** Register a function that folds engine events into dependencies; it runs at every flush round. */
export function registerDrainer(drain: () => void): () => void {
  drainers.add(drain);
  return () => drainers.delete(drain);
}

/** Defer effects until `fn` returns; reads inside still see earlier writes. */
export function transaction<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

/** A write happened; outside any transaction that means running effects now. */
export function onWrite(): void {
  if (batchDepth === 0) flush();
}

/** Run effects marked dirty outside a transaction (e.g. by a read that drained events). */
export function settle(): void {
  if (batchDepth === 0 && (dirty.size > 0 || idle.size > 0)) flush();
}

export function flush(): void {
  if (flushing) return;
  flushing = true;
  batchDepth++;
  try {
    for (let round = 0; ; round++) {
      for (const drain of drainers) drain();
      if (dirty.size === 0) break;
      if (round >= MAX_ROUNDS) {
        dirty.clear();
        throw new Error(`[jam] effects did not settle after ${MAX_ROUNDS} rounds`);
      }
      const batch = Array.from(dirty);
      dirty.clear();
      for (const effect of batch) effect.run();
    }
    for (const dep of idle) if (dep.subscribers.size === 0) dep.onIdle?.();
    idle.clear();
  } finally {
    batchDepth--;
    flushing = false;
  }
}

/** Run `fn` now and again whenever something it read changes. */
export function autorun(fn: () => void): () => void {
  const effect = new Effect(fn);
  effect.run();
  return () => effect.dispose();
}

export interface ReactionOptions<T> {
  fireImmediately?: boolean;
  equals?: (a: T, b: T) => boolean;
}

/** Track `data`; run `effect` with its value when it changes (untracked). */
export function reaction<T>(data: () => T, effect: (value: T) => void, options: ReactionOptions<T> = {}): () => void {
  const equals = options.equals ?? ((a, b) => a === b);
  let first = true;
  let previous: T;
  const run = new Effect(() => {
    const value = data();
    const changed = first ? options.fireImmediately === true : !equals(previous, value);
    first = false;
    previous = value;
    if (changed) untracked(() => effect(value));
  });
  run.run();
  return () => run.dispose();
}
