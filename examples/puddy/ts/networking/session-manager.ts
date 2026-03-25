// SessionManager — orchestrates agent sessions using assert/retract for state.
// All session state lives in the fact database. Only streaming accumulators
// (which need incremental appending) live in JS.

import { hold, claim, assert, retract } from "@jam/types";
import { type AgentEvent } from "../models/events";
import { isTerminalStatus } from "../models/session";
import { SandboxAgentClient, SandboxAgentError, type AgentInfo } from "./client";

let _nextMsgId = 0;
let _nextUserMsgId = 0;

export class SessionManager {
  private client: SandboxAgentClient;

  // Minimal JS-only state: streaming accumulators (can't incrementally append to a fact)
  private streamingText: Map<string, string> = new Map();
  private streamingThought: Map<string, string> = new Map();
  // Track session IDs and their current status for retract-before-assert pattern
  private sessionStatuses: Map<string, string> = new Map();
  // Track old plan entry counts so we can retract them
  private planEntryCounts: Map<string, number> = new Map();

  isConnected = false;
  connectionError?: string;
  pingMs?: number;
  agents: AgentInfo[] = [];

  constructor(client?: SandboxAgentClient) {
    this.client = client ?? new SandboxAgentClient();
  }

  get hostname(): string {
    return this.client.hostname;
  }

  get hasReadyAgent(): boolean {
    return this.agents.some((a) => a.installed && a.credentialsAvailable);
  }

  get preferredAgent(): AgentInfo | undefined {
    return this.agents.find((a) => a.installed && a.credentialsAvailable);
  }

  hasSession(id: string): boolean {
    return this.sessionStatuses.has(id);
  }

  get agentReadinessError(): string | undefined {
    if (!this.isConnected) return undefined;
    if (this.agents.length === 0) return "No agents found on server";
    const installed = this.agents.filter((a) => a.installed);
    if (installed.length === 0)
      return "No agents installed — run the sandbox-agent install command";
    const withCreds = installed.filter((a) => a.credentialsAvailable);
    if (withCreds.length === 0) {
      const names = installed.map((a) => a.id).join(", ");
      return `Agents installed (${names}) but no API credentials configured`;
    }
    return undefined;
  }

  // --- Connection ---

  async checkConnection(): Promise<void> {
    const start = Date.now();
    try {
      this.isConnected = await this.client.checkHealth();
      this.pingMs = Date.now() - start;
      this.connectionError = undefined;
      this.agents = await this.client.listAgents();
    } catch (err: any) {
      this.isConnected = false;
      this.pingMs = undefined;
      this.agents = [];
      this.connectionError = err.message ?? String(err);
    }
    this.syncConnectionState();
  }

  // --- Session Lifecycle ---

  createNewSession(initialPrompt?: string): string {
    const agent = this.preferredAgent?.id;
    if (!agent) throw SandboxAgentError.noReadyAgent();

    const sessionId = "s-" + Date.now();

    // Assert session facts directly into the database
    assert("session", sessionId, "agent", agent);
    assert("session", sessionId, "status", "starting");
    this.sessionStatuses.set(sessionId, "starting");

    // Async: connect to backend
    this.connectSession(sessionId, agent, initialPrompt);

    return sessionId;
  }

  private async connectSession(sessionId: string, agent: string, initialPrompt?: string): Promise<void> {
    try {
      await this.client.createSession(sessionId, agent);

      this.setStatus(sessionId, "active");

      if (initialPrompt) {
        this.sendMessage(sessionId, initialPrompt);
      }
    } catch (err: any) {
      this.setStatus(sessionId, "failed");
      assert("session", sessionId, "statusDetail", err.message ?? String(err));
    }
  }

  sendMessage(sessionId: string, message: string): void {
    // Add user message
    const msgId = `umsg-${_nextUserMsgId++}`;
    assert("message", sessionId, msgId, "user", "text", message);

    // Send prompt with SSE event capture — events arrive incrementally
    this.client.sendPromptWithEvents(
      sessionId,
      message,
      (event) => this.handleEvent(sessionId, event),
      () => {
        // POST completed — nothing to do, events already applied
      },
      (err) => {
        console.error("sendMessage error:", err.message ?? err);
        this.clearStreaming(sessionId);
      },
    );
  }

