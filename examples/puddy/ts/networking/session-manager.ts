// SessionManager — orchestrates agent sessions using hold() for reactive state.
// All state mutations go through hold(), which triggers when() rules to re-render.

import { type AgentEvent } from "../models/events";
import { type AgentSession, applyEvent, createSession } from "../models/session";
import { SandboxAgentClient, SandboxAgentError, type AgentInfo } from "./client";

// These are available as globals from the Jam runtime
declare function hold(keyOrFn: string | (() => void), maybeFn?: () => void): void;
declare function claim(...terms: any[]): void;

let _nextUserMsgId = 0;

export class SessionManager {
  private client: SandboxAgentClient;
  sessions: Map<string, AgentSession> = new Map();

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
    const session = createSession(sessionId, agent);
    this.sessions.set(sessionId, session);
    this.syncSessionState(sessionId);

    // Async: connect to backend (runs during drain_async)
    this.connectSession(sessionId, agent, initialPrompt);

    return sessionId;
  }

  private async connectSession(sessionId: string, agent: string, initialPrompt?: string): Promise<void> {
    try {
      await this.client.createSession(sessionId, agent);

      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = { type: "active" };
        this.syncSessionState(sessionId);
      }

      if (initialPrompt) {
        this.sendMessage(sessionId, initialPrompt);
      }
    } catch (err: any) {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = { type: "failed", error: err.message ?? String(err) };
        this.syncSessionState(sessionId);
      }
    }
  }

  sendMessage(sessionId: string, message: string): void {
    this.addUserMessage(sessionId, message);

    // Mark session as waiting for response
    const session = this.sessions.get(sessionId);
    if (session) {
      session.streamingText = "Thinking...";
      this.syncSessionState(sessionId);
    }

    // Send prompt with SSE event capture.
    // The callback fires (during drain_async) when the agent responds.
    this.client.sendPromptWithEvents(
      sessionId,
      message,
      (events) => this.applyEvents(sessionId, events),
      (err) => {
        console.error("sendMessage error:", err.message ?? err);
        const s = this.sessions.get(sessionId);
        if (s) {
          s.streamingText = undefined;
          this.syncSessionState(sessionId);
        }
      },
    );
  }

  private applyEvents(sessionId: string, events: AgentEvent[]): void {
    let session = this.sessions.get(sessionId);
    if (!session) return;

    session.streamingText = undefined;

    for (const event of events) {
      if (event.eventIndex <= session.lastEventIndex) continue;
      session = applyEvent(session, event);
      this.sessions.set(sessionId, session);
    }
    this.syncSessionState(sessionId);
  }

  async destroySession(id: string): Promise<void> {
    this.sessions.delete(id);
    hold(`session-${id}`, () => {});
    hold(`session-${id}-msgs`, () => {});

    try {
      await this.client.destroySession(id);
    } catch {
      // best effort
    }
  }

  // --- Reactive State Sync ---

  private syncConnectionState(): void {
    hold("connection", () => {
      claim("connection", "status", this.isConnected ? "connected" : "disconnected");
      claim("connection", "hostname", this.hostname);
      if (this.connectionError) {
        claim("connection", "error", this.connectionError);
      }
    });
  }

  private syncSessionState(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    hold(`session-${sessionId}`, () => {
      claim("session", sessionId, "agent", session.agent);
      claim("session", sessionId, "status", session.status.type);

      if (session.status.type === "ended") {
        claim("session", sessionId, "statusDetail", (session.status as any).reason);
      } else if (session.status.type === "failed") {
        claim("session", sessionId, "statusDetail", (session.status as any).error);
      }

      if (session.streamingText) {
        claim("session", sessionId, "streamingText", session.streamingText);
      }
    });

    hold(`session-${sessionId}-msgs`, () => {
      for (const msg of session.messages) {
        const content =
          msg.kind.type === "text" ? msg.kind.text :
          msg.kind.type === "toolUse" ? msg.kind.name :
          msg.kind.type === "toolResult" ? msg.kind.status :
          "";
        claim("message", sessionId, msg.id, msg.sender, msg.kind.type, content);
      }
    });
  }

  private addUserMessage(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const msgId = `umsg-${_nextUserMsgId++}`;
    session.messages.push({
      id: msgId,
      sender: "user",
      kind: { type: "text", text },
      timestamp: Date.now(),
    });
    this.sessions.set(sessionId, session);
    this.syncSessionState(sessionId);
  }

  disconnectAll(): void {}
}
