// Polyfills for JavaScriptCore — JSC doesn't provide browser/Node globals.
// These must be loaded before any other code (MobX needs setTimeout, etc.)

// Console — will be overridden by Swift's bridge, but provide a no-op default
if (typeof console === "undefined") {
  (globalThis as any).console = {
    log: (..._args: any[]) => {},
    warn: (..._args: any[]) => {},
    error: (..._args: any[]) => {},
    info: (..._args: any[]) => {},
    debug: (..._args: any[]) => {},
  };
}

// setTimeout/clearTimeout — needed by MobX's reaction scheduler.
// If Swift has registered __scheduleTimeout, use it for real async timing.
// Otherwise fall back to synchronous execution (works for MobX's microtask flushing).
if (typeof setTimeout === "undefined") {
  let nextTimerId = 1;

  (globalThis as any).setTimeout = (fn: Function, _ms?: number) => {
    const id = nextTimerId++;
    if ((globalThis as any).__scheduleTimeout) {
      (globalThis as any).__scheduleTimeout(id, _ms ?? 0, fn);
    } else {
      // Synchronous fallback
      try { fn(); } catch (_e) {}
    }
    return id;
  };

  (globalThis as any).clearTimeout = (id: number) => {
    if ((globalThis as any).__clearTimeout) {
      (globalThis as any).__clearTimeout(id);
    }
  };
}

// setInterval/clearInterval — not typically needed by MobX but some code may use it
if (typeof setInterval === "undefined") {
  (globalThis as any).setInterval = (_fn: Function, _ms?: number) => 0;
  (globalThis as any).clearInterval = (_id: number) => {};
}

// queueMicrotask — MobX uses this for reaction scheduling
if (typeof queueMicrotask === "undefined") {
  (globalThis as any).queueMicrotask = (fn: Function) => {
    Promise.resolve().then(() => fn());
  };
}

// Performance.now — some libraries use this for timing
if (typeof performance === "undefined") {
  const start = Date.now();
  (globalThis as any).performance = {
    now: () => Date.now() - start,
  };
}
