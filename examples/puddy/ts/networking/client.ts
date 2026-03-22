// SandboxAgentClient — HTTP client for the sandbox-agent ACP API.
// Ports the Swift SandboxAgentClient to TypeScript using fetch().

import { parseACPMessage, type AgentEvent, type ParseResult } from "../models/events";

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
    const err = new SandboxAgentError("JSON_RPC_ERROR", data ? `${message}: ${data}` : message);
    err.data = data;
    return err;
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
    this.baseURL = baseURL.replace(/\/$/, ""); // strip trailing slash
    this.token = token;
  }

  get hostname(): string {
    // Extract hostname from URL string without URL constructor (not available in QuickJS)
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
    await this.validateResponse(response);
    const data = await response.json();
    return data.agents || [];
  }

  // --- Session Lifecycle ---

  async createSession(sessionId: string, agent: string, cwd: string = "/"): Promise<void> {
    const rpcRequest = this.makeJsonRpc("session/new", {
      cwd,
      mcpServers: [],
    });

    const response = await fetch(
      `${this.baseURL}/v1/acp/${sessionId}?agent=${encodeURIComponent(agent)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify(rpcRequest),
      }
    );

    await this.validateResponse(response);
    const data = await response.json();
    this.checkJsonRpcError(data);

    // Extract the ACP sessionId from the JSON-RPC result
    if (data.result?.sessionId) {
      this.acpSessionIds.set(sessionId, data.result.sessionId);
    }
  }

  async sendPrompt(sessionId: string, prompt: string): Promise<void> {
    const acpSessionId = this.acpSessionIds.get(sessionId);
    const params: Record<string, any> = {
      prompt: [{ type: "text", text: prompt }],
    };
    if (acpSessionId) {
      params.sessionId = acpSessionId;
    }

    const rpcRequest = this.makeJsonRpc("session/prompt", params);

    const response = await fetch(`${this.baseURL}/v1/acp/${sessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!response.ok) {
      const body = await response.text();
      throw SandboxAgentError.httpError(response.status, body);
    }

    const data = await response.json();
    this.checkJsonRpcError(data);
  }

  // --- Event Streaming ---

  /**
   * Start streaming SSE events for a session.
   * Calls onEvent for each parsed AgentEvent.
   * Calls onError if the stream errors.
   * Returns an abort function to stop streaming.
   */
  async startEventStream(
    sessionId: string,
    onEvent: (event: AgentEvent) => void,
    onEnd: (reason: string) => void,
    onError: (error: Error) => void
  ): Promise<() => void> {
    const controller = new AbortController();

    const streamLoop = async () => {
      try {
        const response = await fetch(`${this.baseURL}/v1/acp/${sessionId}`, {
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...this.authHeaders(),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw SandboxAgentError.httpError(response.status, await response.text());
        }

        // Read SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const eventIndex = { value: 0 };
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames: lines starting with "data: "
          const lines = buffer.split("\n");
          buffer = lines.pop()!; // keep incomplete line

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (!data) continue;

              // Check for JSON-RPC error envelope
              try {
                const json = JSON.parse(data);
                if (json.error) {
                  const err = SandboxAgentError.jsonRpcError(
                    json.error.code ?? -1,
                    json.error.message ?? "Unknown error",
                    json.error.data
                  );
                  onError(err);
                  return;
                }
              } catch {
                // Not JSON or parse error — try as ACP message
              }

              const result = parseACPMessage(data, eventIndex);
              switch (result.type) {
                case "event":
                  onEvent(result.event);
                  break;
                case "sessionEnd":
                  eventIndex.value += 1;
                  onEvent({
                    id: `evt-end`,
                    eventIndex: eventIndex.value,
                    payload: { type: "sessionEnd", stopReason: result.stopReason },
                  });
                  onEnd(result.stopReason);
                  break;
                case "skip":
                  break;
              }
            }
          }
        }

        // Stream ended without error
        if (!controller.signal.aborted) {
          onError(new Error("Session stream ended unexpectedly"));
        }
      } catch (err: any) {
        if (err.name !== "AbortError" && !controller.signal.aborted) {
          onError(err);
        }
      }
    };

    // Start streaming in background
    streamLoop();

    // Return abort function
    return () => controller.abort();
  }

  // --- Destruction ---

  async destroySession(sessionId: string): Promise<void> {
    await fetch(`${this.baseURL}/v1/acp/${sessionId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
    });
    this.acpSessionIds.delete(sessionId);
  }

  // --- Helpers ---

  private makeJsonRpc(method: string, params: Record<string, any>): object {
    this.requestIdCounter += 1;
    return {
      jsonrpc: "2.0",
      id: this.requestIdCounter,
      method,
      params,
    };
  }

  private authHeaders(): Record<string, string> {
    if (this.token) {
      return { Authorization: `Bearer ${this.token}` };
    }
    return {};
  }

  private async validateResponse(response: Response): Promise<void> {
    if (!response.ok) {
      const body = await response.text();
      throw SandboxAgentError.httpError(response.status, body);
    }
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
