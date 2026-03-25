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
  content?: ToolCallContent[];
}

export type ToolCallContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText: string; newText: string }
  | { type: "terminal"; terminalId: string };

export interface UsageUpdateData {
  costAmount?: number;
  costCurrency?: string;
  size: number;
  used: number;
}

export type PlanEntryStatus = "pending" | "in_progress" | "completed";
export type PlanEntryPriority = "high" | "medium" | "low";

export interface PlanEntry {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
}

export interface PlanData {
  entries: PlanEntry[];
}

export interface AvailableCommand {
  name: string;
  description: string;
  inputHint?: string;
}

export type EventPayload =
  | { type: "agentMessageChunk"; text: string }
  | { type: "agentThoughtChunk"; text: string }
  | { type: "toolCall"; data: ToolCallData }
  | { type: "toolCallUpdate"; data: ToolCallUpdateData }
  | { type: "usageUpdate"; data: UsageUpdateData }
  | { type: "plan"; data: PlanData }
  | { type: "currentModeUpdate"; modeId: string }
  | { type: "availableCommandsUpdate"; commands: AvailableCommand[] }
  | { type: "sessionInfoUpdate"; title?: string }
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
      // Parse content array from tool call results
      let content: ToolCallContent[] | undefined;
      if (Array.isArray(update.content)) {
        content = [];
        for (const block of update.content) {
          if (block.type === "text" && typeof block.text === "string") {
            content.push({ type: "text", text: block.text });
          } else if (block.type === "diff") {
            content.push({ type: "diff", path: block.path ?? "", oldText: block.oldText ?? "", newText: block.newText ?? "" });
          } else if (block.type === "terminal" && typeof block.terminalId === "string") {
            content.push({ type: "terminal", terminalId: block.terminalId });
          }
        }
      }
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
              content,
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

    case "plan": {
      const entries: PlanEntry[] = [];
      if (Array.isArray(update.entries)) {
        for (const e of update.entries) {
          entries.push({
            content: e.content ?? "",
            priority: e.priority ?? "medium",
            status: e.status ?? "pending",
          });
        }
      }
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: { type: "plan", data: { entries } },
        },
      };
    }

    case "current_mode_update": {
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: { type: "currentModeUpdate", modeId: update.modeId ?? update.currentModeId ?? "" },
        },
      };
    }

    case "available_commands_update": {
      const commands: AvailableCommand[] = [];
      if (Array.isArray(update.availableCommands)) {
        for (const cmd of update.availableCommands) {
          commands.push({
            name: cmd.name ?? "",
            description: cmd.description ?? "",
            inputHint: cmd.input?.hint,
          });
        }
      }
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: { type: "availableCommandsUpdate", commands },
        },
      };
    }

    case "session_info_update": {
      return {
        type: "event",
        event: {
          id,
          eventIndex: idx,
          payload: { type: "sessionInfoUpdate", title: update.title },
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
