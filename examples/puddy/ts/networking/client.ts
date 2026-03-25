// SandboxAgentClient — HTTP client for the sandbox-agent ACP API.
// Uses fetch() for all HTTP requests including SSE streaming.

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

  constructor(baseURL: string = "http://localhost:2468", token?: string) {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.token = token;
  }

  get hostname(): string {
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

  // --- Prompt with SSE ---
  // ACP flow: open SSE GET first → POST prompt → SSE delivers events during processing.
  // Both requests run concurrently as standard fetch() promises.
  // Events are processed incrementally as they arrive via onEvent callback.
  // When the POST completes (agent is done), we abort the SSE connection.

  sendPromptWithEvents(
    sessionId: string,
    prompt: string,
    onEvent: (event: AgentEvent) => void,
    onComplete: () => void,
    onError: (err: Error) => void,
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

    const sseAbort = new AbortController();
    const eventIndex = { value: 0 };

    // 1. Start SSE reader (processes events incrementally as they arrive)
    this.readSSEStream(sseUrl, sseAbort.signal, eventIndex, onEvent);

    // 2. POST the prompt (resolves when agent finishes)
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

        // 3. POST done — abort SSE stream
        sseAbort.abort();
        onComplete();
      })
      .catch((err) => {
        sseAbort.abort();
        onError(err);
      });
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
