// navigator.locks for Node: shared/exclusive modes, ifAvailable, abortable
// waits and FIFO grants, so tests can run several sync() handles as if they
// were tabs.

interface Waiter {
  mode: LockMode;
  resolve: () => void;
}

interface Options {
  mode?: LockMode;
  ifAvailable?: boolean;
  signal?: AbortSignal;
}

type Callback<T> = (lock: Lock | null) => T | Promise<T>;

export class FakeLockManager {
  private held = new Map<string, { mode: LockMode; count: number }>();
  private queues = new Map<string, Waiter[]>();

  async request<T>(name: string, optionsOrCallback: Options | Callback<T>, maybeCallback?: Callback<T>): Promise<T> {
    const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
    const callback = (typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback)!;
    const mode = options.mode ?? "exclusive";
    if (options.ifAvailable) {
      if (!this.available(name, mode)) return callback(null);
      this.acquire(name, mode);
    } else if (this.available(name, mode)) {
      this.acquire(name, mode);
    } else {
      await this.wait(name, mode, options.signal);
    }
    try {
      return await callback({ name, mode });
    } finally {
      this.release(name);
    }
  }

  async query(): Promise<LockManagerSnapshot> {
    const held = Array.from(this.held, ([name, { mode }]) => ({ name, mode, clientId: "test" }));
    return { held, pending: [] };
  }

  private available(name: string, mode: LockMode) {
    return !this.queues.get(name)?.length && this.grantable(name, mode);
  }

  private grantable(name: string, mode: LockMode) {
    const current = this.held.get(name);
    return !current || (mode === "shared" && current.mode === "shared");
  }

  private acquire(name: string, mode: LockMode) {
    const current = this.held.get(name);
    if (current) current.count++;
    else this.held.set(name, { mode, count: 1 });
  }

  private release(name: string) {
    const current = this.held.get(name)!;
    if (--current.count === 0) this.held.delete(name);
    const queue = this.queues.get(name) ?? [];
    while (queue.length && this.grantable(name, queue[0].mode)) {
      const waiter = queue.shift()!;
      this.acquire(name, waiter.mode);
      waiter.resolve();
    }
    if (!queue.length) this.queues.delete(name);
  }

  private wait(name: string, mode: LockMode, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { mode, resolve };
      const queue = this.queues.get(name) ?? [];
      queue.push(waiter);
      this.queues.set(name, queue);
      signal?.addEventListener("abort", () => {
        const index = queue.indexOf(waiter);
        if (index === -1) return;
        queue.splice(index, 1);
        reject(new DOMException("lock request aborted", "AbortError"));
      });
    });
  }
}

/** Install a fresh lock manager as `navigator.locks`; returns a function restoring the previous `navigator`. */
export function installFakeLocks(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { locks: new FakeLockManager() }, configurable: true, writable: true });
  return () => {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete (globalThis as { navigator?: unknown }).navigator;
  };
}
