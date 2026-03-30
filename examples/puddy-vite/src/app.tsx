// Puddy — reactive chat app built on Jam's fact database.

import { h, Fragment } from "@jam/core/jsx";
import { $, set, when, assert } from "@jam/core";
import "./app.css";
import { SessionManager } from "./networking/session-manager";

// --- Session manager (singleton) ---
export const sessionManager = new SessionManager();
if (typeof window !== "undefined") {
  (window as any).sessionManager = sessionManager;
}

// --- Initial state ---
set("connection", "status", "checking");
set("connection", "hostname", sessionManager.hostname);
set("ui", "selectedSession", "");

// Check connection on startup
sessionManager.checkConnection();

// --- Components ---

function ConnectionBar() {
  const matches = when(
    ["connection", "status", $.status],
    ["connection", "hostname", $.host],
  );

  return (
    <Fragment>
      {matches.map(({ status, host }) => {
        const dotColor =
          status === "connected"
            ? "bg-green"
            : status === "checking"
              ? "bg-orange"
              : "bg-red";
        const label =
          status === "connected"
            ? (host as string)
            : status === "checking"
              ? "Connecting..."
              : "Disconnected";
        return (
          <div class="connection-bar hstack gap-8" data-testid="connection-bar">
            <span class={`circle ${dotColor}`} />
            <span class="font-caption">{label}</span>
          </div>
        );
      })}
    </Fragment>
  );
}

function SessionList() {
  const sessions = when(
    ["session", $.sid, "agent", $.agent],
    ["session", $.sid, "status", $.status],
  );
  const connection = when(["connection", "status", $.status]);

  const isConnected =
    connection.length > 0 && connection[0].status === "connected";

  return (
    <div class="sidebar vstack" data-testid="sidebar">
      <div class="sidebar-header">Sessions</div>
      <div class="divider" />

      <div class="vstack gap-4 p-8 scroll-area">
        {sessions.map(({ sid, agent, status }) => {
          const dotColor =
            status === "starting"
              ? "bg-gray"
              : status === "active"
                ? "bg-blue"
                : status === "failed"
                  ? "bg-red"
                  : "bg-secondary";
          return (
            <button
              key={sid as string}
              id={`session-${sid}`}
              class="session-row hstack gap-8"
              onClick={() => set("ui", "selectedSession", sid)}
            >
              <span class={`circle ${dotColor}`} />
              <span class="font-body">{`${agent} — ${sid}`}</span>
              <span class="font-caption fg-secondary">{status as string}</span>
            </button>
          );
        })}
      </div>

      <div class="sidebar-bottom">
        <button
          data-testid="new-session"
          disabled={!isConnected}
          class={!isConnected ? "fg-secondary" : ""}
          onClick={() => {
            try {
              const id = sessionManager.createNewSession();
              set("ui", "selectedSession", id);
            } catch (err: any) {
              console.error(
                "Failed to create session:",
                err.message ?? err,
              );
            }
          }}
        >
          + New Session
        </button>
      </div>
    </div>
  );
}

function ModeBadge() {
  const modes = when(["session", $.sid, "currentMode", $.mode]);

  return (
    <Fragment>
      {modes.map(({ sid, mode }) => (
        <div
          key={`mode-${sid}`}
          class="mode-badge hstack gap-8"
          data-testid="mode-badge"
        >
          <span class="font-caption fg-blue">{`[${mode}]`}</span>
        </div>
      ))}
    </Fragment>
  );
}

function PlanList() {
  const plans = when([
    "plan",
    $.sid,
    $.entryId,
    $.planContent,
    $.planStatus,
    $.planPriority,
  ]);

  if (plans.length === 0) return null;

  return (
    <div class="plan-section vstack gap-4" data-testid="plan-list">
      {plans.map(
        ({ sid, entryId, planContent, planStatus, planPriority }) => {
          const statusIcon =
            planStatus === "completed"
              ? "[done]"
              : planStatus === "in_progress"
                ? "[...]"
                : "[ ]";
          const statusColor =
            planStatus === "completed"
              ? "fg-green"
              : planStatus === "in_progress"
                ? "fg-blue"
                : "fg-secondary";
          return (
            <div
              key={`plan-${sid}-${entryId}`}
              class="plan-entry hstack gap-8"
            >
              <span class={`font-body ${statusColor}`}>{statusIcon}</span>
              <span class="font-body">{planContent as string}</span>
              {planPriority === "high" ? (
                <span class="font-caption fg-red">!</span>
              ) : null}
            </div>
          );
        },
      )}
    </div>
  );
}

