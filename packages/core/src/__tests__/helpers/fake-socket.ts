// In-process WebSocket stand-ins: a browser-style client end wired to a
// `ws`-style server end, delivering messages asynchronously in order.

import type { SyncWebSocket } from "../../sync";
import type { SyncSocket } from "../../server";

type Listener = (...args: unknown[]) => void;

export interface FakeServerSocket extends SyncSocket {
  emit(event: "message" | "close" | "error", ...args: unknown[]): void;
}

export interface FakeClientSocket extends SyncWebSocket {
  /** Simulate the transport dropping. */
  drop(): void;
}

export interface FakeNetwork {
  /** Connect a new client end to `accept` (normally `server.handle`). */
  connect: (url: string) => FakeClientSocket;
  /** Sockets opened so far, oldest first. */
  sockets: FakeClientSocket[];
  /** Resolve once every queued message has been delivered. */
  idle(): Promise<void>;
}

export function fakeNetwork(accept: (socket: SyncSocket) => void): FakeNetwork {
  let queue: Promise<void> = Promise.resolve();
  const later = (fn: () => void) => {
    queue = queue.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0))).then(fn);
  };
  const sockets: FakeClientSocket[] = [];
  return {
    sockets,
    idle: async () => {
      let tail: Promise<void>;
      do {
        tail = queue;
        await tail;
      } while (tail !== queue);
    },
    connect(_url: string) {
      const listeners = new Map<string, Listener[]>();
      let open = false;
      const serverEnd: FakeServerSocket = {
        send: (data) => later(() => open && client.onmessage?.({ data })),
        on: (event, listener) => {
          const list = listeners.get(event) ?? [];
          list.push(listener as Listener);
          listeners.set(event, list);
          return serverEnd;
        },
        emit: (event, ...args) => {
          for (const listener of listeners.get(event) ?? []) listener(...args);
        },
      };
      const close = () => {
        if (!open) return;
        open = false;
        serverEnd.emit("close");
        client.onclose?.({});
      };
      const client: FakeClientSocket = {
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send: (data) => {
          if (!open) throw new Error("socket is not open");
          later(() => open && serverEnd.emit("message", data));
        },
        close: () => later(close),
        drop: close,
      };
      sockets.push(client);
      later(() => {
        open = true;
        accept(serverEnd);
        client.onopen?.({});
      });
      return client;
    },
  };
}