  private handleEvent(sessionId: string, event: AgentEvent): void {
    const p = event.payload;

    switch (p.type) {
      case "agentMessageChunk": {
        this.ensureActive(sessionId);
        const oldText = this.streamingText.get(sessionId);
        const newText = (oldText ?? "") + p.text;
        if (oldText) retract("session", sessionId, "streamingText", oldText);
        assert("session", sessionId, "streamingText", newText);
        this.streamingText.set(sessionId, newText);
        break;
      }

      case "agentThoughtChunk": {
        this.ensureActive(sessionId);
        const oldThought = this.streamingThought.get(sessionId);
        const newThought = (oldThought ?? "") + p.text;
        if (oldThought) retract("session", sessionId, "streamingThought", oldThought);
        assert("session", sessionId, "streamingThought", newThought);
        this.streamingThought.set(sessionId, newThought);
        break;
      }

      case "toolCall":
        this.finalizeStreaming(sessionId);
        assert("message", sessionId, p.data.toolCallId, "assistant", "toolUse", p.data.title);
        assert("message", sessionId, p.data.toolCallId, "toolStatus", p.data.status ?? "pending");
        assert("session", sessionId, "hasActiveTools", "true");
        break;

      case "toolCallUpdate": {
        const status = p.data.status ?? "in_progress";
        // Update tool status
        retract("message", sessionId, p.data.toolCallId, "toolStatus", p.data.status ?? "pending");
        assert("message", sessionId, p.data.toolCallId, "toolStatus", status);
        // Add result message for completed/failed
        if (status === "completed" || status === "failed") {
          assert("message", sessionId, p.data.toolCallId + "-result", "tool", "toolResult", status);
        }
        break;
      }

      case "usageUpdate":
        // Usage is transient — use hold so it auto-replaces
        hold(`usage-${sessionId}`, () => {
          if (p.data.costAmount != null) {
            claim("session", sessionId, "costAmount", p.data.costAmount);
            claim("session", sessionId, "costCurrency", p.data.costCurrency ?? "USD");
          }
          claim("session", sessionId, "contextSize", p.data.size);
          claim("session", sessionId, "contextUsed", p.data.used);
        });
        break;

      case "plan": {
        this.ensureActive(sessionId);
        // Retract old plan entries
        const oldCount = this.planEntryCounts.get(sessionId) ?? 0;
        for (let i = 0; i < oldCount; i++) {
          // We can't retract individual entries easily without knowing their content,
          // so use hold() for the plan which auto-retracts the previous set.
        }
        // Use hold for plan entries — they get replaced as a whole each time
        hold(`plan-${sessionId}`, () => {
          for (let i = 0; i < p.data.entries.length; i++) {
            const entry = p.data.entries[i];
            claim("plan", sessionId, `entry-${i}`, entry.content, entry.status, entry.priority);
          }
          claim("plan", sessionId, "count", String(p.data.entries.length));
        });
        this.planEntryCounts.set(sessionId, p.data.entries.length);
        break;
      }

      case "currentModeUpdate":
        assert("session", sessionId, "currentMode", p.modeId);
        // Add mode change message
        const modeId = `mode-${_nextMsgId++}`;
        assert("message", sessionId, modeId, "system", "modeChange", p.modeId);
        break;

      case "availableCommandsUpdate":
        // Use hold for commands — they get replaced as a whole
        hold(`commands-${sessionId}`, () => {
          for (const cmd of p.commands) {
            claim("command", sessionId, cmd.name, cmd.description);
          }
        });
        break;

      case "sessionInfoUpdate":
        if (p.title) {
          assert("session", sessionId, "title", p.title);
        }
        break;

      case "sessionEnd":
        this.finalizeStreaming(sessionId);
        this.setStatus(sessionId, "ended");
        assert("session", sessionId, "statusDetail", p.stopReason);
        // Clear active tools indicator
        retract("session", sessionId, "hasActiveTools", "true");
        break;

      case "unknown":
        break;
    }
  }

  async destroySession(id: string): Promise<void> {
    // Clean up JS-side state
    this.streamingText.delete(id);
    this.streamingThought.delete(id);
    this.sessionStatuses.delete(id);
    this.planEntryCounts.delete(id);

    // Clean up holds
    hold(`plan-${id}`, () => {});
    hold(`commands-${id}`, () => {});
    hold(`usage-${id}`, () => {});

    // Note: assert()ed facts for this session remain in the DB.
    // The UI just won't display them if the session is removed from the sidebar.
    // A full cleanup would require tracking all asserted facts per session.

    try {
      await this.client.destroySession(id);
    } catch {
      // best effort
    }
  }

  // --- Helpers ---

  private setStatus(sessionId: string, status: string): void {
    const old = this.sessionStatuses.get(sessionId);
    if (old) retract("session", sessionId, "status", old);
    assert("session", sessionId, "status", status);
    this.sessionStatuses.set(sessionId, status);
  }

  private ensureActive(sessionId: string): void {
    if (this.sessionStatuses.get(sessionId) === "starting") {
      this.setStatus(sessionId, "active");
    }
  }

  private finalizeStreaming(sessionId: string): void {
    // Finalize streaming text into a message
    const text = this.streamingText.get(sessionId);
    if (text) {
      retract("session", sessionId, "streamingText", text);
      assert("message", sessionId, `msg-${_nextMsgId++}`, "assistant", "text", text);
      this.streamingText.delete(sessionId);
    }

    // Finalize streaming thought into a message
    const thought = this.streamingThought.get(sessionId);
    if (thought) {
      retract("session", sessionId, "streamingThought", thought);
      assert("message", sessionId, `thought-${_nextMsgId++}`, "assistant", "thought", thought);
      this.streamingThought.delete(sessionId);
    }
  }

  private clearStreaming(sessionId: string): void {
    const text = this.streamingText.get(sessionId);
    if (text) {
      retract("session", sessionId, "streamingText", text);
      this.streamingText.delete(sessionId);
    }
    const thought = this.streamingThought.get(sessionId);
    if (thought) {
      retract("session", sessionId, "streamingThought", thought);
      this.streamingThought.delete(sessionId);
    }
  }

  // --- Connection State (uses hold since it's a single mutable value that replaces itself) ---

  private syncConnectionState(): void {
    hold("connection", () => {
      claim("connection", "status", this.isConnected ? "connected" : "disconnected");
      claim("connection", "hostname", this.hostname);
      if (this.connectionError) {
        claim("connection", "error", this.connectionError);
      }
    });
  }

  disconnectAll(): void {}
}
