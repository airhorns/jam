// Cassette — VCR-style recorded HTTP interaction format and MSW handler conversion.
// Cassettes are JSON files containing arrays of request/response pairs.
// For SSE (text/event-stream) responses, the body stores the raw SSE text.

import { test as base } from "vitest";
import { setupServer, type SetupServerApi } from "msw/node";
import { http, HttpResponse } from "msw";
import { SandboxAgentClient } from "../networking/client";
import { SessionManager } from "../networking/session-manager";
import { db } from "@jam/core";

// --- Cassette types ---

export interface CassetteRequest {
  method: string;
  path: string; // URL path only, e.g. "/v1/health"
  body?: string;
}

export interface CassetteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface CassetteEntry {
  request: CassetteRequest;
  response: CassetteResponse;
}

export type Cassette = CassetteEntry[];

// --- VCR test fixture ---
// Extends vitest's test with a `vcr` fixture that automatically manages
// MSW server lifecycle, cassette loading, and provides a ready-to-use
// SandboxAgentClient and SessionManager.

const VCR_BASE_URL = "http://vcr-server:2468";

export interface VCRFixture {
  /** Load a cassette (inline data or from import). Sets up MSW handlers. */
  load(cassette: Cassette): void;
  /** Pre-configured client pointing at the VCR mock server. */
  client: SandboxAgentClient;
  /** SessionManager wired to the VCR client. */
  manager: SessionManager;
  /** The MSW server instance (for advanced use like adding extra handlers). */
  server: SetupServerApi;
}

export const test = base.extend<{ vcr: VCRFixture }>({
  vcr: async ({}, use) => {
    const server = setupServer();
    server.listen({ onUnhandledRequest: "error" });
    db.clear();

    const client = new SandboxAgentClient(VCR_BASE_URL);
    const manager = new SessionManager(client);

    const fixture: VCRFixture = {
      load(cassette: Cassette) {
        const handlers = cassetteToHandlers(cassette, VCR_BASE_URL);
        server.use(...handlers);
      },
      client,
      manager,
      server,
    };

    await use(fixture);

    server.resetHandlers();
    server.close();
    db.clear();
  },
});

// --- Cassette → MSW handler conversion ---

// Convert a cassette into MSW request handlers.
// Matches requests in FIFO order per method+path to handle repeated calls.
export function cassetteToHandlers(cassette: Cassette, baseURL: string = "") {
  // Group entries by "METHOD pathname" key (strip query params), preserving order
  const queues = new Map<string, CassetteEntry[]>();
  for (const entry of cassette) {
    const pathname = entry.request.path.split("?")[0];
    const key = `${entry.request.method} ${pathname}`;
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key)!.push(entry);
  }

  const handlers = [];

  for (const [key, entries] of queues) {
    const [method, pathname] = [key.split(" ")[0], key.slice(key.indexOf(" ") + 1)];
    const url = `${baseURL}${pathname}`;
    let callIndex = 0;

    const handler = createHandler(method, url, () => {
      const entry = entries[Math.min(callIndex, entries.length - 1)];
      callIndex++;
      return createResponse(entry.response);
    });

    handlers.push(handler);
  }

  return handlers;
}

function createHandler(
  method: string,
  url: string,
  resolver: () => Response,
) {
  switch (method.toUpperCase()) {
    case "GET":
      return http.get(url, () => resolver());
    case "POST":
      return http.post(url, () => resolver());
    case "DELETE":
      return http.delete(url, () => resolver());
    case "PUT":
      return http.put(url, () => resolver());
    case "PATCH":
      return http.patch(url, () => resolver());
    default:
      return http.all(url, () => resolver());
  }
}

function createResponse(res: CassetteResponse): Response {
  const isSSE = (res.headers["content-type"] ?? "").includes("text/event-stream");

  if (isSSE) {
    // Stream SSE lines with small delays to simulate real streaming
    const lines = res.body.split("\n");
    const encoder = new TextEncoder();
    let lineIndex = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        if (lineIndex >= lines.length) {
          controller.close();
          return;
        }
        const chunk = lines[lineIndex] + "\n";
        controller.enqueue(encoder.encode(chunk));
        lineIndex++;
        await new Promise((r) => setTimeout(r, 1));
      },
    });

    return new HttpResponse(stream, {
      status: res.status,
      headers: res.headers,
    });
  }

  return new HttpResponse(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

// --- Cassette builder helpers ---

/** Build a standard health-check entry. */
export function healthEntry(): CassetteEntry {
  return {
    request: { method: "GET", path: "/v1/health" },
    response: { status: 200, headers: { "content-type": "application/json" }, body: '{"status":"ok"}' },
  };
}

/** Build a standard agent-list entry. */
export function agentsEntry(agents: Array<{ id: string; installed?: boolean; credentialsAvailable?: boolean }>): CassetteEntry {
  return {
    request: { method: "GET", path: "/v1/agents" },
    response: { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ agents }) },
  };
}

/** Build a create-session response entry. */
export function createSessionEntry(sessionId: string, agent: string, acpSessionId: string): CassetteEntry {
  return {
    request: { method: "POST", path: `/v1/acp/${sessionId}?agent=${encodeURIComponent(agent)}` },
    response: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: acpSessionId } }),
    },
  };
}

/** Build an SSE event stream entry from raw SSE data lines. */
export function sseStreamEntry(sessionId: string, dataLines: string[]): CassetteEntry {
  return {
    request: { method: "GET", path: `/v1/acp/${sessionId}` },
    response: {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: dataLines.map((line) => `data: ${line}`).join("\n\n") + "\n\n",
    },
  };
}

/** Build a prompt-ack entry. */
export function promptAckEntry(sessionId: string): CassetteEntry {
  return {
    request: { method: "POST", path: `/v1/acp/${sessionId}` },
    response: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
    },
  };
}

/** Build a destroy-session entry. */
export function destroySessionEntry(sessionId: string): CassetteEntry {
  return {
    request: { method: "DELETE", path: `/v1/acp/${sessionId}` },
    response: { status: 200, headers: { "content-type": "application/json" }, body: "{}" },
  };
}

// --- SSE data helpers ---

/** Create SSE data JSON for an agent message chunk. */
export function sseMessageChunk(text: string): string {
  return JSON.stringify({ method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { text } } } });
}

/** Create SSE data JSON for an agent thought chunk. */
export function sseThoughtChunk(text: string): string {
  return JSON.stringify({ method: "session/update", params: { update: { sessionUpdate: "agent_thought_chunk", content: { text } } } });
}

/** Create SSE data JSON for a tool call. */
export function sseToolCall(toolCallId: string, title: string, kind?: string): string {
  return JSON.stringify({ method: "session/update", params: { update: { sessionUpdate: "tool_call", toolCallId, title, kind, status: "running" } } });
}

/** Create SSE data JSON for a tool call update. */
export function sseToolCallUpdate(toolCallId: string, status: string): string {
  return JSON.stringify({ method: "session/update", params: { update: { sessionUpdate: "tool_call_update", toolCallId, status } } });
}

/** Create SSE data JSON for session end. */
export function sseSessionEnd(stopReason: string = "end_turn"): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 2, result: { stopReason } });
}
