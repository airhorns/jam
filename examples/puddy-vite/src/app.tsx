// Puddy — reactive chat app built on Jam's fact database.
// Port of the original puddy.tsx, using Preact + useWhen() for reactivity.

import "./app.css";
import { $, hold, claim, useWhen, or } from "./jam";
import { SessionManager } from "./networking/session-manager";

// --- Session manager (singleton) ---
const sessionManager = new SessionManager();
// Expose for e2e tests
if (typeof window !== "undefined") {
  (window as any).sessionManager = sessionManager;
}

// --- Initial state ---
hold("connection", () => {
  claim("connection", "status", "checking");
  claim("connection", "hostname", sessionManager.hostname);
});

hold("ui", () => {
  claim("ui", "selectedSession", "");
});

// Check connection on startup
sessionManager.checkConnection();

// --- Components ---

function ConnectionBar() {
  const matches = useWhen(
    ["connection", "status", $.status],
    ["connection", "hostname", $.host],
  );

  return (
    <>
      {matches.value.map(({ status, host }) => {
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
    </>
  );
}

function SessionList() {
  const sessions = useWhen(
    ["session", $.sid, "agent", $.agent],
    ["session", $.sid, "status", $.status],
  );
  const connection = useWhen(["connection", "status", $.status]);

  const isConnected =
    connection.value.length > 0 && connection.value[0].status === "connected";

  return (
    <div class="sidebar vstack" data-testid="sidebar">
      <div class="sidebar-header">Sessions</div>
      <div class="divider" />

      <div class="vstack gap-4 p-8 scroll-area">
        {sessions.value.map(({ sid, agent, status }) => {
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
              class="session-row hstack gap-8"
              onClick={() =>
                hold("ui", () => {
                  claim("ui", "selectedSession", sid);
                })
              }
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
              hold("ui", () => {
                claim("ui", "selectedSession", id);
              });
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
  const modes = useWhen(["session", $.sid, "currentMode", $.mode]);

  return (
    <>
      {modes.value.map(({ sid, mode }) => (
        <div
          key={`mode-${sid}`}
          class="mode-badge hstack gap-8"
          data-testid="mode-badge"
        >
          <span class="font-caption fg-blue">{`[${mode}]`}</span>
        </div>
      ))}
    </>
  );
}

function PlanList() {
  const plans = useWhen([
    "plan",
    $.sid,
    $.entryId,
    $.planContent,
    $.planStatus,
    $.planPriority,
  ]);

  if (plans.value.length === 0) return null;

  return (
    <div class="plan-section vstack gap-4" data-testid="plan-list">
      {plans.value.map(
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
  const messages = useWhen([
    "message",
    $.selectedId,
    $.msgId,
    $.sender,
    $.kind,
    $.content,
  ]);

  return (
    <div class="message-list vstack gap-4" data-testid="message-list">
      {messages.value.map(({ msgId, sender, kind, content }) => {
        // Thought messages
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

        // Tool use
        if (kind === "toolUse") {
          return (
            <div key={msgId as string} class="message hstack gap-8">
              <span class="fg-orange">~</span>
              <span class="font-callout fg-orange">{content as string}</span>
            </div>
          );
        }

        // Tool result
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

        // Mode change
        if (kind === "modeChange") {
          return (
            <div key={msgId as string} class="message hstack gap-8">
              <span class="fg-blue">*</span>
              <span class="font-caption fg-blue">{`Mode: ${content}`}</span>
            </div>
          );
        }

        // Text messages (user + assistant)
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
  const thinking = useWhen([
    "session",
    $.selectedId,
    "thinking",
    $.val,
  ]);
  const streamingText = useWhen([
    "session",
    $.selectedId,
    "streamingText",
    $.streaming,
  ]);
  const streamingThought = useWhen([
    "session",
    $.selectedId,
    "streamingThought",
    $.thought,
  ]);
  const activeTools = useWhen([
    "session",
    $.selectedId,
    "hasActiveTools",
    $.hasTools,
  ]);

  return (
    <>
      {thinking.value.map(
        ({ val }) =>
          val === "true" && (
            <div class="streaming-indicator hstack gap-8" data-testid="thinking">
              <span class="spinner" />
              <span class="font-caption fg-secondary">Thinking...</span>
            </div>
          ),
      )}

      {streamingThought.value.map(
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

      {streamingText.value.map(
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

      {activeTools.value.map(
        ({ hasTools }) =>
          hasTools === "true" && (
            <div class="streaming-indicator hstack gap-8" data-testid="active-tools">
              <span class="spinner" />
              <span class="font-caption fg-orange">Tools running...</span>
            </div>
          ),
      )}
    </>
  );
}

function SessionDetail() {
  const selection = useWhen(["ui", "selectedSession", $.selectedId]);
  const selectedId =
    selection.value.length > 0 ? (selection.value[0].selectedId as string) : "";

  return (
    <div class="detail vstack" data-testid="detail">
      <ConnectionBar />
      <div class="divider" />

      <ModeBadge />

      {/* Header */}
      <div class="detail-header hstack gap-8">
        <span class="font-headline" data-testid="detail-title">
          {selectedId ? `Session: ${selectedId}` : "Select a session"}
        </span>
      </div>

      <PlanList />

      {/* Messages */}
      <div class="scroll-area">
        <MessageList />
      </div>

      <StreamingIndicators />

      {/* Input bar */}
      {selectedId && (
        <>
          <div class="divider" />
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
          </div>
        </>
      )}
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
