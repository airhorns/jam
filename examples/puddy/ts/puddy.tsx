// Puddy — reactive chat app built entirely on Jam's claim system.
//
// All state lives in hold() facts. when() rules derive the UI from facts.
// No imperative object references in the render tree.

import { $, when, hold, render, claim, h } from "./jam";
import {
  VStack, HStack, Text, Button, ScrollView, TextField,
  NavigationSplitView, Divider, Circle, ProgressView,
} from "./components";

// ============================================================================
// State Schema (all facts managed via hold)
//
// hold("connection", [
//   ["connection", "status", "disconnected" | "connected" | "checking"],
//   ["connection", "hostname", "localhost"],
// ])
//
// hold("sessions", [
//   ["session", sessionId, "agent", agentName],
//   ["session", sessionId, "status", "starting" | "active" | "ended" | "failed"],
//   ["session", sessionId, "statusDetail", "..."],
//   ["session", sessionId, "streamingText", "..."],
// ])
//
// hold("messages-{sessionId}", [
//   ["message", sessionId, msgId, sender, kindType, content],
//   // sender: "user" | "assistant" | "tool"
//   // kindType: "text" | "toolUse" | "toolResult"
//   // content: the text, tool name, or status string
// ])
//
// hold("ui", [["ui", "selectedSession", ""]])
// ============================================================================

// --- Initial state ---

hold("connection", [
  ["connection", "status", "disconnected"],
  ["connection", "hostname", "localhost"],
]);

hold("sessions", []);

hold("ui", [
  ["ui", "selectedSession", ""],
]);

// --- Helper: add a message to a session ---
// Each message is a separate hold key so messages accumulate independently.
// hold() is used (not claim()) because callbacks are imperative, not reactive.
let _msgCounter = 0;
function addMessage(
  sessionId: string,
  sender: string,
  kindType: string,
  content: string
) {
  const msgId = `msg-${_msgCounter++}`;
  hold(`msg-${sessionId}-${msgId}`, [
    ["message", sessionId, msgId, sender, kindType, content],
  ]);
}

// --- Render ---

render(
  <VStack key="app">
    {/* Connection status bar */}
    {when(["connection", "status", $.status], ({ status }) =>
      <HStack key="connection-bar" spacing={8} padding={8}>
        <Circle
          key="dot"
          foregroundColor={status === "connected" ? "green" : status === "checking" ? "orange" : "red"}
          frame={8}
        />
        {when(["connection", "hostname", $.host], ({ host }) =>
          <Text key="host" font="caption">{
            status === "connected" ? host : "Disconnected"
          }</Text>
        )}
      </HStack>
    )}

    <NavigationSplitView key="nav">
      {/* Sidebar: session list */}
      <VStack key="sidebar" alignment="leading" spacing={4}>
        <Text key="header" font="headline" padding={8}>Sessions</Text>
        <Divider key="div-top" />

        {/* Dynamic session rows — use $.sid binding in inner when for proper join */}
        {when(["session", $.sid, "agent", $.agent], ({ sid, agent }) =>
          when(["session", $.sid, "status", $.status], ({ status }) =>
            <Button key={`row-${sid}`} label=""
              onPress={() => hold("ui", [["ui", "selectedSession", sid]])}
            >
              <HStack spacing={8}>
                <Circle
                  foregroundColor={
                    status === "starting" ? "gray" :
                    status === "active" ? "blue" :
                    status === "failed" ? "red" : "secondary"
                  }
                  frame={8}
                />
                <Text font="body">{`${agent} — ${sid}`}</Text>
                <Text font="caption" foregroundColor="secondary">{status}</Text>
              </HStack>
            </Button>
          )
        )}

        <Divider key="div-bottom" />
        <Button key="new-session" label="+ New Session"
          onPress={() => {
            const id = "s-" + Date.now();
            hold("sessions", [
              ["session", id, "agent", "claude"],
              ["session", id, "status", "starting"],
            ]);
            hold("ui", [["ui", "selectedSession", id]]);
          }}
        />
      </VStack>

      {/* Detail: selected session — always render, join handles filtering */}
      {when(["ui", "selectedSession", $.selectedId], ({ selectedId }) =>
        <VStack key="detail">
          <Text key="detail-title" font="headline">{
            selectedId ? `Session: ${selectedId}` : "Select a session"
          }</Text>

          {selectedId ? <Divider key="detail-div" /> : null}

          <ScrollView key="detail-messages" padding={12}>
            <VStack key="msg-list" alignment="leading" spacing={8}>
              {/* Render messages — $.selectedId binding for proper join */}
              {when(["message", $.selectedId, $.msgId, $.sender, $.kind, $.content],
                ({ msgId, sender, kind, content }) => {
                  const icon = sender === "user" ? "👤" : sender === "assistant" ? "✨" : "🔧";
                  const color = sender === "user" ? "blue" : sender === "assistant" ? "purple" : "orange";

                  if (kind === "toolUse") {
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor="orange">🔧</Text>
                        <Text font="callout" foregroundColor="orange">{content}</Text>
                      </HStack>
                    );
                  }
                  if (kind === "toolResult") {
                    const statusColor = content === "completed" ? "green" : "red";
                    const statusIcon = content === "completed" ? "✓" : "✗";
                    return (
                      <HStack key={`msg-${msgId}`} spacing={8}>
                        <Text foregroundColor={statusColor}>{statusIcon}</Text>
                        <Text font="caption" foregroundColor={statusColor}>{content}</Text>
                      </HStack>
                    );
                  }
                  return (
                    <HStack key={`msg-${msgId}`} spacing={8}>
                      <Text foregroundColor={color}>{icon}</Text>
                      <Text font="body">{content}</Text>
                    </HStack>
                  );
                }
              )}
            </VStack>
          </ScrollView>

          {/* Streaming text — $.selectedId binding for proper join */}
          {when(["session", $.selectedId, "streamingText", $.streaming], ({ streaming }) =>
            streaming ? (
              <HStack key="streaming" spacing={8} padding={8}>
                <Text foregroundColor="purple">✨</Text>
                <Text font="body" foregroundColor="secondary">{streaming}</Text>
              </HStack>
            ) : null
          )}

          {selectedId ? <Divider key="input-div" /> : null}

          {selectedId ? (
            <HStack key="input-bar" spacing={8} padding={12}>
              <TextField key="input" placeholder="Type a message..."
                onSubmit={(text: string) => {
                  addMessage(selectedId, "user", "text", text);
                }}
                font="body"
              />
            </HStack>
          ) : null}
        </VStack>
      )}
    </NavigationSplitView>
  </VStack>
);
