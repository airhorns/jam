// Puddy — reactive chat app built entirely on Jam's claim system.

import { $, when, hold, claim, render, h } from "./jam";
import {
  VStack,
  HStack,
  Text,
  Button,
  ScrollView,
  TextField,
  NavigationSplitView,
  Divider,
  Circle,
  Spacer,
  ProgressView,
} from "./components";

// --- Session manager ---
// SessionManager is defined in networking/session-manager.ts which is loaded
// before this file in the full app, but not in unit tests.

const sessionManager: any =
  typeof SessionManager !== "undefined" ? new SessionManager() : null;

// --- Initial state ---

hold("connection", () => {
  claim("connection", "status", sessionManager ? "checking" : "disconnected");
  claim("connection", "hostname", sessionManager ? sessionManager.hostname : "localhost");
});

hold("sessions", () => {
  // initially empty
});

hold("ui", () => {
  claim("ui", "selectedSession", "");
});

// Check connection on startup (async — driven by runtime idle())
if (sessionManager) {
  sessionManager.checkConnection();
}

// --- Fallback helpers for when SessionManager is unavailable (tests) ---
let _msgCounter = 0;
function addMessageDirect(
  sessionId: string,
  sender: string,
  kindType: string,
  content: string,
) {
  const msgId = `msg-${_msgCounter++}`;
  hold(`msg-${sessionId}-${msgId}`, () => {
    claim("message", sessionId, msgId, sender, kindType, content);
  });
}

// --- Render ---

render(
  <NavigationSplitView key="app">
    {/* Sidebar: session list */}
    <VStack key="sidebar" alignment="leading" spacing={4}>
      <Text key="header" font="headline" padding={8}>
        Sessions
      </Text>
      <Divider key="div-top" />

      {when(
        ["session", $.sid, "agent", $.agent],
        ["session", $.sid, "status", $.status],
        ({ sid, agent, status }) => (
          <Button
            key={`row-${sid}`}
            label=""
            onPress={() =>
              hold("ui", () => {
                claim("ui", "selectedSession", sid);
              })
            }
          >
            <HStack key={`row-inner-${sid}`} spacing={8}>
              <Circle
                key="dot"
                foregroundColor={
                  status === "starting"
                    ? "gray"
                    : status === "active"
                      ? "blue"
                      : status === "failed"
                        ? "red"
                        : "secondary"
                }
                frame={8}
              />
              <Text key="agent" font="body">{`${agent} — ${sid}`}</Text>
              <Text key="status" font="caption" foregroundColor="secondary">
                {status}
              </Text>
            </HStack>
          </Button>
        ),
      )}

      <Divider key="div-bottom" />
      {when(["connection", "status", $.status], ({ status }) =>
        status === "connected" ? (
          <Button
            key="new-session"
            label="+ New Session"
            onPress={() => {
              let id: string;
              if (sessionManager) {
                id = sessionManager.createNewSession();
              } else {
                id = "s-" + Date.now();
                hold(`session-${id}`, () => {
                  claim("session", id, "agent", "claude");
                  claim("session", id, "status", "starting");
                });
              }
              hold("ui", () => {
                claim("ui", "selectedSession", id);
              });
            }}
          />
        ) : (
          <Button
            key="new-session"
            label="+ New Session"
            disabled={true}
            foregroundColor="secondary"
          />
        ),
      )}
    </VStack>

    {/* Detail: selected session */}
    <VStack key="detail">
      {/* Connection status bar */}
      {when(
        ["connection", "status", $.status],
        ["connection", "hostname", $.host],
        ({ status, host }) => (
          <HStack key="connection-bar" spacing={8} padding={8}>
            <Circle
              key="dot"
              foregroundColor={
                status === "connected"
                  ? "green"
                  : status === "checking"
                    ? "orange"
                    : "red"
              }
              frame={8}
            />
            <Text key="host" font="caption">
              {status === "connected"
                ? host
                : status === "checking"
                  ? "Connecting..."
                  : "Disconnected"}
            </Text>
            <Spacer key="bar-spacer" />
          </HStack>
        ),
      )}

      <Divider key="top-div" />

      {when(["ui", "selectedSession", $.selectedId], ({ selectedId }) => (
        <VStack key="content">
          <Text key="detail-title" font="headline" padding={12}>
            {selectedId ? `Session: ${selectedId}` : "Select a session"}
          </Text>

          <Divider key="detail-div" />

          <ScrollView key="detail-messages" padding={12}>
            <VStack key="msg-list" alignment="leading" spacing={8}>
              {when(
                [
                  "message",
                  $.selectedId,
                  $.msgId,
                  $.sender,
                  $.kind,
                  $.content,
                ],
                ({ msgId, sender, kind, content }) => {
                  const icon =
                    sender === "user"
                      ? "👤"
                      : sender === "assistant"
                        ? "✨"
                        : "🔧";
                  const color =
                    sender === "user"
                      ? "blue"
                      : sender === "assistant"
                        ? "purple"
                        : "orange";

                  if (kind === "toolUse") {
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor="orange">🔧</Text>
                        <Text font="callout" foregroundColor="orange">
                          {content}
                        </Text>
                      </HStack>
                    );
                  }
                  if (kind === "toolResult") {
                    const statusColor =
                      content === "completed" ? "green" : "red";
                    const statusIcon =
                      content === "completed" ? "✓" : "✗";
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor={statusColor}>
                          {statusIcon}
                        </Text>
                        <Text font="caption" foregroundColor={statusColor}>
                          {content}
                        </Text>
                      </HStack>
                    );
                  }
                  return (
                    <HStack key={`msg-${msgId}`} spacing={8}>
                      <Text foregroundColor={color}>{icon}</Text>
                      <Text font="body">{content}</Text>
                    </HStack>
                  );
                },
              )}
            </VStack>
          </ScrollView>

          {when(
            ["session", $.selectedId, "streamingText", $.streaming],
            ({ streaming }) =>
              streaming ? (
                <HStack key="streaming" spacing={8} padding={8}>
                  <Text foregroundColor="purple">✨</Text>
                  <Text font="body" foregroundColor="secondary">
                    {streaming}
                  </Text>
                </HStack>
              ) : null,
          )}

          {selectedId ? <Divider key="input-div" /> : null}

          {selectedId ? (
            <HStack key="input-bar" spacing={8} padding={12}>
              <TextField
                key="input"
                placeholder="Type a message..."
                onSubmit={(text: string) => {
                  if (
                    sessionManager &&
                    sessionManager.sessions.has(selectedId)
                  ) {
                    sessionManager.sendMessage(selectedId, text);
                  } else {
                    addMessageDirect(selectedId, "user", "text", text);
                  }
                }}
                font="body"
              />
            </HStack>
          ) : null}

        </VStack>
      ))}
    </VStack>
  </NavigationSplitView>,
);
