// ACP JSON-RPC SSE Message Parser
// Ports the Swift ACPMessageParser to TypeScript.

export interface ToolCallData {
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
}

export interface ToolCallUpdateData {
  toolCallId: string;
  title?: string;
  status?: string;
}

export interface UsageUpdateData {
  costAmount?: number;
  costCurrency?: string;
  size: number;
  used: number;
}

export type EventPayload =
  | { type: "agentMessageChunk"; text: string }
  | { type: "agentThoughtChunk"; text: string }
  | { type: "toolCall"; data: ToolCallData }
  | { type: "toolCallUpdate"; data: ToolCallUpdateData }
  | { type: "usageUpdate"; data: UsageUpdateData }
  | { type: "sessionEnd"; stopReason: string }
  | { type: "unknown"; sessionUpdate: string };

export interface AgentEvent {
  id: string;
  eventIndex: number;
  payload: EventPayload;
}

export type ParseResult =
  | { type: "event"; event: AgentEvent }
  | { type: "sessionEnd"; stopReason: string }
  | { type: "skip" };

let _nextEventId = 0;

/**
 * Parse a raw SSE data string (JSON-RPC message) into a ParseResult.
 * Mutates eventIndex counter for monotonic event ordering.
 */
export function parseACPMessage(
  data: string,
  eventIndex: { value: number }
): ParseResult {
  let json: any;
  try {
    json = JSON.parse(data);
  } catch {
    return { type: "skip" };
  }

  // JSON-RPC error — handled elsewhere
  if (json.error) {
    return { type: "skip" };
  }

  // JSON-RPC response (has "id" and "result") — check for stopReason
  if (json.id !== undefined && json.result) {
    if (typeof json.result.stopReason === "string") {
      return { type: "sessionEnd", stopReason: json.result.stopReason };
    }
    return { type: "skip" };
  }

  // JSON-RPC notification — must be session/update
  if (
    json.method !== "session/update" ||
    !json.params?.update?.sessionUpdate
  ) {
    return { type: "skip" };
  }

  const update = json.params.update;
  const sessionUpdate: string = update.sessionUpdate;

  eventIndex.value += 1;
  const idx = eventIndex.value;
  const id = `evt-${_nextEventId++}`;

  switch (sessionUpdate) {
    case "agent_message_chunk": {
      const text = update.content?.text ?? "";
      return {
        type: "event",
        event: { id, eventIndex: idx, payload: { type: "agentMessageChunk", text } },
      };
    }

    case "agent_thought_chunk": {
      const text = update.content?.text ?? "";
      return {
        type: "event",
        event: { id, eventIndex: idx, payload: { type: "agentThoughtChunk", text } },
      };
    }

    case "tool_call": {
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: {
            type: "toolCall",
            data: {
              toolCallId: update.toolCallId ?? id,
              title: update.title ?? "Unknown tool",
              kind: update.kind,
              status: update.status,
            },
          },
        },
      };
    }

    case "tool_call_update": {
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: {
            type: "toolCallUpdate",
            data: {
              toolCallId: update.toolCallId ?? "",
              title: update.title,
              status: update.status,
            },
          },
        },
      };
    }

    case "usage_update": {
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: {
            type: "usageUpdate",
            data: {
              size: update.size ?? 0,
              used: update.used ?? 0,
              costAmount: update.cost?.amount,
              costCurrency: update.cost?.currency,
            },
          },
        },
      };
    }

    default:
      return {
        type: "event",
        event: { id, eventIndex: idx, payload: { type: "unknown", sessionUpdate } },
      };
  }
}
