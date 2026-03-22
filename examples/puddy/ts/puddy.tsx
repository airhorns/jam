import { $, when, hold, render, h } from "./jam";
import { VStack, HStack, Text, NavigationSplitView, Divider } from "./components";
import type { AgentSession } from "./models/session";
import { createSession, applyEvent, isTerminal } from "./models/session";
import { SessionManager } from "./networking/session-manager";
import { SessionListView } from "./components/SessionList";
import { SessionDetailView, NoSessionSelected } from "./components/SessionDetail";
import { ConnectionStatusBar } from "./components/ConnectionStatus";

// --- App State ---

interface AppState {
  manager: SessionManager;
  selectedSessionId: string | null;
}

const manager = new SessionManager();

hold("app-state", [
  ["app", "selectedSessionId", ""],
  ["app", "isConnected", false],
]);

// --- Initial connection check ---
manager.checkConnection().then(() => {
  hold("app-state", [
    ["app", "isConnected", manager.isConnected],
  ]);
});

// --- Actions ---

function handleSelectSession(id: string) {
  hold("app-state", [
    ["app", "selectedSessionId", id],
    ["app", "isConnected", manager.isConnected],
  ]);
}

async function handleNewSession(prompt: string) {
  try {
    const session = await manager.createSession(undefined, undefined, prompt);
    handleSelectSession(session.id);
  } catch (err: any) {
    console.error("Failed to create session:", err.message ?? err);
  }
}

async function handleSendMessage(sessionId: string, text: string) {
  try {
    await manager.sendMessage(sessionId, text);
  } catch (err: any) {
    console.error("Failed to send message:", err.message ?? err);
  }
}

async function handleDestroySession(sessionId: string) {
  await manager.destroySession(sessionId);
  hold("app-state", [
    ["app", "selectedSessionId", ""],
    ["app", "isConnected", manager.isConnected],
  ]);
}

function handleRetryConnection() {
  manager.checkConnection().then(() => {
    hold("app-state", [
      ["app", "isConnected", manager.isConnected],
    ]);
  });
}

// --- Render ---

render(
  <VStack key="app">
    <ConnectionStatusBar
      key="status"
      isConnected={manager.isConnected}
      hostname={manager.hostname}
      pingMs={manager.pingMs}
      error={manager.connectionError}
      onRetry={handleRetryConnection}
    />
    <NavigationSplitView key="nav">
      <SessionListView
        key="sidebar"
        sessions={manager.sessions}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />
      <NoSessionSelected key="detail-placeholder" />
    </NavigationSplitView>
  </VStack>
);
