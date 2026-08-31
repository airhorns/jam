import { describe, it, expect, afterEach } from "vitest";
import { requestSyncToDisk, serveSyncToDisk } from "../pglite-durability";

class ErrnoError {
  name = "ErrnoError";
  constructor(public errno: number) {}
}

function fakePg(outcomes: Array<"ok" | "enoent">) {
  const calls: number[] = [];
  return {
    calls,
    fs: {
      async syncToFs() {
        const outcome = outcomes[Math.min(calls.length, outcomes.length - 1)];
        calls.push(calls.length);
        if (outcome === "enoent") throw new ErrnoError(44);
      },
    },
  };
}

const disposers: Array<() => void> = [];
let n = 0;
const nextDb = () => `test-db-${process.pid}-${n++}`;

afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

describe("serveSyncToDisk", () => {
  it("resolves the request once the filesystem sync succeeds", async () => {
    const pg = fakePg(["ok"]);
    const dbId = nextDb();
    disposers.push(serveSyncToDisk(pg, dbId));
    await expect(requestSyncToDisk(dbId, 1000)).resolves.toBeUndefined();
    expect(pg.calls).toHaveLength(1);
  });

  it("retries an IDBFS sync that lost a file to Postgres mid-sync", async () => {
    const pg = fakePg(["enoent", "enoent", "ok"]);
    const dbId = nextDb();
    disposers.push(serveSyncToDisk(pg, dbId));
    await expect(requestSyncToDisk(dbId, 1000)).resolves.toBeUndefined();
    expect(pg.calls).toHaveLength(3);
  });

  it("reports an errno rather than [object Object] when every attempt fails", async () => {
    const pg = fakePg(["enoent"]);
    const dbId = nextDb();
    disposers.push(serveSyncToDisk(pg, dbId, { attempts: 2 }));
    await expect(requestSyncToDisk(dbId, 1000)).rejects.toThrow("ErrnoError errno 44");
    expect(pg.calls).toHaveLength(2);
  });

  it("times out when nothing is serving the database", async () => {
    await expect(requestSyncToDisk(nextDb(), 20)).rejects.toThrow("Timed out");
  });
});
