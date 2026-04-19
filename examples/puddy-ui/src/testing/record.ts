#!/usr/bin/env node
// Record a cassette — captures real HTTP interactions with a sandbox-agent server.
//
// Usage: corepack pnpm exec tsx src/testing/record.ts <cassette-name> <message1> [message2] ...
//
// Requires a running sandbox-agent server at http://localhost:2468.
// Records all HTTP traffic into src/testing/cassettes/<cassette-name>.json.
//
// Strategy: make all HTTP calls directly (no SandboxAgentClient), capturing
// every request/response pair. For SSE, open a dedicated reader that collects
// the raw stream body while the conversation runs.

import * as fs from "node:fs";
import * as path from "node:path";
import type { CassetteEntry } from "./cassette";

const CASSETTE_DIR = path.join(import.meta.dirname, "cassettes");
const BASE_URL = process.env.SANDBOX_AGENT_URL ?? "http://localhost:2468";

// Record a single request/response and return the response body
async function recordRequest(
  entries: CassetteEntry[],
  method: string,
  urlPath: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const url = `${BASE_URL}${urlPath}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) init.body = body;

  const response = await fetch(url, init);
  const responseBody = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { responseHeaders[k] = v; });

  entries.push({
    request: { method, path: urlPath, body },
    response: { status: response.status, headers: responseHeaders, body: responseBody },
  });

  return { status: response.status, body: responseBody, headers: responseHeaders };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: corepack pnpm exec tsx src/testing/record.ts <cassette-name> <message1> [message2] ...");
    console.error("Example: corepack pnpm exec tsx src/testing/record.ts hello 'say hello'");
    process.exit(1);
  }

  const [cassetteName, ...messages] = args;
  const entries: CassetteEntry[] = [];

  console.log(`Recording cassette "${cassetteName}" against ${BASE_URL}`);
  console.log(`Messages: ${messages.join(", ")}`);

  // 1. Health check
  console.log("Checking health...");
  const health = await recordRequest(entries, "GET", "/v1/health");
  if (health.status !== 200) {
    console.error("Server not healthy:", health.body);
    process.exit(1);
  }

  // 2. List agents
  console.log("Listing agents...");
  const agentsResp = await recordRequest(entries, "GET", "/v1/agents");
  const agentsList = JSON.parse(agentsResp.body).agents || [];
  const agentName = process.env.AGENT;
  const agent = agentName
    ? agentsList.find((a: any) => a.id === agentName)
    : agentsList.find((a: any) => a.installed && a.credentialsAvailable) ?? agentsList.find((a: any) => a.credentialsAvailable);
  if (!agent) {
    console.error("No ready agent found. Available:", agentsList.map((a: any) => `${a.id} (installed=${a.installed}, creds=${a.credentialsAvailable})`).join(", "));
    process.exit(1);
  }
  console.log(`Using agent: ${agent.id}`);

  // 3. Create session
  const sessionId = `rec-${Date.now()}`;
  const sessionPath = `/v1/acp/${sessionId}`;
  console.log(`Creating session: ${sessionId}`);

  let rpcId = 0;
  const createBody = JSON.stringify({
    jsonrpc: "2.0", id: ++rpcId, method: "session/new", params: { cwd: "/", mcpServers: [] },
  });
  const createResp = await recordRequest(entries, "POST", `${sessionPath}?agent=${encodeURIComponent(agent.id)}`, createBody);
  if (createResp.status !== 200) {
    console.error("Failed to create session:", createResp.body);
    process.exit(1);
  }
  const acpSessionId = JSON.parse(createResp.body).result?.sessionId;
  console.log(`  ACP session ID: ${acpSessionId}`);

  // 4. Open SSE stream in the background
  const sseAbort = new AbortController();
  let sseBody = "";
  const sseUrl = `${BASE_URL}${sessionPath}`;

  const ssePromise = (async () => {
    try {
      const response = await fetch(sseUrl, {
        headers: { "Accept": "text/event-stream", "Cache-Control": "no-cache" },
        signal: sseAbort.signal,
      });
      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBody += decoder.decode(value, { stream: true });
        }
        sseBody += decoder.decode();
      } catch {
        // Abort or network error — expected
        sseBody += decoder.decode();
      }
    } catch {
      // Fetch aborted — expected
    }
  })();

  // Also parse events from the SSE data to know when sessionEnd arrives
  let sessionEnded = false;
  const checkSessionEnd = () => {
    return sseBody.includes('"stopReason"');
  };

  // 5. Send each message
  for (const msg of messages) {
    sessionEnded = false;
    console.log(`Sending: "${msg}"`);

    const promptBody = JSON.stringify({
      jsonrpc: "2.0", id: ++rpcId, method: "session/prompt",
      params: { prompt: [{ type: "text", text: msg }], ...(acpSessionId ? { sessionId: acpSessionId } : {}) },
    });
    await recordRequest(entries, "POST", sessionPath, promptBody);

    // Wait for sessionEnd in the SSE stream
    await new Promise<void>((resolve) => {
      const wait = setInterval(() => {
        if (checkSessionEnd()) {
          clearInterval(wait);
          resolve();
        }
      }, 100);
      // Timeout after 2 minutes
      setTimeout(() => { clearInterval(wait); resolve(); }, 120000);
    });

    console.log(`  -> Conversation turn complete (${sseBody.length} bytes of SSE data)`);
  }

  // 6. Abort SSE stream and wait for it to finish
  sseAbort.abort();
  await ssePromise;

  // Record the SSE entry
  entries.push({
    request: { method: "GET", path: sessionPath },
    response: {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: sseBody,
    },
  });

  // 7. Destroy session (with timeout — connection pool may be wonky after SSE abort)
  console.log("Destroying session...");
  const deleteAbort = new AbortController();
  const deleteTimeout = setTimeout(() => deleteAbort.abort(), 5000);
  try {
    await fetch(`${BASE_URL}${sessionPath}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      signal: deleteAbort.signal,
    });
  } catch { /* best effort */ }
  clearTimeout(deleteTimeout);
  entries.push({
    request: { method: "DELETE", path: sessionPath },
    response: { status: 204, headers: {}, body: "" },
  });

  // Normalize session ID to "s-test" for deterministic replay
  const normalizedEntries = entries.map((e) => ({
    ...e,
    request: {
      ...e.request,
      path: e.request.path.replaceAll(sessionId, "s-test"),
      body: e.request.body?.replaceAll(sessionId, "s-test"),
    },
    response: {
      ...e.response,
      body: e.response.body.replaceAll(sessionId, "s-test"),
    },
  }));

  // Save cassette
  fs.mkdirSync(CASSETTE_DIR, { recursive: true });
  const outPath = path.join(CASSETTE_DIR, `${cassetteName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(normalizedEntries, null, 2) + "\n");
  console.log(`\nCassette saved: ${outPath}`);
  console.log(`Recorded ${normalizedEntries.length} HTTP interactions`);
}

main().catch((err) => {
  console.error("Recording failed:", err);
  process.exit(1);
});
