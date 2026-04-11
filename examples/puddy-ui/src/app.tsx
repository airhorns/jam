// Puddy UI — reactive chat app built on Jam's fact database + @jam/ui design system.

import { h, Fragment } from "@jam/core/jsx";
import { $, set, when, assert } from "@jam/core";
import {
  createJamUI,
  XStack, YStack,
  Text,
  Button,
  Input,
  Separator,
  Spinner,
  styled,
} from "@jam/ui";
import "./app.css";
import { SessionManager } from "./networking/session-manager";

// --- Design system setup ---
createJamUI({
  tokens: {
    size: { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25, "6": 30, "7": 40, "8": 50 },
    space: { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "7": 32, "8": 48 },
    radius: { "1": 3, "2": 6, "3": 8, "4": 10, "5": 12, "6": 16 },
    color: {
      // Dark GitHub palette
      bg: "#0d1117",
      bgSidebar: "#010409",
      bgSurface: "#161b22",
      bgInput: "#0d1117",
      border: "#21262d",
      borderHover: "#484f58",
      text: "#c9d1d9",
      textBright: "#e6edf3",
      textMuted: "#8b949e",
      green: "#3fb950",
      orange: "#d29922",
      red: "#f85149",
      blue: "#58a6ff",
      purple: "#bc8cff",
      gray: "#484f58",
      btnBg: "#21262d",
      btnBorder: "#30363d",
    },
    zIndex: { "1": 10, "2": 50, "3": 100 },
  },
  themes: {
    dark: {
      background: "#0d1117",
      backgroundHover: "#161b22",
      backgroundPress: "#21262d",
      backgroundFocus: "#58a6ff",
      color: "#c9d1d9",
      colorHover: "#e6edf3",
      borderColor: "#21262d",
      borderColorHover: "#484f58",
      borderColorFocus: "#58a6ff",
      placeholderColor: "#484f58",
      outlineColor: "rgba(88,166,255,0.15)",
      shadowColor: "rgba(0,0,0,0.3)",
    },
  },
  defaultTheme: "dark",
  fonts: {
    body: {
      family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      size: { "1": 11, "2": 12, "3": 13, "4": 14, "5": 15, "6": 16 },
    },
    mono: {
      family: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
      size: { "1": 11, "2": 12, "3": 13, "4": 14 },
    },
  },
});

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

// --- Styled primitives ---

const StatusDot = styled("span", {
  name: "StatusDot",
  defaultProps: {
    width: 8,
    height: 8,
    borderRadius: 100000,
    flexShrink: 0,
  },
});

const MonoText = styled("span", {
  name: "MonoText",
  defaultProps: {
    fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.7,
  },
});

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
            ? "$color.green"
            : status === "checking"
              ? "$color.orange"
              : "$color.red";
        const label =
          status === "connected"
            ? (host as string)
            : status === "checking"
              ? "Connecting..."
              : "Disconnected";
        return (
          <XStack
            class="connection-bar"
            gap="$space.2"
            padding="$space.2"
            paddingHorizontal="$space.6"
            backgroundColor="$color.bgSidebar"
            data-testid="connection-bar"
          >
            <StatusDot backgroundColor={dotColor} />
            <Text fontSize={12} color="$color.textMuted">{label}</Text>
          </XStack>
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
    <YStack class="sidebar" width={300} minWidth={300} backgroundColor="$color.bgSidebar" data-testid="sidebar">
      <Text
        padding="$space.4"
        paddingTop="$space.5"
        paddingBottom="$space.3"
        fontWeight="600"
        fontSize={11}
        color="$color.textMuted"
        textTransform="uppercase"
        letterSpacing={1.5}
      >
        Sessions
      </Text>
      <Separator />

      <YStack gap="$space.1" padding="$space.2" class="scroll-area">
        {sessions.map(({ sid, agent, status }) => {
          const dotColor =
            status === "starting"
              ? "$color.gray"
              : status === "active"
                ? "$color.blue"
                : status === "failed"
                  ? "$color.red"
                  : "$color.textMuted";
          return (
            <button
              key={sid as string}
              id={`session-${sid}`}
              class="session-row hstack gap-8"
              onClick={() => set("ui", "selectedSession", sid)}
            >
              <StatusDot backgroundColor={dotColor} />
              <Text fontSize={13} color="$color.textBright" flex={1} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {`${agent} — ${sid}`}
              </Text>
              <Text fontSize={11} color="$color.textMuted" textTransform="uppercase" letterSpacing={0.5} flexShrink={0}>
                {status as string}
              </Text>
            </button>
          );
        })}
      </YStack>

      <XStack padding="$space.4" borderTopWidth={1} borderColor="$color.border" marginTop="auto">
        <Button
          data-testid="new-session"
          disabled={!isConnected}
          width="100%"
          justifyContent="center"
          size="2"
          opacity={!isConnected ? 0.4 : 1}
          onClick={() => {
            try {
              const id = sessionManager.createNewSession();
              set("ui", "selectedSession", id);
            } catch (err: any) {
              console.error("Failed to create session:", err.message ?? err);
            }
          }}
        >
          + New Session
        </Button>
      </XStack>
    </YStack>
  );
}