function MessageList() {
  const messages = when([
    "message",
    $.selectedId,
    $.msgId,
    $.sender,
    $.kind,
    $.content,
  ]);

  return (
    <div class="message-list vstack gap-4" data-testid="message-list">
      {messages.map(({ msgId, sender, kind, content }) => {
        if (kind === "thought") {
          return (
            <div key={msgId as string} class="message hstack gap-8">
              <span class="fg-secondary">...</span>
              <span class="font-caption fg-secondary">
                {content as string}
              </span>
            </div>
          );
        }

        if (kind === "toolUse") {
          return (
            <div key={msgId as string} class="message hstack gap-8">
              <span class="fg-orange">~</span>
              <span class="font-callout fg-orange">{content as string}</span>
            </div>
          );
        }

        if (kind === "toolResult") {
          const statusColor = content === "completed" ? "fg-green" : "fg-red";
          const statusIcon = content === "completed" ? "+" : "x";
          return (
            <div key={msgId as string} class="message hstack gap-8">
              <span class={statusColor}>{statusIcon}</span>
              <span class={`font-caption ${statusColor}`}>
                {content as string}
              </span>
            </div>
          );
        }

        if (kind === "modeChange") {
          return (
            <div key={msgId as string} class="message hstack gap-8">
              <span class="fg-blue">*</span>
              <span class="font-caption fg-blue">{`Mode: ${content}`}</span>
            </div>
          );
        }

        const icon =
          sender === "user" ? ">" : sender === "assistant" ? "<" : "#";
        const color =
          sender === "user"
            ? "fg-blue"
            : sender === "assistant"
              ? "fg-purple"
              : "fg-orange";

        return (
          <div key={msgId as string} class="message hstack gap-8">
            <span class={color}>{icon}</span>
            <span class="font-body">{content as string}</span>
          </div>
        );
      })}
    </div>
  );
}

function StreamingIndicators() {
  const thinking = when(["session", $.selectedId, "thinking", $.val]);
  const streamingText = when(["session", $.selectedId, "streamingText", $.streaming]);
  const streamingThought = when(["session", $.selectedId, "streamingThought", $.thought]);
  const activeTools = when(["session", $.selectedId, "hasActiveTools", $.hasTools]);

  return (
    <Fragment>
      {thinking.map(
        ({ val }) =>
          val === "true" && (
            <div class="streaming-indicator hstack gap-8" data-testid="thinking">
              <span class="spinner" />
              <span class="font-caption fg-secondary">Thinking...</span>
            </div>
          ),
      )}

      {streamingThought.map(
        ({ thought }) =>
          thought && (
            <div
              class="streaming-indicator hstack gap-8"
              data-testid="streaming-thought"
            >
              <span class="fg-secondary">...</span>
              <span class="font-caption fg-secondary">
                {thought as string}
              </span>
            </div>
          ),
      )}

      {streamingText.map(
        ({ streaming }) =>
          streaming && (
            <div class="streaming-indicator hstack gap-8" data-testid="streaming-text">
              <span class="fg-purple">{"<"}</span>
              <span class="font-body fg-secondary">
                {streaming as string}
              </span>
            </div>
          ),
      )}

      {activeTools.map(
        ({ hasTools }) =>
          hasTools === "true" && (
            <div class="streaming-indicator hstack gap-8" data-testid="active-tools">
              <span class="spinner" />
              <span class="font-caption fg-orange">Tools running...</span>
            </div>
          ),
      )}
    </Fragment>
  );
}

function SessionDetail() {
  const selection = when(["ui", "selectedSession", $.selectedId]);
  const selectedId =
    selection.length > 0 ? (selection[0].selectedId as string) : "";

  return (
    <div class="detail vstack" data-testid="detail">
      <ConnectionBar />
      <div class="divider" />

      <ModeBadge />

      <div id="detail-header" class="detail-header hstack gap-8">
        <span class="font-headline" data-testid="detail-title">
          {selectedId ? `Session: ${selectedId}` : "Select a session"}
        </span>
      </div>

      <PlanList />

      <div class="scroll-area">
        <MessageList />
      </div>

      <StreamingIndicators />

      {selectedId ? [
        <div class="divider" />,
        <div class="input-bar hstack gap-8">
          <input
            type="text"
            placeholder="Type a message..."
            data-testid="message-input"
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                const input = e.target as HTMLInputElement;
                const text = input.value.trim();
                if (text && sessionManager.hasSession(selectedId)) {
                  sessionManager.sendMessage(selectedId, text);
                  input.value = "";
                }
              }
            }}
          />
        </div>,
      ] : null}
    </div>
  );
}

// --- Main App ---

export function App() {
  return (
    <div class="split-view" data-testid="split-view">
      <SessionList />
      <SessionDetail />
    </div>
  );
}
