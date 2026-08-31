// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { $, db, listPrograms, mount, removeProgram, when } from "@jam/core";
import { h } from "@jam/core/jsx";
import { createHeuristicMetaAgentDriver, createMemoryJamFileSystem, createMetaAgent } from "..";
import type { MetaAgentTool } from "../types";

const transcript = (agentId: string) =>
  when(
    ["metaAgentMessage", agentId, $.messageId, "role", $.role],
    ["metaAgentMessage", agentId, $.messageId, "text", $.text],
    ["metaAgentMessage", agentId, $.messageId, "createdAt", $.createdAt],
  )
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt) || String(a.messageId).localeCompare(String(b.messageId), undefined, { numeric: true }))
    .map((message) => `${message.role}: ${message.text}`);

const status = (agentId: string) => when(["metaAgent", agentId, "status", $.status])[0]?.status;

const planCalls = (prompt: string) => {
  const context = { agentId: "x", fs: createMemoryJamFileSystem() };
  const plan = createHeuristicMetaAgentDriver().plan({ prompt, tools: [], context }) as { toolCalls: { toolName: string }[] };
  return plan.toolCalls.map((call) => call.toolName);
};

describe("createMetaAgent", () => {
  beforeEach(() => {
    for (const id of listPrograms()) removeProgram(id);
    db.clear();
  });

  it("assigns ids to agents that are not given one and publishes them idle", () => {
    const a = createMetaAgent();
    const b = createMetaAgent();
    expect(a.id).toMatch(/^meta-agent-\d+$/);
    expect(b.id).not.toBe(a.id);
    expect(status(a.id)).toBe("idle");
    expect(when(["metaAgent", a.id, "createdAt", $.at])).toHaveLength(1);
  });

  it("ignores blank prompts", async () => {
    const agent = createMetaAgent({ id: "blank" });
    await agent.runPrompt("   ");
    expect(transcript("blank")).toEqual([]);
    expect(status("blank")).toBe("idle");
  });

  it("runs a custom driver's plan through added tools and notes missing ones", async () => {
    const shout: MetaAgentTool<{ text: string }> = {
      name: "shout",
      description: "uppercase",
      run: (input) => ({ title: "Shouted", content: input.text.toUpperCase() }),
    };
    const agent = createMetaAgent({
      id: "custom",
      driver: {
        plan: ({ prompt }) => ({
          toolCalls: [{ toolName: "shout", input: { text: prompt } }, { toolName: "nope" }, { toolName: "appSummary" }],
          response: "done",
        }),
      },
    });
    agent.addTool(shout);
    expect(agent.tools.map((tool) => tool.name)).toContain("shout");

    await agent.runPrompt("  hi there ");

    expect(transcript("custom")).toEqual([
      "user: hi there",
      'tool: shout {"text":"hi there"}',
      "tool: Shouted\nHI THERE",
      "tool: nope: tool not found",
      "tool: appSummary {}",
      expect.stringMatching(/^tool: Jam app summary\n/),
      "assistant: done",
    ]);
    expect(status("custom")).toBe("idle");
  });

  it("marks the agent failed when the driver or a tool throws", async () => {
    const throwing = createMetaAgent({
      id: "failing",
      driver: {
        plan: () => {
          throw new Error("no plan");
        },
      },
    });
    await throwing.runPrompt("go");
    expect(transcript("failing").at(-1)).toBe("assistant: Meta agent failed: no plan");
    expect(status("failing")).toBe("failed");

    const rejecting = createMetaAgent({
      id: "rejecting",
      driver: { plan: () => Promise.reject("nope") },
    });
    await rejecting.runPrompt("go");
    expect(transcript("rejecting").at(-1)).toBe("assistant: Meta agent failed: nope");
  });

  it("reports running while a prompt is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const agent = createMetaAgent({
      id: "slow",
      driver: { plan: async () => (await gate, { toolCalls: [], response: "ok" }) },
    });
    const run = agent.runPrompt("wait");
    expect(status("slow")).toBe("running");
    release();
    await run;
    expect(status("slow")).toBe("idle");
  });
});

describe("createHeuristicMetaAgentDriver", () => {
  beforeEach(() => db.clear());

  it("picks tools from the words in the prompt", () => {
    expect(planCalls("hello")).toEqual(["appSummary", "listPrograms"]);
    expect(planCalls("show me the state")).toEqual(["appSummary", "inspectFacts", "listPrograms"]);
    expect(planCalls("what is on screen")).toEqual(["appSummary", "describeUI", "inspectVdom", "listPrograms"]);
    expect(planCalls("check the db and the dom")).toEqual(["appSummary", "inspectFacts", "describeUI", "inspectVdom", "listPrograms"]);
    expect(planCalls("write a program")).toEqual(["appSummary", "writeFile", "loadProgram"]);
    expect(planCalls("make a change")).toEqual(["appSummary", "writeFile", "loadProgram"]);
  });

  it("embeds a truncated prompt in the program it writes", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(h("main", {}, h("p", {}, "hi")), root);
    try {
      const long = `change ${"x".repeat(200)}`;
      const agent = createMetaAgent({ id: "writer", fs: createMemoryJamFileSystem() });
      await agent.runPrompt(`${long} on the ui`);
      const source = agent.fs.readFile("/programs/meta-agent-demo.js")?.content ?? "";
      expect(source).toContain(JSON.stringify(`${long} on the ui`.slice(0, 160)));
      expect(when(["meta-agent-demo", "prompt", $.prompt])[0]?.prompt).toHaveLength(160);
      expect(transcript("writer").some((line) => line.startsWith("tool: Jam UI outline\n"))).toBe(true);
    } finally {
      dispose();
      root.remove();
    }
  });
});