function ModeBadge() {
  const modes = when(["session", $.sid, "currentMode", $.mode]);

  return (
    <Fragment>
      {modes.map(({ sid, mode }) => (
        <XStack
          key={`mode-${sid}`}
          class="mode-badge"
          gap="$space.2"
          padding="$space.2"
          paddingHorizontal="$space.6"
          data-testid="mode-badge"
        >
          <Text fontSize={12} color="$color.blue">{`[${mode}]`}</Text>
        </XStack>
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
    <YStack gap="$space.1" padding="$space.4" paddingHorizontal="$space.6" backgroundColor="$color.bgSurface" class="plan-section" data-testid="plan-list">
      {plans.map(({ sid, entryId, planContent, planStatus, planPriority }) => {
        const statusIcon =
          planStatus === "completed"
            ? "[done]"
            : planStatus === "in_progress"
              ? "[...]"
              : "[ ]";
        const statusColor =
          planStatus === "completed"
            ? "$color.green"
            : planStatus === "in_progress"
              ? "$color.blue"
              : "$color.textMuted";
        return (
          <XStack key={`plan-${sid}-${entryId}`} gap="$space.3" alignItems="baseline" class="plan-entry">
            <MonoText color={statusColor} fontSize={11} minWidth={44}>{statusIcon}</MonoText>
            <MonoText fontSize={13}>{planContent as string}</MonoText>
            {planPriority === "high" ? (
              <Text fontSize={12} color="$color.red">!</Text>
            ) : null}
          </XStack>
        );
      })}
    </YStack>
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
    <YStack gap="$space.1" padding="$space.5" paddingHorizontal="$space.6" class="message-list" data-testid="message-list">
      {messages.map(({ msgId, sender, kind, content }) => {
        if (kind === "thought") {
          return (
            <XStack key={msgId as string} gap="$space.3" class="message" alignItems="baseline">
              <MonoText color="$color.textMuted" fontWeight="700" minWidth={14} textAlign="center">...</MonoText>
              <MonoText fontSize={12} color="$color.textMuted">{content as string}</MonoText>
            </XStack>
          );
        }

        if (kind === "toolUse") {
          return (
            <XStack key={msgId as string} gap="$space.3" class="message" alignItems="baseline">
              <MonoText color="$color.orange" fontWeight="700" minWidth={14} textAlign="center">~</MonoText>
              <MonoText fontSize={13} color="$color.orange">{content as string}</MonoText>
            </XStack>
          );
        }

        if (kind === "toolResult") {
          const isCompleted = content === "completed";
          const color = isCompleted ? "$color.green" : "$color.red";
          const icon = isCompleted ? "+" : "x";
          return (
            <XStack key={msgId as string} gap="$space.3" class="message" alignItems="baseline">
              <MonoText color={color} fontWeight="700" minWidth={14} textAlign="center">{icon}</MonoText>
              <MonoText fontSize={12} color={color}>{content as string}</MonoText>
            </XStack>
          );
        }

        if (kind === "modeChange") {
          return (
            <XStack key={msgId as string} gap="$space.3" class="message" alignItems="baseline">
              <MonoText color="$color.blue" fontWeight="700" minWidth={14} textAlign="center">*</MonoText>
              <MonoText fontSize={12} color="$color.blue">{`Mode: ${content}`}</MonoText>
            </XStack>
          );
        }

        const icon =
          sender === "user" ? ">" : sender === "assistant" ? "<" : "#";
        const color =
          sender === "user"
            ? "$color.blue"
            : sender === "assistant"
              ? "$color.purple"
              : "$color.orange";

        return (
          <XStack key={msgId as string} gap="$space.3" class="message" alignItems="baseline">
            <MonoText color={color} fontWeight="700" minWidth={14} textAlign="center">{icon}</MonoText>
            <MonoText fontSize={13}>{content as string}</MonoText>
          </XStack>
        );
      })}
    </YStack>
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
            <XStack gap="$space.2" padding="$space.3" paddingHorizontal="$space.6" backgroundColor="$color.bgSurface" borderTopWidth={1} borderColor="$color.border" class="streaming-indicator" data-testid="thinking">
              <Spinner size="1" />
              <Text fontSize={12} color="$color.textMuted">Thinking...</Text>
            </XStack>
          ),
      )}

      {streamingThought.map(
        ({ thought }) =>
          thought && (
            <XStack gap="$space.2" padding="$space.3" paddingHorizontal="$space.6" backgroundColor="$color.bgSurface" borderTopWidth={1} borderColor="$color.border" class="streaming-indicator" data-testid="streaming-thought">
              <MonoText color="$color.textMuted">...</MonoText>
              <MonoText fontSize={12} color="$color.textMuted">{thought as string}</MonoText>
            </XStack>
          ),
      )}

      {streamingText.map(
        ({ streaming }) =>
          streaming && (
            <XStack gap="$space.2" padding="$space.3" paddingHorizontal="$space.6" backgroundColor="$color.bgSurface" borderTopWidth={1} borderColor="$color.border" class="streaming-indicator" data-testid="streaming-text">
              <MonoText color="$color.purple">{"<"}</MonoText>
              <MonoText fontSize={13} color="$color.textMuted">{streaming as string}</MonoText>
            </XStack>
          ),
      )}

      {activeTools.map(
        ({ hasTools }) =>
          hasTools === "true" && (
            <XStack gap="$space.2" padding="$space.3" paddingHorizontal="$space.6" backgroundColor="$color.bgSurface" borderTopWidth={1} borderColor="$color.border" class="streaming-indicator" data-testid="active-tools">
              <Spinner size="1" />
              <Text fontSize={12} color="$color.orange">Tools running...</Text>
            </XStack>
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
    <YStack flex={1} overflow="hidden" backgroundColor="$color.bg" class="detail" data-testid="detail">
      <ConnectionBar />
      <Separator />

      <ModeBadge />

      <XStack
        id="detail-header"
        class="detail-header"
        gap="$space.2"
        padding="$space.4"
        paddingHorizontal="$space.6"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderColor="$color.border"
      >
        <Text fontWeight="600" fontSize={15} color="$color.textBright" data-testid="detail-title">
          {selectedId ? `Session: ${selectedId}` : "Select a session"}
        </Text>
      </XStack>

      <PlanList />

      <YStack flex={1} overflow="auto" class="scroll-area">
        <MessageList />
      </YStack>

      <StreamingIndicators />

      {selectedId ? [
        <Separator />,
        <XStack gap="$space.2" padding="$space.4" paddingHorizontal="$space.6" backgroundColor="$color.bgSidebar" class="input-bar">
          <Input
            size="3"
            flex={1}
            placeholder="Type a message..."
            backgroundColor="$color.bgInput"
            borderColor="$color.btnBorder"
            color="$color.text"
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
        </XStack>,
      ] : null}
    </YStack>
  );
}

// --- Main App ---

export function App() {
  return (
    <XStack height="100vh" class="split-view" data-testid="split-view">
      <SessionList />
      <SessionDetail />
    </XStack>
  );
}
