// SessionManager — orchestrates agent sessions using remember/replace/forget for state.
// All session state lives in the fact database. Only streaming accumulators
// (which need incremental appending) live in JS.

import { remember, replace, forget, _, transaction } from "@jam/core";
import { type AgentEvent } from "../models/events";
import { isTerminalStatus } from "../models/session";
import {
  ensureDefaultWorkspace,
  ensureSessionWorkspace,
  getActiveWorkspaceId,
  getSessionWorkspaceId,
} from "../models/workspace";
import {
  SandboxAgentClient,
  SandboxAgentError,
  type AgentInfo,
} from "./client";

let _nextMsgId = 0;
let _nextUserMsgId = 0;
let _nextTerminalId = 0;

type TerminalStatus = "starting" | "connected" | "closed" | "failed";

interface TerminalHandle {
  sessionId: string;
  processId?: string;
  socket?: WebSocket;
}

export class SessionManager {
  private client: SandboxAgentClient;

  // Minimal JS-only state: streaming accumulators (can't incrementally append to a fact)
  private streamingText: Map<string, string> = new Map();
  private streamingThought: Map<string, string> = new Map();
  // Track session IDs and their current status for singleton replacement
  private sessionStatuses: Map<string, string> = new Map();
  private terminalStatuses: Map<string, TerminalStatus> = new Map();
  private terminalOutputs: Map<string, string> = new Map();
  private terminalHandles: Map<string, TerminalHandle> = new Map();

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

  createNewSession(
    initialPrompt?: string,
    workspaceId = getActiveWorkspaceId(),
  ): string {
    const agent = this.preferredAgent?.id;
    if (!agent) throw SandboxAgentError.noReadyAgent();

    ensureDefaultWorkspace();
    const sessionId = "s-" + Date.now();

    transaction(() => {
      remember("session", sessionId, "agent", agent);
      remember("session", sessionId, "workspace", workspaceId);
      replace("session", sessionId, "status", "starting");
    });
    this.sessionStatuses.set(sessionId, "starting");

    this.connectSession(sessionId, agent, initialPrompt);

    return sessionId;
  }

  private async connectSession(
    sessionId: string,
    agent: string,
    initialPrompt?: string,
  ): Promise<void> {
    try {
      await this.client.createSession(sessionId, agent);

      this.client.startEventStream(
        sessionId,
        (event) => this.handleEvent(sessionId, event),
        (err) => {
          console.error("SSE stream error:", err.message ?? err);
          this.clearStreaming(sessionId);
        },
      );

      this.setStatus(sessionId, "active");

      if (initialPrompt) {
        this.sendMessage(sessionId, initialPrompt);
      }
    } catch (err: any) {
      this.setStatus(sessionId, "failed");
      replace("session", sessionId, "statusDetail", err.message ?? String(err));
    }
  }

  sendMessage(sessionId: string, message: string): void {
    const msgId = `umsg-${_nextUserMsgId++}`;
    remember("message", sessionId, msgId, "user", "text", message);
    remember("session", sessionId, "thinking", "true");

    this.client.sendPrompt(
      sessionId,
      message,
      () => {},
      (err) => {
        console.error("sendMessage error:", err.message ?? err);
        this.clearStreaming(sessionId);
      },
    );
  }

  // --- Terminal Lifecycle ---

  createTerminalSession(sessionId: string, cwd: string = "/"): string {
    if (!sessionId) {
      throw new SandboxAgentError("NO_SESSION", "Select a session before starting a terminal");
    }

    const workspaceId =
      getSessionWorkspaceId(sessionId) ??
      ensureSessionWorkspace(sessionId, getActiveWorkspaceId());
    const terminalId = `term-${Date.now()}-${_nextTerminalId++}`;
    this.terminalHandles.set(terminalId, { sessionId });
    this.terminalStatuses.set(terminalId, "starting");
    this.terminalOutputs.set(terminalId, "");

    transaction(() => {
      remember("terminal", terminalId, "session", sessionId);
      remember("terminal", terminalId, "workspace", workspaceId);
      replace("terminal", terminalId, "cwd", cwd);
      replace("terminal", terminalId, "status", "starting");
      replace("terminal", terminalId, "output", "");
    });

    this.connectTerminalSession(terminalId, cwd);

    return terminalId;
  }

  async sendTerminalInput(terminalId: string, input: string): Promise<void> {
    const handle = this.terminalHandles.get(terminalId);
    if (!handle?.processId) {
      throw new SandboxAgentError("NO_TERMINAL_PROCESS", "Terminal process is not ready");
    }

    try {
      await this.client.sendProcessInput(handle.processId, input);
    } catch (err: any) {
      this.setTerminalStatus(terminalId, "failed");
      replace("terminal", terminalId, "statusDetail", err.message ?? String(err));
      throw err;
    }
  }

