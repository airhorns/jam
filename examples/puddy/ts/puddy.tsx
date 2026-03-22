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
//   ["connection", "error", "..."],          // optional
// ])
//
// hold("sessions", [
//   ["session", sessionId, "agent", "claude"],
//   ["session", sessionId, "status", "starting" | "active" | "ended" | "failed"],
//   ["session", sessionId, "statusDetail", "..."],  // reason or error
//   ["session", sessionId, "streamingText", "..."],
//   ...
// ])
//
// hold("messages-{sessionId}", [
//   ["message", msgId, "session", sessionId],
//   ["message", msgId, "sender", "user" | "assistant" | "tool"],
//   ["message", msgId, "kind", "text" | "toolUse" | "toolResult"],
//   ["message", msgId, "text", "..."],
//   ["message", msgId, "toolName", "..."],
//   ["message", msgId, "toolStatus", "..."],
// ])
//
// hold("ui", [
//   ["ui", "selectedSession", ""],
// ])
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

        {/* Dynamic session rows - rendered by when rules matching session facts */}
        {when([$.sid, "agent", $.agent], ({ sid, agent }) =>
          when(["session", sid, "status", $.status], ({ status }) =>
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

      {/* Detail: selected session */}
      {when(["ui", "selectedSession", $.selectedId], ({ selectedId }) => {
        if (!selectedId) {
          return <Text key="no-selection" font="title2" foregroundColor="secondary">Select a session</Text>;
        }
        return (
          <VStack key="detail">
            <Text key="detail-title" font="headline">{`Session: ${selectedId}`}</Text>
            <Divider key="detail-div" />
            <ScrollView key="detail-messages">
              <VStack key="msg-list" alignment="leading" spacing={8}>
                {/* Messages would be rendered here via when rules
                    matching message facts for the selected session */}
              </VStack>
            </ScrollView>
          </VStack>
        );
      })}
    </NavigationSplitView>
  </VStack>
);
