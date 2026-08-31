import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { $, remember, when } from "../primitives";
import { listPrograms, removeProgram } from "../programs";
import {
  JAM_PROGRAM_FILE_FACT,
  createJamProgramFileSystem,
  deleteJamProgramFile,
  listJamProgramFiles,
  loadJamProgramFile,
  normalizeJamProgramPath,
  programIdFromPath,
  readJamProgramFile,
  writeJamProgramFile,
  type JamProgramPath,
} from "../program-files";

beforeEach(() => {
  for (const id of listPrograms()) removeProgram(id);
  db.clear();
});

describe("program file paths", () => {
  it("normalizes paths to start with a slash", () => {
    expect(normalizeJamProgramPath("programs/a.js")).toBe("/programs/a.js");
    expect(normalizeJamProgramPath("/programs/a.js")).toBe("/programs/a.js");
  });

  it("derives a program id from a path, keeping word characters, slashes and dashes", () => {
    expect(programIdFromPath("/programs/my app.v2.js")).toBe("programs/my-app-v2-js");
    expect(programIdFromPath("/a-b_c/d")).toBe("a-b_c/d");
  });
});

describe("program files as facts", () => {
  it("writes, reads back and lists files in path order", () => {
    const written = writeJamProgramFile("/b.js", "b");
    writeJamProgramFile("a.js" as JamProgramPath, "aa");
    expect(written).toMatchObject({ path: "/b.js", content: "b" });
    expect(typeof written.updatedAt).toBe("number");
    expect(when([JAM_PROGRAM_FILE_FACT, "/b.js", "size", $.size])).toEqual([{ size: 1 }]);

    expect(readJamProgramFile("b.js" as JamProgramPath)).toEqual(written);
    expect(readJamProgramFile("/missing.js")).toBeUndefined();
    expect(listJamProgramFiles().map((f) => [f.path, f.content])).toEqual([
      ["/a.js", "aa"],
      ["/b.js", "b"],
    ]);
  });

  it("overwrites a file in place, replacing every fact about it", () => {
    writeJamProgramFile("/a.js", "one");
    writeJamProgramFile("/a.js", "three");
    expect(readJamProgramFile("/a.js")?.content).toBe("three");
    expect(when([JAM_PROGRAM_FILE_FACT, "/a.js", "content", $.c])).toHaveLength(1);
    expect(when([JAM_PROGRAM_FILE_FACT, "/a.js", "size", $.s])).toEqual([{ s: 5 }]);
  });

  it("reports a missing or malformed updatedAt as 0 and skips entries that are not files", () => {
    remember(JAM_PROGRAM_FILE_FACT, "/no-time.js", "content", "x");
    remember(JAM_PROGRAM_FILE_FACT, "/bad-time.js", "content", "y");
    remember(JAM_PROGRAM_FILE_FACT, "/bad-time.js", "updatedAt", "yesterday");
    remember(JAM_PROGRAM_FILE_FACT, 42, "content", "not a path");
    remember(JAM_PROGRAM_FILE_FACT, 42, "updatedAt", 1);
    remember(JAM_PROGRAM_FILE_FACT, "/binary.js", "content", 7);
    remember(JAM_PROGRAM_FILE_FACT, "/binary.js", "updatedAt", 1);

    expect(readJamProgramFile("/no-time.js")).toEqual({ path: "/no-time.js", content: "x", updatedAt: 0 });
    expect(readJamProgramFile("/binary.js")).toBeUndefined();
    expect(listJamProgramFiles()).toEqual([{ path: "/bad-time.js", content: "y", updatedAt: 0 }]);
  });

  it("deletes a file and says whether it existed", () => {
    writeJamProgramFile("/a.js", "a");
    expect(deleteJamProgramFile("a.js" as JamProgramPath)).toBe(true);
    expect(readJamProgramFile("/a.js")).toBeUndefined();
    expect(when([JAM_PROGRAM_FILE_FACT, "/a.js", $.k, $.v])).toEqual([]);
    expect(deleteJamProgramFile("/a.js")).toBe(false);
  });
});

describe("loading program files", () => {
  it("runs a file as a program named after its path and records the load", () => {
    writeJamProgramFile("/programs/hello world.js", `claim("greeting", "text", "hi");`);
    const loaded = loadJamProgramFile("/programs/hello world.js");
    expect(loaded?.id).toBe("programs/hello-world-js");
    expect(loaded?.entry.content).toBe(`claim("greeting", "text", "hi");`);
    expect(listPrograms()).toContain("programs/hello-world-js");
    expect(when(["greeting", "text", $.t])).toEqual([{ t: "hi" }]);
    expect(when([JAM_PROGRAM_FILE_FACT, "/programs/hello world.js", "programId", $.id])).toEqual([{ id: "programs/hello-world-js" }]);
    expect(when([JAM_PROGRAM_FILE_FACT, "/programs/hello world.js", "loadedAt", $.at])).toHaveLength(1);
  });

  it("returns undefined for a file that does not exist", () => {
    expect(loadJamProgramFile("/nope.js")).toBeUndefined();
    expect(listPrograms()).toEqual([]);
  });
});

describe("createJamProgramFileSystem", () => {
  it("seeds files that are not yet present and leaves existing ones alone", () => {
    writeJamProgramFile("/keep.js", "original");
    const fs = createJamProgramFileSystem({ "keep.js": "seeded", "/new.js": "fresh" });
    expect(fs.readFile("/keep.js")?.content).toBe("original");
    expect(fs.readFile("new.js" as JamProgramPath)?.content).toBe("fresh");
    expect(fs.listFiles().map((f) => f.path)).toEqual(["/keep.js", "/new.js"]);
  });

  it("normalizes paths on every operation", () => {
    const fs = createJamProgramFileSystem();
    const bare = "p.js" as JamProgramPath;
    fs.writeFile(bare, `claim("p", "ok", true);`);
    expect(fs.readFile(bare)?.path).toBe("/p.js");
    expect(fs.loadProgramFile(bare)?.id).toBe("p-js");
    expect(when(["p", "ok", $.v])).toEqual([{ v: true }]);
    expect(fs.deleteFile(bare)).toBe(true);
    expect(fs.listFiles()).toEqual([]);
  });
});