  closeTerminalSession(terminalId: string): void {
    const handle = this.terminalHandles.get(terminalId);
    handle?.socket?.close();
    this.setTerminalStatus(terminalId, "closed");
  }

  private handleEvent(sessionId: string, event: AgentEvent): void {
    const p = event.payload;

    switch (p.type) {
      case "agentMessageChunk": {
        this.ensureActive(sessionId);
        const oldText = this.streamingText.get(sessionId);
        const newText = (oldText ?? "") + p.text;
        replace("session", sessionId, "streamingText", newText);
        this.streamingText.set(sessionId, newText);
        break;
      }

      case "agentThoughtChunk": {
        this.ensureActive(sessionId);
        const oldThought = this.streamingThought.get(sessionId);
        const newThought = (oldThought ?? "") + p.text;
        replace("session", sessionId, "streamingThought", newThought);
        this.streamingThought.set(sessionId, newThought);
        break;
      }

      case "toolCall":
        this.finalizeStreaming(sessionId);
        remember(
          "message",
          sessionId,
          p.data.toolCallId,
          "assistant",
          "toolUse",
          p.data.title,
        );
        remember(
          "message",
          sessionId,
          p.data.toolCallId,
          "toolStatus",
          p.data.status ?? "pending",
        );
        remember("session", sessionId, "hasActiveTools", "true");
        break;

      case "toolCallUpdate": {
        const status = p.data.status ?? "in_progress";
        replace("message", sessionId, p.data.toolCallId, "toolStatus", status);
        if (status === "completed" || status === "failed") {
          remember(
            "message",
            sessionId,
            p.data.toolCallId + "-result",
            "tool",
            "toolResult",
            status,
          );
        }
        break;
      }

      case "usageUpdate":
        transaction(() => {
          if (p.data.costAmount != null) {
            replace("session", sessionId, "costAmount", p.data.costAmount);
            replace(
              "session",
              sessionId,
              "costCurrency",
              p.data.costCurrency ?? "USD",
            );
          }
          replace("session", sessionId, "contextSize", p.data.size);
          replace("session", sessionId, "contextUsed", p.data.used);
        });
        break;

      case "plan": {
        this.ensureActive(sessionId);
        transaction(() => {
          forget("plan", sessionId, _, _, _, _);
          for (let i = 0; i < p.data.entries.length; i++) {
            const entry = p.data.entries[i];
            remember(
              "plan",
              sessionId,
              `entry-${i}`,
              entry.content,
              entry.status,
              entry.priority,
            );
          }
        });
        break;
      }

      case "currentModeUpdate":
        replace("session", sessionId, "currentMode", p.modeId);
        const modeId = `mode-${_nextMsgId++}`;
        remember(
          "message",
          sessionId,
          modeId,
          "system",
          "modeChange",
          p.modeId,
        );
        break;

      case "availableCommandsUpdate":
        transaction(() => {
          forget("command", sessionId, _, _);
          for (const cmd of p.commands) {
            remember("command", sessionId, cmd.name, cmd.description);
          }
        });
        break;

      case "sessionInfoUpdate":
        if (p.title) {
          replace("session", sessionId, "title", p.title);
        }
        break;

      case "sessionEnd":
        this.finalizeStreaming(sessionId);
        this.setStatus(sessionId, "ended");
        replace("session", sessionId, "statusDetail", p.stopReason);
        forget("session", sessionId, "hasActiveTools", "true");
        break;

      case "unknown":
        break;
    }
  }

  async destroySession(id: string): Promise<void> {
    this.streamingText.delete(id);
    this.streamingThought.delete(id);
    this.sessionStatuses.delete(id);
    const terminals = Array.from(this.terminalHandles.entries())
      .filter(([, handle]) => handle.sessionId === id)
      .map(([terminalId]) => terminalId);

    transaction(() => {
      forget("plan", id, _, _, _, _);
      forget("command", id, _, _);
      forget("session", id, "workspace", _);
      for (const terminalId of terminals) {
        this.forgetTerminalFacts(terminalId);
      }
    });
    for (const terminalId of terminals) {
      this.terminalHandles.get(terminalId)?.socket?.close();
      this.terminalHandles.delete(terminalId);
      this.terminalStatuses.delete(terminalId);
      this.terminalOutputs.delete(terminalId);
    }

    try {
      await this.client.destroySession(id);
    } catch {
      // best effort
    }
  }

  // --- Helpers ---

