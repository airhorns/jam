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
  // When the POST completes (agent is done), we abort the SSE connection
  // and read whatever text was received.

  sendPromptWithEvents(
    sessionId: string,
    prompt: string,
    onComplete: (events: AgentEvent[]) => void,
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

    // ACP flow: open SSE GET first, then POST prompt.
    // Both run concurrently as standard fetch() promises.
    // SSE body is read via ReadableStream (response.body.getReader()).

    // Use a shared accumulator so we can read SSE text even if the promise hasn't resolved
    const sseAccumulator = { text: "" };
    const sseAbort = new AbortController();

    // 1. Start SSE reader (reads body incrementally via ReadableStream)
    this.readSSEStream(sseUrl, sseAbort.signal, sseAccumulator);

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

        // 3. POST done — abort SSE and use accumulated text
        sseAbort.abort();
        onComplete(this.parseSSEText(sseAccumulator.text));
      })
      .catch((err) => {
        sseAbort.abort();
        onError(err);
      });
  }

  // Read an SSE stream incrementally using response.body.getReader().
  // Accumulates text into the shared accumulator object.
  private async readSSEStream(
    url: string,
    signal: AbortSignal,
    accumulator: { text: string },
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulator.text += decoder.decode(value, { stream: true });
      }
    } catch {
      // AbortError or network error — accumulated text is already in the accumulator
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

  private parseSSEText(text: string): AgentEvent[] {
    const events: AgentEvent[] = [];
    const eventIndex = { value: 0 };

    for (const line of text.split("\n")) {
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
        events.push(result.event);
      } else if (result.type === "sessionEnd") {
        eventIndex.value += 1;
        events.push({
          id: "evt-end",
          eventIndex: eventIndex.value,
          payload: { type: "sessionEnd", stopReason: result.stopReason },
        });
      }
    }

    return events;
  }
}
