// VCR integration tests — replay recorded cassettes through the full stack.
// Exercises: SandboxAgentClient → SessionManager → event parsing → Jam fact DB.

import { describe, expect } from "vitest";
import {
  test,
  healthEntry, agentsEntry, createSessionEntry, sseStreamEntry,
  promptAckEntry, destroySessionEntry,
  sseMessageChunk, sseThoughtChunk, sseToolCall, sseToolCallUpdate, sseSessionEnd,
  type Cassette, type VCRFixture,
} from "./cassette";
import { db, $, listPrograms, removeProgram } from "@jam/core";
import {
  createMemoryJamFileSystem,
  createMetaAgent,
  type MetaAgentDriver,
  type MetaAgentDriverPlan,
} from "@jam/meta-agent";
import helloCassetteRaw from "./cassettes/hello.json";

const helloCassette = helloCassetteRaw as unknown as Cassette;

const SID = "s-test";
const AGENT = "claude";

// --- Reusable cassette fragments ---

function connectionCassette(): Cassette {
  return [
    healthEntry(),
    agentsEntry([{ id: AGENT, installed: true, credentialsAvailable: true }]),
  ];
}

function sessionCassette(sseData: string[]): Cassette {
  return [
    ...connectionCassette(),
    createSessionEntry(SID, AGENT, "acp-123"),
    sseStreamEntry(SID, sseData),
    promptAckEntry(SID),
    destroySessionEntry(SID),
  ];
}