  private async connectTerminalSession(
    terminalId: string,
    cwd: string,
  ): Promise<void> {
    try {
      const process = await this.client.createTerminalProcess(cwd);
      replace("terminal", terminalId, "processId", process.id);

      const handle = this.terminalHandles.get(terminalId);
      if (!handle) return;
      handle.processId = process.id;

      const socket = this.client.openTerminalSocket(process.id);
      if (!socket) {
        this.setTerminalStatus(terminalId, "connected");
        return;
      }

      handle.socket = socket;
      socket.onopen = () => this.setTerminalStatus(terminalId, "connected");
      socket.onmessage = (event) => {
        this.appendTerminalOutput(terminalId, this.decodeTerminalData(event.data));
      };
      socket.onerror = () => {
        this.setTerminalStatus(terminalId, "failed");
        replace("terminal", terminalId, "statusDetail", "Terminal socket error");
      };
      socket.onclose = () => {
        if (this.terminalStatuses.get(terminalId) !== "failed") {
          this.setTerminalStatus(terminalId, "closed");
        }
      };
    } catch (err: any) {
      this.setTerminalStatus(terminalId, "failed");
      replace("terminal", terminalId, "statusDetail", err.message ?? String(err));
    }
  }

  private setTerminalStatus(terminalId: string, status: TerminalStatus): void {
    const old = this.terminalStatuses.get(terminalId);
    if (old === status) return;
    replace("terminal", terminalId, "status", status);
    this.terminalStatuses.set(terminalId, status);
  }

  private appendTerminalOutput(terminalId: string, chunk: string): void {
    if (!chunk) return;
    const output = (this.terminalOutputs.get(terminalId) ?? "") + chunk;
    this.terminalOutputs.set(terminalId, output);
    replace("terminal", terminalId, "output", output);
  }

  private decodeTerminalData(data: MessageEvent["data"]): string {
    if (typeof data === "string") {
      try {
        const frame = JSON.parse(data);
        if (frame && typeof frame.type === "string") return "";
      } catch {
        // Plain text frames are terminal output.
      }
      return data;
    }
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (ArrayBuffer.isView(data)) {
      return new TextDecoder().decode(data);
    }
    return String(data ?? "");
  }

  private forgetTerminalFacts(terminalId: string): void {
    forget("terminal", terminalId, "session", _);
    forget("terminal", terminalId, "processId", _);
    forget("terminal", terminalId, "workspace", _);
    forget("terminal", terminalId, "cwd", _);
    forget("terminal", terminalId, "status", _);
    forget("terminal", terminalId, "statusDetail", _);
    forget("terminal", terminalId, "output", _);
  }

  private setStatus(sessionId: string, status: string): void {
    const old = this.sessionStatuses.get(sessionId);
    if (old === status) return;
    replace("session", sessionId, "status", status);
    this.sessionStatuses.set(sessionId, status);
  }

  private ensureActive(sessionId: string): void {
    if (this.sessionStatuses.get(sessionId) === "starting") {
      this.setStatus(sessionId, "active");
    }
    forget("session", sessionId, "thinking", "true");
  }

  private finalizeStreaming(sessionId: string): void {
    forget("session", sessionId, "thinking", "true");
    const text = this.streamingText.get(sessionId);
    if (text) {
      forget("session", sessionId, "streamingText", text);
      remember(
        "message",
        sessionId,
        `msg-${_nextMsgId++}`,
        "assistant",
        "text",
        text,
      );
      this.streamingText.delete(sessionId);
    }

    const thought = this.streamingThought.get(sessionId);
    if (thought) {
      forget("session", sessionId, "streamingThought", thought);
      remember(
        "message",
        sessionId,
        `thought-${_nextMsgId++}`,
        "assistant",
        "thought",
        thought,
      );
      this.streamingThought.delete(sessionId);
    }
  }

  private clearStreaming(sessionId: string): void {
    const text = this.streamingText.get(sessionId);
    if (text) {
      forget("session", sessionId, "streamingText", text);
      this.streamingText.delete(sessionId);
    }
    const thought = this.streamingThought.get(sessionId);
    if (thought) {
      forget("session", sessionId, "streamingThought", thought);
      this.streamingThought.delete(sessionId);
    }
  }

  private syncConnectionState(): void {
    transaction(() => {
      replace(
        "connection",
        "status",
        this.isConnected ? "connected" : "disconnected",
      );
      replace("connection", "hostname", this.hostname);
      if (this.connectionError) {
        replace("connection", "error", this.connectionError);
      } else {
        forget("connection", "error", _);
      }
    });
  }

  disconnectAll(): void {}
}
