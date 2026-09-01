// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { $, db, listPrograms, mount, removeProgram, when, type JamProgramFileSystem } from "@jam/core";
import { h } from "@jam/core/jsx";
import {
  createAppSummaryTool,
  createInspectFactsTool,
  createInspectVdomTool,
  createListProgramsTool,
  createLoadProgramTool,
  createMemoryJamFileSystem,
  createReadFileTool,
  createWriteFileTool,
} from "..";

const context = () => ({ agentId: "tools", fs: createMemoryJamFileSystem() });
let dispose: (() => void) | undefined;

describe("meta agent tools", () => {
  beforeEach(() => {
    for (const id of listPrograms()) removeProgram(id);
    db.clear();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("inspects facts by prefix within a clamped limit", async () => {
    for (let i = 0; i < 250; i++) db.assert("item", i, "n", i);
    db.assert("other", 1, "n", 1);
    const tool = createInspectFactsTool();
    const all = await tool.run({}, context());
    expect(all.data).toMatchObject({ count: 251, returned: 40 });

    const capped = await tool.run({ limit: 999 }, context());
    expect(capped.data).toMatchObject({ returned: 200 });

    const one = await tool.run({ limit: 0, prefix: "oth" }, context());
    expect(one.data).toMatchObject({ returned: 1, facts: [["other", 1, "n", 1]] });
    expect(one.content).toBe(JSON.stringify(one.data, null, 2));
  });

  it("inspects the VDOM through selectors", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    dispose = mount(h("main", {}, h("div", { class: "a" }), h("div", { class: "b" }), h("span", {})), root);
    const tool = createInspectVdomTool();
    expect((await tool.run({}, context())).data).toMatchObject({ selector: "div", returned: 2 });
    expect((await tool.run({ selector: "span", limit: 500 }, context())).data).toMatchObject({ selector: "span", returned: 1 });
    expect((await tool.run({ limit: -5 }, context())).data).toMatchObject({ returned: 1 });
  });

  it("reads, writes and lists program files", async () => {
    const ctx = context();
    expect((await createReadFileTool().run({ path: "/programs/none.js" }, ctx)).data).toEqual({ path: "/programs/none.js", missing: true });

    const written = await createWriteFileTool().run({ path: "/programs/a.js", content: "claim('a', 'x', 1)" }, ctx);
    expect(written.data).toMatchObject({ path: "/programs/a.js", size: 18 });
    expect((await createReadFileTool().run({ path: "/programs/a.js" }, ctx)).data).toMatchObject({ content: "claim('a', 'x', 1)" });

    const listed = await createListProgramsTool().run(undefined, ctx);
    expect(listed.data).toMatchObject({ registered: [], files: [{ path: "/programs/a.js", size: 18 }] });
  });

  it("loads programs, deriving the id from the path", async () => {
    const ctx = context();
    ctx.fs.writeFile("/programs/greet.js", "claim('greet', 'said', 'hi')");
    const tool = createLoadProgramTool();

    expect((await tool.run({ path: "/programs/missing.js" }, ctx)).data).toEqual({ path: "/programs/missing.js", error: "File not found" });

    const loaded = await tool.run({ path: "/programs/greet.js" }, ctx);
    expect(loaded.data).toEqual({ id: "programs/greet-js", path: "/programs/greet.js" });
    expect(when(["greet", "said", $.what])).toEqual([{ what: "hi" }]);
    expect(listPrograms()).toContain("programs/greet-js");

    const refusing: JamProgramFileSystem = { ...ctx.fs, loadProgramFile: () => undefined };
    const failed = await tool.run({ path: "/programs/greet.js" }, { ...ctx, fs: refusing });
    expect(failed.title).toBe("Program load failed");
  });

  it("summarises the app", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    dispose = mount(h("main", { class: "app" }, h("p", {}, "hi")), root);
    const ctx = context();
    ctx.fs.writeFile("/programs/a.js", "");
    db.assert("todo", 1, "title", "x");
    const summary = (await createAppSummaryTool().run(undefined, ctx)).data as Record<string, unknown>;
    expect(summary.editableFiles).toEqual(["/programs/a.js"]);
    expect(summary.registeredPrograms).toEqual([]);
    expect(summary.totalFacts).toBeGreaterThan(Number(summary.vdomFacts));
    expect(summary.vdomFacts).toBeGreaterThan(0);
    expect(summary.domFacts).toBeGreaterThan(0);
  });
});