function extractJsonPlan(text: string): MetaAgentDriverPlan {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Recorded provider did not return a JSON plan: ${text}`);
  }

  const plan = JSON.parse(text.slice(start, end + 1)) as MetaAgentDriverPlan;
  if (!Array.isArray(plan.toolCalls) || typeof plan.response !== "string") {
    throw new Error("Recorded provider returned an invalid meta-agent plan");
  }
  return plan;
}

function createRecordedProviderDriver(vcr: VCRFixture): MetaAgentDriver {
  return {
    async plan(input) {
      const sessionId = "meta-agent-provider";
      await vcr.client.createSession(sessionId, AGENT);

      const chunks: string[] = [];
      let rejectStream: (error: Error) => void = () => {};
      const done = new Promise<string>((resolve, reject) => {
        rejectStream = reject;
        vcr.client.startEventStream(
          sessionId,
          (event) => {
            if (event.payload.type === "agentMessageChunk") {
              chunks.push(event.payload.text);
            }
            if (event.payload.type === "sessionEnd") {
              resolve(chunks.join(""));
            }
          },
          reject,
        );
      });

      vcr.client.sendPrompt(
        sessionId,
        JSON.stringify({
          kind: "jam-meta-agent-plan",
          prompt: input.prompt,
          tools: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
          })),
        }),
        undefined,
        rejectStream,
      );

      return extractJsonPlan(await done);
    },
  };
}

// --- Tests ---

describe("VCR: connection check", () => {
  test("checkConnection sets connected state and loads agents", async ({ vcr }) => {
    vcr.load(connectionCassette());

    await vcr.manager.checkConnection();

    expect(vcr.manager.isConnected).toBe(true);
    expect(vcr.manager.agents).toHaveLength(1);
    expect(vcr.manager.agents[0].id).toBe(AGENT);

    const conn = db.query(["connection", "status", $.status] as any);
    expect(conn).toContainEqual(expect.objectContaining({ status: "connected" }));
  });
});

describe("VCR: simple hello conversation", () => {
  const cassette = sessionCassette([
    sseThoughtChunk("Let me greet the user."),
    sseMessageChunk("Hello! "),
    sseMessageChunk("How can I help you today?"),
    sseSessionEnd(),
  ]);

  test("SSE stream delivers thought, message, and sessionEnd events", async ({ vcr }) => {
    vcr.load(cassette);

    await vcr.client.createSession(SID, AGENT);

    const events: any[] = [];
    const done = new Promise<void>((resolve) => {
      vcr.client.startEventStream(SID, (event) => {
        events.push(event);
        if (event.payload.type === "sessionEnd") resolve();
      }, () => resolve());
    });

    vcr.client.sendPrompt(SID, "hello");
    await done;

    const types = events.map((e) => e.payload.type);
    expect(types).toContain("agentThoughtChunk");
    expect(types).toContain("agentMessageChunk");
    expect(types).toContain("sessionEnd");
  });

  test("SessionManager produces correct facts from conversation", async ({ vcr }) => {
    vcr.load(cassette);

    await vcr.client.createSession(SID, AGENT);
    db.insert("session", SID, "agent", AGENT);
    db.insert("session", SID, "status", "starting");

    const done = new Promise<void>((resolve) => {
      vcr.client.startEventStream(SID, (event) => {
        (vcr.manager as any).handleEvent(SID, event);
        if (event.payload.type === "sessionEnd") setTimeout(resolve, 50);
      }, () => resolve());
    });

    vcr.client.sendPrompt(SID, "hello");
    await done;

    // Thought was finalized into a message fact
    const thoughts = db.query(["message", SID, $.id, "assistant", "thought", $.text] as any);
    expect(thoughts).toContainEqual(expect.objectContaining({ text: "Let me greet the user." }));

    // Text chunks were accumulated and finalized
    const msgs = db.query(["message", SID, $.id, "assistant", "text", $.text] as any);
    expect(msgs).toContainEqual(expect.objectContaining({ text: "Hello! How can I help you today?" }));
  });
});

describe("VCR: recorded hello cassette (real server interaction)", () => {
  test("replays recorded conversation and produces message events", async ({ vcr }) => {
    vcr.load(helloCassette);

    await vcr.client.createSession(SID, AGENT);

    const events: any[] = [];
    const done = new Promise<void>((resolve) => {
      vcr.client.startEventStream(SID, (event) => {
        events.push(event);
        if (event.payload.type === "sessionEnd") resolve();
      }, () => resolve());
    });

    vcr.client.sendPrompt(SID, "say hello in one sentence");
    await done;

    const types = events.map((e) => e.payload.type);
    expect(types).toContain("agentMessageChunk");
    expect(types).toContain("sessionEnd");

    // Verify the actual message chunks contain "Hello"
    const msgChunks = events
      .filter((e) => e.payload.type === "agentMessageChunk")
      .map((e) => (e.payload as any).text);
    const fullMessage = msgChunks.join("");
    expect(fullMessage).toContain("Hello");
  });

  test("SessionManager processes recorded conversation into facts", async ({ vcr }) => {
    vcr.load(helloCassette);

    await vcr.client.createSession(SID, AGENT);
    db.insert("session", SID, "agent", AGENT);
    db.insert("session", SID, "status", "starting");

    const done = new Promise<void>((resolve) => {
      vcr.client.startEventStream(SID, (event) => {
        (vcr.manager as any).handleEvent(SID, event);
        if (event.payload.type === "sessionEnd") setTimeout(resolve, 50);
      }, () => resolve());
    });

    vcr.client.sendPrompt(SID, "say hello in one sentence");
    await done;

    // Assistant message was finalized into a fact
    const msgs = db.query(["message", SID, $.id, "assistant", "text", $.text] as any);
    expect(msgs.length).toBeGreaterThan(0);
    const text = msgs.map((m) => m.text).join("");
    expect(text).toContain("Hello");

    // Session ended
    const statuses = db.query(["session", SID, "status", $.status] as any);
    expect(statuses).toContainEqual(expect.objectContaining({ status: "ended" }));
  });
});

describe("VCR: recorded provider meta-agent plan", () => {
  const programPath = "/programs/recorded-provider-meta-agent.js";
  const programId = "recorded-provider-meta-agent";
  const providerPlan: MetaAgentDriverPlan = {
    toolCalls: [
      { toolName: "appSummary" },
      { toolName: "inspectFacts", input: { prefix: "session", limit: 10 } },
      {
        toolName: "writeFile",
        input: {
          path: programPath,
          content: [
            `claim("${programId}", "status", "loaded");`,
            `claim("${programId}", "source", "recorded-provider");`,
          ].join("\n"),
        },
      },
      { toolName: "loadProgram", input: { path: programPath, id: programId } },
    ],
    response: "The recorded ACP provider selected Jam inspection and program-loading tools.",
  };
  const cassette: Cassette = [
    createSessionEntry("meta-agent-provider", AGENT, "acp-meta-agent"),
    sseStreamEntry("meta-agent-provider", [
      sseMessageChunk(JSON.stringify(providerPlan)),
      sseSessionEnd(),
    ]),
    promptAckEntry("meta-agent-provider"),
  ];

  test("recorded provider drives the meta-agent loop and tools", async ({ vcr }) => {
    vcr.load(cassette);
    if (listPrograms().includes(programId)) removeProgram(programId);

    db.insert("session", "recorded-session", "agent", AGENT);
    db.insert("session", "recorded-session", "status", "active");

    const agent = createMetaAgent({
      id: "recorded-provider-test-agent",
      fs: createMemoryJamFileSystem(),
      driver: createRecordedProviderDriver(vcr),
    });

    try {
      await agent.runPrompt("inspect the current Jam session state and add a small program");

      const transcript = db
        .query(["metaAgentMessage", "recorded-provider-test-agent", $.messageId, "text", $.text] as any)
        .map((message) => String(message.text))
        .join("\n");

      expect(transcript).toContain("Jam app summary");
      expect(transcript).toContain("Jam facts");
      expect(transcript).toContain("Wrote program file");
      expect(transcript).toContain("Loaded program");
      expect(transcript).toContain("recorded ACP provider");
      expect(agent.fs.readFile(programPath)).toEqual(
        expect.objectContaining({ path: programPath }),
      );
      expect(db.query(["jamProgramFile", programPath, "programId", programId] as any)).toHaveLength(1);
      expect(db.query([programId, "status", "loaded"] as any)).toHaveLength(1);
      expect(db.query([programId, "source", "recorded-provider"] as any)).toHaveLength(1);
    } finally {
      if (listPrograms().includes(programId)) removeProgram(programId);
    }
  });
});

describe("VCR: tool use conversation", () => {
  const cassette = sessionCassette([
    sseToolCall("tc-abc", "Read file", "bash"),
    sseToolCallUpdate("tc-abc", "completed"),
    sseMessageChunk("I read the file."),
    sseSessionEnd(),
  ]);

  test("events include tool call and update", async ({ vcr }) => {
    vcr.load(cassette);

    await vcr.client.createSession(SID, AGENT);

    const events: any[] = [];
    const done = new Promise<void>((resolve) => {
      vcr.client.startEventStream(SID, (event) => {
        events.push(event);
        if (event.payload.type === "sessionEnd") resolve();
      }, () => resolve());
    });

    vcr.client.sendPrompt(SID, "read the file");
    await done;

    const types = events.map((e) => e.payload.type);
    expect(types).toContain("toolCall");
    expect(types).toContain("toolCallUpdate");
    expect(types).toContain("agentMessageChunk");
    expect(types).toContain("sessionEnd");

    const toolCall = events.find((e) => e.payload.type === "toolCall");
    expect(toolCall.payload.data.toolCallId).toBe("tc-abc");
    expect(toolCall.payload.data.title).toBe("Read file");
  });

  test("SessionManager asserts tool facts into DB", async ({ vcr }) => {
    vcr.load(cassette);

    await vcr.client.createSession(SID, AGENT);
    db.insert("session", SID, "agent", AGENT);
    db.insert("session", SID, "status", "starting");

    const done = new Promise<void>((resolve) => {
      vcr.client.startEventStream(SID, (event) => {
        (vcr.manager as any).handleEvent(SID, event);
        if (event.payload.type === "sessionEnd") setTimeout(resolve, 50);
      }, () => resolve());
    });

    vcr.client.sendPrompt(SID, "read the file");
    await done;

    // Tool call fact
    const tools = db.query(["message", SID, $.id, "assistant", "toolUse", $.title] as any);
    expect(tools).toContainEqual(expect.objectContaining({ id: "tc-abc", title: "Read file" }));

    // Tool result fact
    const results = db.query(["message", SID, $.id, "tool", "toolResult", $.status] as any);
    expect(results).toContainEqual(expect.objectContaining({ status: "completed" }));

    // Finalized assistant message
    const msgs = db.query(["message", SID, $.id, "assistant", "text", $.text] as any);
    expect(msgs).toContainEqual(expect.objectContaining({ text: "I read the file." }));
  });
});
