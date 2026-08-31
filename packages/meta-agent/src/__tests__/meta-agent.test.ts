// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { $, db, listPrograms, mount, removeProgram, replace, when } from "@jam/core";
import { h } from "@jam/core/jsx";
import {
  createDescribeUITool,
  createDriveTool,
  createMemoryJamFileSystem,
  createMetaAgent,
  createPressTool,
} from "..";

function Counter() {
  const count = Number(when(["counter", "count", $.n])[0]?.n ?? 0);
  return h("main", {},
    h("h1", {}, "Counter"),
    h("button", { onClick: () => replace("counter", "count", count + 1) }, `Count ${count}`),
    h("label", {}, "Name", h("input", { value: "", onInput: (e: Event) => db.assert("form", "name", (e.target as HTMLInputElement).value) })),
  );
}

describe("@jam/meta-agent", () => {
  beforeEach(() => {
    for (const id of listPrograms()) {
      removeProgram(id);
    }
    db.clear();
  });

  it("runs browser tools and records the transcript in facts", async () => {
    const agent = createMetaAgent({
      id: "test-agent",
      fs: createMemoryJamFileSystem(),
    });

    await agent.runPrompt("inspect facts and write a Jam program");

    const messages = when(
      ["metaAgentMessage", "test-agent", $.messageId, "role", $.role],
      ["metaAgentMessage", "test-agent", $.messageId, "text", $.text],
    );
    const text = messages.map((message) => String(message.text)).join("\n");

    expect(text).toContain("appSummary");
    expect(text).toContain("inspectFacts");
    expect(text).toContain("writeFile");
    expect(text).toContain("Loaded program");
    expect(when(["meta-agent-demo", "status", $.status])).toEqual([{ status: "loaded" }]);
    expect(agent.fs.readFile("/programs/meta-agent-demo.js")).toBeDefined();
  });

  it("reads the UI as an outline and operates it through describeUI/press/drive", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(h(Counter, {}), root);
    const context = { agentId: "test-agent", fs: createMemoryJamFileSystem() };
    try {
      const outline = await createDescribeUITool().run({}, context);
      expect(outline.content.split("\n")).toEqual([
        "main #dom:0 <Counter>",
        '  heading "Counter" #dom:0:0 level=1',
        '  button "Count 0" #dom:0:1',
        '  textbox "Name" #dom:0:2:1 value=""',
      ]);

      await createPressTool().run({ id: "dom:0:1" }, context);
      expect((await createDescribeUITool().run({ interactive: true }, context)).content).toContain('button "Count 1" #dom:0:1');

      const driven = await createDriveTool().run({ id: "dom:0:2:1", key: "value", value: "Ada" }, context);
      expect(when(["form", "name", $.name])).toEqual([{ name: "Ada" }]);
      expect(driven.content).toContain('"value": "Ada"');
    } finally {
      dispose();
      root.remove();
    }
  });

  it("publishes browser file metadata as Jam facts", () => {
    const fs = createMemoryJamFileSystem();

    fs.writeFile("/programs/hello.js", "claim('hello', 'status', 'loaded')");

    expect(when(["jamProgramFile", "/programs/hello.js", "size", $.size])).toEqual([
      { size: "claim('hello', 'status', 'loaded')".length },
    ]);

    fs.deleteFile("/programs/hello.js");

    expect(when(["jamProgramFile", "/programs/hello.js", "size", $.size])).toEqual([]);
  });
});
