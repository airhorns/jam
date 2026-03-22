// SessionManager — orchestrates agent sessions and their lifecycle.
// Ports the Swift SessionManager to TypeScript.

import { type AgentEvent } from "../models/events";
import {
  type AgentSession,
  type ConversationItem,
  createSession,
  applyEvent,
  isTerminal,
} from "../models/session";
import { SandboxAgentClient, SandboxAgentError, type AgentInfo } from "./client";

let _nextUserMsgId = 0;

export class SessionManager {
  private client: SandboxAgentClient;
  private eventStreamAbortFns = new Map<string, () => void>();

  sessions: AgentSession[] = [];
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

  get activeSessions(): AgentSession[] {
    return this.sessions.filter((s) => !isTerminal(s.status));
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
  }

  // --- Session Lifecycle ---

  async createSession(
    id?: string,
    agent?: string,
    initialPrompt?: string
  ): Promise<AgentSession> {
    const resolvedAgent = agent ?? this.preferredAgent?.id;
    if (!resolvedAgent) {
      throw SandboxAgentError.noReadyAgent();
    }

    const sessionId = id ?? `session-${Date.now()}`;
    const session = createSession(sessionId, resolvedAgent);
    this.sessions.push(session);

    try {
      await this.client.createSession(sessionId, resolvedAgent);
      this.startEventStream(session);

      if (initialPrompt) {
        const userMsg: ConversationItem = {
          id: `umsg-${_nextUserMsgId++}`,
          sender: "user",
          kind: { type: "text", text: initialPrompt },
          timestamp: Date.now(),
        };
        this.updateSession(sessionId, (s) => ({
          ...s,
          messages: [...s.messages, userMsg],
        }));

        await this.client.sendPrompt(sessionId, initialPrompt);
      }
    } catch (err: any) {
      this.updateSession(sessionId, (s) => ({
        ...s,
        status: { type: "failed", error: err.message ?? String(err) },
      }));
      throw err;
    }

    return this.getSession(sessionId)!;
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const userMsg: ConversationItem = {
      id: `umsg-${_nextUserMsgId++}`,
      sender: "user",
      kind: { type: "text", text: message },
      timestamp: Date.now(),
    };
    this.updateSession(sessionId, (s) => ({
      ...s,
      messages: [...s.messages, userMsg],
    }));

    await this.client.sendPrompt(sessionId, message);
  }

  async destroySession(id: string): Promise<void> {
    const abortFn = this.eventStreamAbortFns.get(id);
    if (abortFn) {
      abortFn();
      this.eventStreamAbortFns.delete(id);
    }

    this.sessions = this.sessions.filter((s) => s.id !== id);

    try {
      await this.client.destroySession(id);
    } catch {
      // Best-effort cleanup
    }
  }

  // --- Event Streaming ---

  private async startEventStream(session: AgentSession): Promise<void> {
    const sessionId = session.id;

    const abortFn = await this.client.startEventStream(
      sessionId,
      (event: AgentEvent) => {
        this.updateSession(sessionId, (s) => applyEvent(s, event));
      },
      (_reason: string) => {
        // Session ended via JSON-RPC result — applyEvent handles the status change
      },
      (error: Error) => {
        const current = this.getSession(sessionId);
        if (current && !isTerminal(current.status)) {
          this.updateSession(sessionId, (s) => ({
            ...s,
            status: { type: "failed", error: error.message },
          }));
        }
      }
    );

    this.eventStreamAbortFns.set(sessionId, abortFn);
  }

  // --- Helpers ---

  private getSession(id: string): AgentSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  private updateSession(
    id: string,
    updater: (session: AgentSession) => AgentSession
  ): void {
    this.sessions = this.sessions.map((s) =>
      s.id === id ? updater(s) : s
    );
  }

  disconnectAll(): void {
    for (const [, abortFn] of this.eventStreamAbortFns) {
      abortFn();
    }
    this.eventStreamAbortFns.clear();
  }
}
