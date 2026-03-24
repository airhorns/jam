// SandboxAgentClient — HTTP client for the sandbox-agent ACP API.
// Uses fetch() for all HTTP requests including SSE streaming.
// One long-lived SSE connection per session; prompts are POSTed separately.

import { parseACPMessage, type AgentEvent } from "../models/events";

export interface AgentInfo {
  id: string;
  installed?: boolean;
  credentialsAvailable?: boolean;
}

export class SandboxAgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public data?: string
  ) {
    super(message);
    this.name = "SandboxAgentError";
  }

  static httpError(statusCode: number, message: string): SandboxAgentError {
    return new SandboxAgentError("HTTP_ERROR", `HTTP ${statusCode}: ${message}`);
  }

  static jsonRpcError(code: number, message: string, data?: string): SandboxAgentError {
    return new SandboxAgentError("JSON_RPC_ERROR", data ? `${message}: ${data}` : message);
  }

  static noReadyAgent(): SandboxAgentError {
    return new SandboxAgentError("NO_READY_AGENT", "No agent available with credentials configured");
  }
}

export class SandboxAgentClient {
  private baseURL: string;
  private token?: string;
  private requestIdCounter = 0;
  private acpSessionIds = new Map<string, string>();
  // Long-lived SSE connections per session
  private sseAborts = new Map<string, AbortController>();

  constructor(baseURL: string = "", token?: string) {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.token = token;
  }

  get hostname(): string {
    if (!this.baseURL) return "localhost";
    const match = this.baseURL.match(/^https?:\/\/([^:/]+)/);
    return match ? match[1] : this.baseURL;
  }

  // --- Health ---

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/v1/health`, {
        headers: this.authHeaders(),
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // --- Agents ---

  async listAgents(): Promise<AgentInfo[]> {
    const response = await fetch(`${this.baseURL}/v1/agents`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw SandboxAgentError.httpError(response.status, await response.text());
    }
    const data: any = await response.json();
    return data.agents || [];
  }

  // --- Session Lifecycle ---

  async createSession(sessionId: string, agent: string, cwd: string = "/"): Promise<void> {
    const rpcRequest = this.makeJsonRpc("session/new", { cwd, mcpServers: [] });

    const response = await fetch(
      `${this.baseURL}/v1/acp/${sessionId}?agent=${encodeURIComponent(agent)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.authHeaders() },
        body: JSON.stringify(rpcRequest),
      }
    );

    if (!response.ok) {
      throw SandboxAgentError.httpError(response.status, await response.text());
    }
    const data: any = await response.json();
    this.checkJsonRpcError(data);

    if (data.result?.sessionId) {
      this.acpSessionIds.set(sessionId, data.result.sessionId);
    }
  }

  // --- SSE Event Stream ---
  // Opens a single long-lived SSE connection for the session.
  // Call this once after createSession; it stays open for all subsequent prompts.

  startEventStream(
    sessionId: string,
    onEvent: (event: AgentEvent) => void,
    onError?: (err: Error) => void,
  ): void {
    // Abort any existing stream for this session
    this.sseAborts.get(sessionId)?.abort();

    const abort = new AbortController();
    this.sseAborts.set(sessionId, abort);

    const sseUrl = `${this.baseURL}/v1/acp/${sessionId}`;
    const eventIndex = { value: 0 };

    this.readSSEStream(sseUrl, abort.signal, eventIndex, onEvent)
      .catch((err) => onError?.(err));
  }

  // --- Send Prompt ---
  // POSTs a prompt to the session. Events arrive on the already-open SSE stream.

  sendPrompt(
    sessionId: string,
    prompt: string,
    onComplete?: () => void,
    onError?: (err: Error) => void,
  ): void {
    const acpSessionId = this.acpSessionIds.get(sessionId);
    const params: Record<string, any> = {
      prompt: [{ type: "text", text: prompt }],
    };
    if (acpSessionId) {
      params.sessionId = acpSessionId;
    }

    const sseUrl = `${this.baseURL}/v1/acp/${sessionId}`;
    const postBody = JSON.stringify(this.makeJsonRpc("session/prompt", params));

    fetch(sseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: postBody,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw SandboxAgentError.httpError(response.status, await response.text());
        }
        const data: any = await response.json();
        this.checkJsonRpcError(data);
        onComplete?.();
      })
      .catch((err) => {
        onError?.(err);
      });
  }

  // Backwards-compat wrapper: opens SSE + POSTs prompt in one call.
  // Used by old code paths; new code should use startEventStream + sendPrompt.
  sendPromptWithEvents(
    sessionId: string,
    prompt: string,
    onEvent: (event: AgentEvent) => void,
    onComplete: () => void,
    onError: (err: Error) => void,
  ): void {
    // If no SSE stream is open for this session, start one
    if (!this.sseAborts.has(sessionId)) {
      this.startEventStream(sessionId, onEvent, onError);
    }
    this.sendPrompt(sessionId, prompt, onComplete, onError);
  }

  // Read an SSE stream incrementally using response.body.getReader().
  // Parses and dispatches events as each SSE line arrives.
  private async readSSEStream(
    url: string,
    signal: AbortSignal,
    eventIndex: { value: number },
    onEvent: (event: AgentEvent) => void,
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "text/event-stream",
          "Cache-Control": "no-cache",
          ...this.authHeaders(),
        },
        signal,
      });

      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines from the buffer
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);

          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const json = JSON.parse(data);
            if (json.error) continue;
          } catch {
            continue;
          }

          const result = parseACPMessage(data, eventIndex);
          if (result.type === "event") {
            onEvent(result.event);
          } else if (result.type === "sessionEnd") {
            eventIndex.value += 1;
            onEvent({
              id: "evt-end",
              eventIndex: eventIndex.value,
              payload: { type: "sessionEnd", stopReason: result.stopReason },
            });
          }
        }
      }
    } catch {
      // AbortError or network error — events already dispatched
    }
  }

  // --- Destruction ---

  async destroySession(sessionId: string): Promise<void> {
    // Close SSE stream
    this.sseAborts.get(sessionId)?.abort();
    this.sseAborts.delete(sessionId);

    try {
      await fetch(`${this.baseURL}/v1/acp/${sessionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...this.authHeaders() },
      });
    } catch {
      // best effort
    }
    this.acpSessionIds.delete(sessionId);
  }

  // --- Helpers ---

  private makeJsonRpc(method: string, params: Record<string, any>): object {
    this.requestIdCounter += 1;
    return { jsonrpc: "2.0", id: this.requestIdCounter, method, params };
  }

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private checkJsonRpcError(data: any): void {
    if (data.error) {
      throw SandboxAgentError.jsonRpcError(
        data.error.code ?? -1,
        data.error.message ?? "Unknown JSON-RPC error",
        typeof data.error.data === "string" ? data.error.data : undefined
      );
    }
  }

}
