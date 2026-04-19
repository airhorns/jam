import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

const port = Number(process.env.SANDBOX_AGENT_TEST_PORT ?? process.argv[2] ?? 2468);

interface SessionState {
  acpSessionId: string;
  stream?: ServerResponse;
}

interface ProcessState {
  id: string;
  cwd: string;
  input: string;
  socket?: WebSocket;
}

const sessions = new Map<string, SessionState>();
const processes = new Map<string, ProcessState>();
let nextProcessId = 1;

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function writeSse(sessionId: string, payload: unknown) {
  const stream = sessions.get(sessionId)?.stream;
  if (!stream || stream.destroyed) return;
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeAgentResponse(sessionId: string, prompt: string) {
  writeSse(sessionId, {
    method: "session/update",
    params: {
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { text: `sandbox-agent heard: ${prompt}` },
      },
    },
  });
  writeSse(sessionId, {
    jsonrpc: "2.0",
    id: 2,
    result: { stopReason: "end_turn" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/v1/health") {
    sendJson(res, { status: "ok" });
    return;
  }

  if (req.method === "GET" && path === "/v1/agents") {
    sendJson(res, {
      agents: [
        { id: "test-agent", installed: true, credentialsAvailable: true },
      ],
    });
    return;
  }

  const acpMatch = path.match(/^\/v1\/acp\/([^/]+)$/);
  if (acpMatch) {
    const sessionId = decodeURIComponent(acpMatch[1]);

    if (req.method === "POST" && url.searchParams.has("agent")) {
      sessions.set(sessionId, { acpSessionId: `acp-${sessionId}` });
      sendJson(res, {
        jsonrpc: "2.0",
        id: 1,
        result: { sessionId: `acp-${sessionId}` },
      });
      return;
    }

    if (req.method === "GET") {
      const session = sessions.get(sessionId) ?? {
        acpSessionId: `acp-${sessionId}`,
      };
      sessions.set(sessionId, session);
      session.stream = res;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      req.on("close", () => {
        if (sessions.get(sessionId)?.stream === res) {
          sessions.get(sessionId)!.stream = undefined;
        }
      });
      return;
    }

    if (req.method === "POST") {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = body.params?.prompt?.[0]?.text ?? "";
      sendJson(res, { jsonrpc: "2.0", id: body.id ?? 2, result: {} });
      setTimeout(() => writeAgentResponse(sessionId, prompt), 20);
      return;
    }

    if (req.method === "DELETE") {
      sessions.delete(sessionId);
      sendJson(res, {});
      return;
    }
  }

  if (req.method === "POST" && path === "/v1/processes") {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const id = `proc-${nextProcessId++}`;
    const cwd = body.cwd ?? "/workspace";
    processes.set(id, { id, cwd, input: "" });
    sendJson(res, {
      id,
      command: body.command ?? "bash",
      args: body.args ?? [],
      cwd,
      interactive: true,
      tty: true,
      status: "running",
      pid: 4242,
    });
    return;
  }

  const inputMatch = path.match(/^\/v1\/processes\/([^/]+)\/input$/);
  if (req.method === "POST" && inputMatch) {
    const processId = decodeURIComponent(inputMatch[1]);
    const process = processes.get(processId);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const data = String(body.data ?? "");
    if (process) {
      process.input += data.replace(/\r/g, "\n");
      if (process.input.includes("\n")) {
        const command = process.input.trim();
        process.input = "";
        const output =
          command === "pwd"
            ? `pwd\r\n${process.cwd}\r\n$ `
            : `${command}\r\n$ `;
        process.socket?.send(output);
      }
    }
    sendJson(res, {});
    return;
  }

  sendJson(res, { error: "not found" }, 404);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const match = url.pathname.match(/^\/v1\/processes\/([^/]+)\/terminal\/ws$/);
  if (!match) {
    socket.destroy();
    return;
  }

  const processId = decodeURIComponent(match[1]);
  wss.handleUpgrade(req, socket, head, (ws) => {
    const process = processes.get(processId);
    if (process) {
      process.socket = ws;
      ws.send("$ ");
      ws.on("close", () => {
        if (process.socket === ws) process.socket = undefined;
      });
    }
    wss.emit("connection", ws, req);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`sandbox-agent test server listening on ${port}`);
});

function shutdown() {
  wss.close();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
