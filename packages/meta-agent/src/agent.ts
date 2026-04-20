import { remember, replace, transaction } from "@jam/core";
import {
  createDefaultMetaAgentTools,
} from "./tools";
import { createMemoryJamFileSystem } from "./filesystem";
import type {
  JamFileSystem,
  MetaAgent,
  MetaAgentDriver,
  MetaAgentDriverInput,
  MetaAgentDriverPlan,
  MetaAgentOptions,
  MetaAgentTool,
  MetaAgentToolCall,
} from "./types";

let nextAgentId = 1;
let nextMessageId = 1;

function makeAgentId(): string {
  const id = `meta-agent-${nextAgentId}`;
  nextAgentId += 1;
  return id;
}

function appendMessage(agentId: string, role: string, text: string): void {
  const messageId = `m-${nextMessageId}`;
  nextMessageId += 1;
  const createdAt = Date.now();
  transaction(() => {
    remember("metaAgentMessage", agentId, messageId, "role", role);
    remember("metaAgentMessage", agentId, messageId, "text", text);
    remember("metaAgentMessage", agentId, messageId, "createdAt", createdAt);
  });
}

function stringifyToolInput(input: unknown): string {
  if (input == null) return "{}";
  return JSON.stringify(input);
}

function demoProgramSource(prompt: string): string {
  const safePrompt = JSON.stringify(prompt.slice(0, 160));
  return [
    `claim("meta-agent-demo", "status", "loaded");`,
    `claim("meta-agent-demo", "prompt", ${safePrompt});`,
    `claim("meta-agent-demo", "note", "This program was written and loaded by the in-browser meta agent.");`,
  ].join("\n");
}

export function createHeuristicMetaAgentDriver(): MetaAgentDriver {
  return {
    plan(input: MetaAgentDriverInput): MetaAgentDriverPlan {
      const prompt = input.prompt.toLowerCase();
      const toolCalls: MetaAgentToolCall[] = [{ toolName: "appSummary" }];

      if (prompt.includes("fact") || prompt.includes("state") || prompt.includes("db")) {
        toolCalls.push({ toolName: "inspectFacts", input: { limit: 30 } });
      }

      if (prompt.includes("ui") || prompt.includes("dom") || prompt.includes("screen")) {
        toolCalls.push({ toolName: "inspectVdom", input: { selector: "div", limit: 20 } });
      }

      if (prompt.includes("file") || prompt.includes("program") || prompt.includes("change") || prompt.includes("write")) {
        toolCalls.push({
          toolName: "writeFile",
          input: {
            path: "/programs/meta-agent-demo.js",
            content: demoProgramSource(input.prompt),
          },
        });
        toolCalls.push({
          toolName: "loadProgram",
          input: {
            path: "/programs/meta-agent-demo.js",
            id: "meta-agent-demo",
          },
        });
      } else {
        toolCalls.push({ toolName: "listPrograms" });
      }

      return {
        toolCalls,
        response: "I inspected the Jam app from inside the browser and recorded the tool results here.",
      };
    },
  };
}

function publishAgent(agentId: string): void {
  transaction(() => {
    remember("metaAgent", agentId, "createdAt", Date.now());
    replace("metaAgent", agentId, "status", "idle");
  });
}

export function createMetaAgent(options: MetaAgentOptions = {}): MetaAgent {
  const id = options.id ?? makeAgentId();
  const fs: JamFileSystem = options.fs ?? createMemoryJamFileSystem();
  const tools = [...createDefaultMetaAgentTools(), ...(options.tools ?? [])];
  const driver = options.driver ?? createHeuristicMetaAgentDriver();
  const toolMap = new Map<string, MetaAgentTool>(tools.map((tool) => [tool.name, tool]));

  publishAgent(id);

  return {
    id,
    fs,
    tools,
    addTool(tool) {
      tools.push(tool);
      toolMap.set(tool.name, tool);
    },
    async runPrompt(prompt) {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      appendMessage(id, "user", trimmed);
      replace("metaAgent", id, "status", "running");

      try {
        const context = { agentId: id, fs };
        const plan = await driver.plan({ prompt: trimmed, tools, context });

        for (const call of plan.toolCalls) {
          const tool = toolMap.get(call.toolName);
          if (!tool) {
            appendMessage(id, "tool", `${call.toolName}: tool not found`);
            continue;
          }

          appendMessage(id, "tool", `${tool.name} ${stringifyToolInput(call.input)}`);
          const result = await tool.run(call.input, context);
          appendMessage(id, "tool", `${result.title}\n${result.content}`);
        }

        appendMessage(id, "assistant", plan.response);
        replace("metaAgent", id, "status", "idle");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendMessage(id, "assistant", `Meta agent failed: ${message}`);
        replace("metaAgent", id, "status", "failed");
      }
    },
  };
}
