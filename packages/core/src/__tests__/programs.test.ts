import { describe, it, expect, beforeEach } from "vitest";
import { $, db, when, remember } from "../index";
import { createJamProgramFileSystem } from "../program-files";
import { loadProgramSource, listPrograms, program, registerProgram, removeProgram } from "../programs";

describe("program registry", () => {
  beforeEach(() => {
    for (const id of listPrograms()) {
      removeProgram(id);
    }
    db.clear();
  });

  it("removes top-level facts and reactive claims when a program is removed", () => {
    registerProgram("strikethrough", ({ $, claim, whenever }) => {
      claim("program", "strikethrough", "loaded");
      whenever([["todo", $.id, "done", true]], (matches) => {
        for (const { id } of matches) {
          claim(`todo-${id}`, "class", "strikethrough");
        }
      });
    });

    expect(listPrograms()).toContain("strikethrough");
    expect(when(["program", "strikethrough", $.status])).toEqual([{ status: "loaded" }]);

    remember("todo", 1, "done", true);
    expect(when(["todo-1", "class", $.cls])).toContainEqual({ cls: "strikethrough" });

    removeProgram("strikethrough");

    expect(listPrograms()).not.toContain("strikethrough");
    expect(when(["program", "strikethrough", $.status])).toEqual([]);
    expect(when(["todo-1", "class", $.cls])).toEqual([]);
  });

  it("replacing a program id cleans up the previous program before running the new one", () => {
    registerProgram("status", ({ claim }) => {
      claim("program-status", "value", "old");
    });

    registerProgram("status", ({ claim }) => {
      claim("program-status", "value", "new");
    });

    expect(when(["program-status", "value", $.value])).toEqual([{ value: "new" }]);
    expect(Array.from(db.facts.values()).filter((fact) => fact[0] === "program-status")).toHaveLength(1);
  });

  it("loads source programs dynamically and removes their facts and disposers", () => {
    loadProgramSource("dynamic", `
      claim("dynamic-program", "loaded", true);
      whenever([["feature", $.id, "enabled", true]], function(matches) {
        for (const match of matches) {
          claim("feature-" + match.id, "class", "enabled");
        }
      });
    `);

    remember("feature", "search", "enabled", true);

    expect(when(["dynamic-program", "loaded", $.value])).toEqual([{ value: true }]);
    expect(when(["feature-search", "class", $.cls])).toEqual([{ cls: "enabled" }]);

    removeProgram("dynamic");

    expect(when(["dynamic-program", "loaded", $.value])).toEqual([]);
    expect(when(["feature-search", "class", $.cls])).toEqual([]);
  });

  it("program() helper registers immediately and disposer unregisters the program", () => {
    const dispose = program("helper", ({ claim }) => {
      claim("helper-program", "active", true);
    });

    expect(listPrograms()).toContain("helper");
    expect(when(["helper-program", "active", $.value])).toEqual([{ value: true }]);

    dispose();

    expect(listPrograms()).not.toContain("helper");
    expect(when(["helper-program", "active", $.value])).toEqual([]);
  });

  it("loads dynamic programs from shared Jam program files", () => {
    const fs = createJamProgramFileSystem();

    fs.writeFile("/programs/shared.js", `claim("shared-program", "status", "loaded");`);
    expect(when(["jamProgramFile", "/programs/shared.js", "content", $.content])).toEqual([
      { content: `claim("shared-program", "status", "loaded");` },
    ]);

    fs.loadProgramFile("/programs/shared.js", "shared-program");

    expect(listPrograms()).toContain("shared-program");
    expect(when(["shared-program", "status", $.status])).toEqual([{ status: "loaded" }]);
    expect(when(["jamProgramFile", "/programs/shared.js", "programId", $.id])).toEqual([
      { id: "shared-program" },
    ]);

    fs.writeFile("/programs/shared.js", `claim("shared-program", "status", "reloaded");`);
    fs.loadProgramFile("/programs/shared.js", "shared-program");

    expect(when(["shared-program", "status", $.status])).toEqual([{ status: "reloaded" }]);
  });
});
