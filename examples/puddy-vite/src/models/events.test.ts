import { describe, it, expect } from "vitest";
import { parseACPMessage } from "./events";
import { isTerminalStatus } from "./session";

// ============================================================================
// ACP Message Parser Tests — ported from tests/puddy_models.rs
// ============================================================================

describe("parseACPMessage", () => {
  it("parses agent_message_chunk", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { text: "Hello" },
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("agentMessageChunk");
    if (result.event.payload.type !== "agentMessageChunk") return;
    expect(result.event.payload.text).toBe("Hello");
    expect(result.event.eventIndex).toBe(1);
    expect(idx.value).toBe(1);
  });

  it("parses agent_thought_chunk", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: { text: "thinking..." },
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("agentThoughtChunk");
    if (result.event.payload.type !== "agentThoughtChunk") return;
    expect(result.event.payload.text).toBe("thinking...");
  });

  it("parses tool_call", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tc-1",
            title: "Read file",
            kind: "bash",
            status: "running",
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("toolCall");
    if (result.event.payload.type !== "toolCall") return;
    expect(result.event.payload.data.toolCallId).toBe("tc-1");
    expect(result.event.payload.data.title).toBe("Read file");
  });

  it("parses tool_call_update", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "tc-1",
            title: "Read file",
            status: "completed",
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("toolCallUpdate");
    if (result.event.payload.type !== "toolCallUpdate") return;
    expect(result.event.payload.data.status).toBe("completed");
  });

  it("parses usage_update", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "usage_update",
            size: 100000,
            used: 5000,
            cost: { amount: 0.05, currency: "USD" },
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("usageUpdate");
    if (result.event.payload.type !== "usageUpdate") return;
    expect(result.event.payload.data.size).toBe(100000);
    expect(result.event.payload.data.used).toBe(5000);
  });

  it("parses session_end from JSON-RPC result", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { stopReason: "end_turn" },
      }),
      idx,
    );

    expect(result.type).toBe("sessionEnd");
    if (result.type !== "sessionEnd") return;
    expect(result.stopReason).toBe("end_turn");
  });

  it("skips JSON-RPC response without stopReason", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { sessionId: "abc" },
      }),
      idx,
    );

    expect(result.type).toBe("skip");
  });

  it("parses sandbox-agent mock echo prompts", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "mock/echo",
        params: {
          message: {
            jsonrpc: "2.0",
            id: 2,
            method: "session/prompt",
            params: {
              prompt: [{ type: "text", text: "hello from e2e" }],
            },
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("agentMessageChunk");
    if (result.event.payload.type !== "agentMessageChunk") return;
    expect(result.event.payload.text).toBe("mock echoed: hello from e2e");
    expect(idx.value).toBe(1);
  });

  it("skips JSON-RPC error", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid request" },
      }),
      idx,
    );

    expect(result.type).toBe("skip");
  });

  it("skips invalid JSON", () => {
    const idx = { value: 0 };
    const result = parseACPMessage("not json", idx);
    expect(result.type).toBe("skip");
  });

  it("increments event index", () => {
    const idx = { value: 0 };
    const msg = JSON.stringify({
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { text: "a" },
        },
      },
    });

    parseACPMessage(msg, idx);
    parseACPMessage(msg, idx);
    const r3 = parseACPMessage(msg, idx);

    expect(idx.value).toBe(3);
    if (r3.type !== "event") return;
    expect(r3.event.eventIndex).toBe(3);
  });

  it("parses plan", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "plan",
            entries: [
              { content: "Read file", status: "completed", priority: "high" },
              {
                content: "Fix bug",
                status: "in_progress",
                priority: "medium",
              },
            ],
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("plan");
    if (result.event.payload.type !== "plan") return;
    expect(result.event.payload.data.entries).toHaveLength(2);
    expect(result.event.payload.data.entries[0].content).toBe("Read file");
    expect(result.event.payload.data.entries[0].status).toBe("completed");
  });

  it("parses current_mode_update", () => {
    const idx = { value: 0 };
    const result = parseACPMessage(
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "current_mode_update",
            modeId: "architect",
          },
        },
      }),
      idx,
    );

    expect(result.type).toBe("event");
    if (result.type !== "event") return;
    expect(result.event.payload.type).toBe("currentModeUpdate");
    if (result.event.payload.type !== "currentModeUpdate") return;
    expect(result.event.payload.modeId).toBe("architect");
  });
});

// ============================================================================
// Session model tests
// ============================================================================

describe("isTerminalStatus", () => {
  it("returns false for non-terminal statuses", () => {
    expect(isTerminalStatus("starting")).toBe(false);
    expect(isTerminalStatus("active")).toBe(false);
  });

  it("returns true for terminal statuses", () => {
    expect(isTerminalStatus("ended")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });
});
