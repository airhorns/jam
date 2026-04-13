// VCR integration tests — replay recorded cassettes through the full stack.
// Exercises: SandboxAgentClient → SessionManager → event parsing → Jam fact DB.

import { describe, expect } from "vitest";
import {
  test,
  healthEntry, agentsEntry, createSessionEntry, sseStreamEntry,
  promptAckEntry, destroySessionEntry,
  sseMessageChunk, sseThoughtChunk, sseToolCall, sseToolCallUpdate, sseSessionEnd,
  type Cassette,
} from "./cassette";
import { db, $ } from "@jam/core";
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
