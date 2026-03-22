// AgentSession state machine
// Ports the Swift AgentSession model to TypeScript.

import type { AgentEvent } from "./events";

export type SessionStatus =
  | { type: "starting" }
  | { type: "active" }
  | { type: "ended"; reason: string }
  | { type: "failed"; error: string };

export type ConversationSender = "user" | "assistant" | "tool";

export type ConversationItemKind =
  | { type: "text"; text: string }
  | { type: "toolUse"; name: string; status?: string }
  | { type: "toolResult"; title?: string; status: string };

export interface ConversationItem {
  id: string;
  sender: ConversationSender;
  kind: ConversationItemKind;
  timestamp: number;
}

export interface TokenUsage {
  costAmount?: number;
  costCurrency?: string;
  contextSize: number;
  contextUsed: number;
}

let _nextMsgId = 0;

export interface AgentSession {
  id: string;
  agent: string;
  createdAt: number;
  status: SessionStatus;
  messages: ConversationItem[];
  lastEventIndex: number;
  streamingText: string | null;
  tokenUsage: TokenUsage | null;
}

export function createSession(
  id: string,
  agent: string = "claude"
): AgentSession {
  return {
    id,
    agent,
    createdAt: Date.now(),
    status: { type: "starting" },
    messages: [],
    lastEventIndex: -1,
    streamingText: null,
    tokenUsage: null,
  };
}

/**
 * Apply an incoming ACP event to update session state.
 * Returns a NEW session object (immutable update).
 */
export function applyEvent(
  session: AgentSession,
  event: AgentEvent
): AgentSession {
  const s = { ...session, messages: [...session.messages] };
  s.lastEventIndex = Math.max(s.lastEventIndex, event.eventIndex);

  const p = event.payload;

  switch (p.type) {
    case "agentMessageChunk":
      if (s.status.type === "starting") {
        s.status = { type: "active" };
      }
      s.streamingText = (s.streamingText ?? "") + p.text;
      break;

    case "agentThoughtChunk":
      if (s.status.type === "starting") {
        s.status = { type: "active" };
      }
      break;

    case "toolCall":
      finalizeStreamingText(s);
      s.messages.push({
        id: p.data.toolCallId,
        sender: "assistant",
        kind: { type: "toolUse", name: p.data.title, status: p.data.status },
        timestamp: Date.now(),
      });
      break;

    case "toolCallUpdate":
      if (p.data.status === "completed" || p.data.status === "failed") {
        s.messages.push({
          id: p.data.toolCallId + "-result",
          sender: "tool",
          kind: {
            type: "toolResult",
            title: p.data.title,
            status: p.data.status,
          },
          timestamp: Date.now(),
        });
      }
      break;

    case "usageUpdate":
      s.tokenUsage = {
        costAmount: p.data.costAmount,
        costCurrency: p.data.costCurrency,
        contextSize: p.data.size,
        contextUsed: p.data.used,
      };
      break;

    case "sessionEnd":
      finalizeStreamingText(s);
      s.status = { type: "ended", reason: p.stopReason };
      break;

    case "unknown":
      break;
  }

  return s;
}

function finalizeStreamingText(session: AgentSession): void {
  if (session.streamingText && session.streamingText.length > 0) {
    session.messages.push({
      id: `msg-${_nextMsgId++}`,
      sender: "assistant",
      kind: { type: "text", text: session.streamingText },
      timestamp: Date.now(),
    });
  }
  session.streamingText = null;
}

export function isTerminal(status: SessionStatus): boolean {
  return status.type === "ended" || status.type === "failed";
}
