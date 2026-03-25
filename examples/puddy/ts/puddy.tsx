// Puddy — reactive chat app built entirely on Jam's claim system.

import { $, when, hold, claim, render, h } from "@jam/types";
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
} from "@jam/types";
import { SessionManager } from "./networking/session-manager";

// --- Session manager ---
const sessionManager = new SessionManager();
// Expose on globalThis so eval_js test scripts can interact with it
(globalThis as any).sessionManager = sessionManager;

// --- Initial state ---

hold("connection", () => {
  claim("connection", "status", "checking");
  claim("connection", "hostname", sessionManager.hostname);
});

hold("ui", () => {
  claim("ui", "selectedSession", "");
});

// Check connection on startup (async — driven by runtime idle())
sessionManager.checkConnection();

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
              try {
                const id = sessionManager.createNewSession();
                hold("ui", () => {
                  claim("ui", "selectedSession", id);
                });
              } catch (err: any) {
                console.error("Failed to create session:", err.message ?? err);
              }
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

      {/* Mode badge — top-level when */}
      {when(
        ["session", $.sid, "currentMode", $.mode],
        ({ sid, mode }) => (
          <HStack key={`mode-badge-${sid}`} spacing={8} padding={4}>
            <Text font="caption" foregroundColor="blue">
              {`[${mode}]`}
            </Text>
          </HStack>
        ),
      )}

      {when(["ui", "selectedSession", $.selectedId], ({ selectedId }) => (
        <VStack key="content">
          {/* Header */}
          <HStack key="detail-header" spacing={8} padding={12}>
            <Text key="detail-title" font="headline">
              {selectedId ? `Session: ${selectedId}` : "Select a session"}
            </Text>
          </HStack>

          <Divider key="detail-div" />

          {/* Plan / Todo list entries */}
          {when(
            ["plan", $.sid, $.entryId, $.planContent, $.planStatus, $.planPriority],
            ({ sid, entryId, planContent, planStatus, planPriority }) => {
              const statusIcon =
                planStatus === "completed" ? "[done]" :
                planStatus === "in_progress" ? "[...]" :
                "[ ]";
              const statusColor =
                planStatus === "completed" ? "green" :
                planStatus === "in_progress" ? "blue" :
                "secondary";
              return (
                <HStack key={`plan-${sid}-${entryId}`} spacing={8}>
                  <Text font="body" foregroundColor={statusColor}>{statusIcon}</Text>
                  <Text font="body">{planContent}</Text>
                  {planPriority === "high" ? (
                    <Text key="priority" font="caption" foregroundColor="red">!</Text>
                  ) : null}
                </HStack>
              );
            },
          )}

          {/* Messages */}
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
                  // Thought messages — dimmed
                  if (kind === "thought") {
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor="secondary">...</Text>
                        <Text font="caption" foregroundColor="secondary">{content}</Text>
                      </HStack>
                    );
                  }

                  // Tool use — show name
                  if (kind === "toolUse") {
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor="orange">~</Text>
                        <Text font="callout" foregroundColor="orange">
                          {content}
                        </Text>
                      </HStack>
                    );
                  }

                  // Tool result
                  if (kind === "toolResult") {
                    const statusColor =
                      content === "completed" ? "green" : "red";
                    const statusIcon =
                      content === "completed" ? "+" : "x";
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

                  // Mode change — system message
                  if (kind === "modeChange") {
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor="blue">*</Text>
                        <Text font="caption" foregroundColor="blue">
                          {`Mode: ${content}`}
                        </Text>
                      </HStack>
                    );
                  }

                  // Text messages (user + assistant)
                  const icon =
                    sender === "user"
                      ? ">"
                      : sender === "assistant"
                        ? "<"
                        : "#";
                  const color =
                    sender === "user"
                      ? "blue"
                      : sender === "assistant"
                        ? "purple"
                        : "orange";

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

          {/* Streaming thought indicator */}
          {when(
            ["session", $.selectedId, "streamingThought", $.thought],
            ({ thought }) =>
              thought ? (
                <HStack key="streaming-thought" spacing={8} padding={8}>
                  <Text foregroundColor="secondary">...</Text>
                  <Text font="caption" foregroundColor="secondary">
                    {thought}
                  </Text>
                </HStack>
              ) : null,
          )}

          {/* Streaming text indicator */}
          {when(
            ["session", $.selectedId, "streamingText", $.streaming],
            ({ streaming }) =>
              streaming ? (
                <HStack key="streaming" spacing={8} padding={8}>
                  <Text foregroundColor="purple">{"<"}</Text>
                  <Text font="body" foregroundColor="secondary">
                    {streaming}
                  </Text>
                </HStack>
              ) : null,
          )}

          {/* Active tools indicator */}
          {when(
            ["session", $.selectedId, "hasActiveTools", $.hasTools],
            ({ hasTools }) =>
              hasTools === "true" ? (
                <HStack key="active-tools" spacing={8} padding={8}>
                  <ProgressView key="tools-spinner" />
                  <Text key="tools-label" font="caption" foregroundColor="orange">
                    Tools running...
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
                  if (sessionManager.hasSession(selectedId)) {
                    sessionManager.sendMessage(selectedId, text);
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
