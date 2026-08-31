// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { $, db, listPrograms, removeProgram, when } from "@jam/core";
import { createLocalStorageJamFileSystem, createMemoryJamFileSystem } from "../filesystem";

const KEY = "jam:meta-agent:test:files";
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;

describe("createLocalStorageJamFileSystem", () => {
  beforeEach(() => {
    for (const id of listPrograms()) removeProgram(id);
    db.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds initial files, normalising their paths, and mirrors every write to localStorage", () => {
    const fs = createLocalStorageJamFileSystem("test", { "programs/a.js": "claim('a', 'v', 1)" });
    expect(fs.readFile("/programs/a.js")?.content).toBe("claim('a', 'v', 1)");
    expect(stored()).toEqual({ "/programs/a.js": "claim('a', 'v', 1)" });

    const entry = fs.writeFile("programs/b.js" as `/${string}`, "claim('b', 'v', 2)");
    expect(entry.path).toBe("/programs/b.js");
    expect(fs.listFiles().map((file) => file.path)).toEqual(["/programs/a.js", "/programs/b.js"]);
    expect(stored()).toEqual({ "/programs/a.js": "claim('a', 'v', 1)", "/programs/b.js": "claim('b', 'v', 2)" });

    expect(fs.deleteFile("/programs/a.js")).toBe(true);
    expect(fs.deleteFile("/programs/a.js")).toBe(false);
    expect(stored()).toEqual({ "/programs/b.js": "claim('b', 'v', 2)" });
  });

  it("restores files saved earlier and lets them win over the initial files", () => {
    localStorage.setItem(KEY, JSON.stringify({ "programs/a.js": "saved", "/programs/c.js": "kept" }));
    const fs = createLocalStorageJamFileSystem("test", { "/programs/a.js": "initial", "/programs/d.js": "new" });
    expect(fs.readFile("/programs/a.js")?.content).toBe("saved");
    expect(fs.readFile("/programs/c.js")?.content).toBe("kept");
    expect(fs.readFile("/programs/d.js")?.content).toBe("new");
    expect(Object.keys(stored()).sort()).toEqual(["/programs/a.js", "/programs/c.js", "/programs/d.js"]);
  });

  it("loads programs through the same file system", () => {
    const fs = createLocalStorageJamFileSystem("test", { "/programs/hello.js": "claim('hello', 'status', 'loaded')" });
    const loaded = fs.loadProgramFile("programs/hello.js" as `/${string}`, "hello");
    expect(loaded?.id).toBe("hello");
    expect(when(["hello", "status", $.status])).toEqual([{ status: "loaded" }]);
    expect(fs.loadProgramFile("/programs/missing.js")).toBeUndefined();
  });

  it("works as an in-memory file system when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    const fs = createLocalStorageJamFileSystem("test", { "/programs/a.js": "one" });
    fs.writeFile("/programs/b.js", "two");
    expect(fs.listFiles().map((file) => file.path)).toEqual(["/programs/a.js", "/programs/b.js"]);
    expect(fs.deleteFile("/programs/a.js")).toBe(true);
  });
});

describe("createMemoryJamFileSystem", () => {
  it("publishes its files as facts", () => {
    db.clear();
    const fs = createMemoryJamFileSystem({ "/programs/x.js": "1234" });
    expect(when(["jamProgramFile", "/programs/x.js", "size", $.size])).toEqual([{ size: 4 }]);
    expect(fs.readFile("/programs/x.js")?.content).toBe("1234");
  });
});
