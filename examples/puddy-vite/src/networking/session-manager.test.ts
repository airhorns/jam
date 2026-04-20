import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { db, $ } from "@jam/core";
import type { SandboxAgentClient } from "./client";

beforeEach(() => {
  db.clear();
});

class FakeTerminalSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  close = vi.fn(() => this.onclose?.({} as CloseEvent));

  open() {
    this.onopen?.({} as Event);
  }

  message(data: string | ArrayBuffer) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function fakeTerminalClient(socket = new FakeTerminalSocket()) {
  return {
    createTerminalProcess: vi.fn().mockResolvedValue({
      id: "proc-1",
      command: "bash",
      args: [],
      cwd: "/workspace",
      interactive: true,
      tty: true,
      status: "running",
      pid: 123,
    }),
    openTerminalSocket: vi.fn(() => socket as unknown as WebSocket),
    sendProcessInput: vi.fn().mockResolvedValue(undefined),
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SessionManager readiness", () => {
  it("hasReadyAgent is false with no agents", () => {
    const mgr = new SessionManager();
    mgr.isConnected = true;
    mgr.agents = [];
    expect(mgr.hasReadyAgent).toBe(false);
    expect(mgr.agentReadinessError).toBe("No agents found on server");
  });

  it("hasReadyAgent is false when installed but no creds", () => {
    const mgr = new SessionManager();
    mgr.isConnected = true;
    mgr.agents = [
      { id: "claude", installed: true, credentialsAvailable: false },
    ];
    expect(mgr.hasReadyAgent).toBe(false);
    expect(mgr.agentReadinessError).toBeDefined();
    expect(mgr.agentReadinessError).toContain("no API credentials");
  });

  it("hasReadyAgent is true when installed with creds", () => {
    const mgr = new SessionManager();
    mgr.isConnected = true;
    mgr.agents = [
      { id: "claude", installed: true, credentialsAvailable: true },
    ];
    expect(mgr.hasReadyAgent).toBe(true);
    expect(mgr.agentReadinessError).toBeUndefined();
  });

  it("preferredAgent returns first ready agent", () => {
    const mgr = new SessionManager();
    mgr.agents = [
      { id: "gpt", installed: true, credentialsAvailable: false },
      { id: "claude", installed: true, credentialsAvailable: true },
    ];
    expect(mgr.preferredAgent?.id).toBe("claude");
  });

  it("createNewSession throws when no ready agent", () => {
    const mgr = new SessionManager();
    mgr.isConnected = true;
    mgr.agents = [];
    expect(() => mgr.createNewSession()).toThrow();
  });

  it("createNewSession creates session facts when agent ready", () => {
    const mgr = new SessionManager();
    mgr.isConnected = true;
    mgr.agents = [
      { id: "claude", installed: true, credentialsAvailable: true },
    ];
    const sid = mgr.createNewSession();
    expect(sid).toMatch(/^s-/);

    // Should have session facts in the DB
    const agentFacts = db.query(["session", sid, "agent", "claude"] as any);
    expect(agentFacts).toHaveLength(1);
    const workspaceFacts = db.query([
      "session",
      sid,
      "workspace",
      "default",
    ] as any);
    expect(workspaceFacts).toHaveLength(1);
    const statusFacts = db.query(["session", sid, "status", "starting"] as any);
    expect(statusFacts).toHaveLength(1);
  });

  it("hostname comes from client", () => {
    const mgr = new SessionManager();
    expect(mgr.hostname).toBe("localhost");
  });
});

describe("SessionManager terminal sessions", () => {
  it("creates terminal facts and connects the process socket", async () => {
    const socket = new FakeTerminalSocket();
    const client = fakeTerminalClient(socket);
    const mgr = new SessionManager(client as unknown as SandboxAgentClient);

    const terminalId = mgr.createTerminalSession("s1", "/workspace");

    expect(
      db.query(["terminal", terminalId, "session", "s1"] as any),
    ).toHaveLength(1);
    expect(
      db.query(["terminal", terminalId, "workspace", "default"] as any),
    ).toHaveLength(1);
    expect(
      db.query(["terminal", terminalId, "cwd", "/workspace"] as any),
    ).toHaveLength(1);
    expect(
      db.query(["terminal", terminalId, "status", "starting"] as any),
    ).toHaveLength(1);

    await flushAsyncWork();
    expect(client.createTerminalProcess).toHaveBeenCalledWith("/workspace");
    expect(client.openTerminalSocket).toHaveBeenCalledWith("proc-1");
    expect(
      db.query(["terminal", terminalId, "processId", "proc-1"] as any),
    ).toHaveLength(1);

    socket.open();
    expect(
      db.query(["terminal", terminalId, "status", "connected"] as any),
    ).toHaveLength(1);

    socket.message("hello");
    socket.message(" world");
    expect(
      db.query(["terminal", terminalId, "output", $.output] as any),
    ).toContainEqual(expect.objectContaining({ output: "hello world" }));
  });

  it("sends terminal input to the backing process", async () => {
    const client = fakeTerminalClient();
    const mgr = new SessionManager(client as unknown as SandboxAgentClient);
    const terminalId = mgr.createTerminalSession("s1");

    await flushAsyncWork();
    await mgr.sendTerminalInput(terminalId, "pwd\n");

    expect(client.sendProcessInput).toHaveBeenCalledWith("proc-1", "pwd\n");
  });

  it("marks terminal creation failures in facts", async () => {
    const client = fakeTerminalClient();
    client.createTerminalProcess.mockRejectedValueOnce(new Error("no pty"));
    const mgr = new SessionManager(client as unknown as SandboxAgentClient);

    const terminalId = mgr.createTerminalSession("s1");
    await flushAsyncWork();

    expect(
      db.query(["terminal", terminalId, "status", "failed"] as any),
    ).toHaveLength(1);
    expect(
      db.query(["terminal", terminalId, "statusDetail", $.detail] as any),
    ).toContainEqual(expect.objectContaining({ detail: "no pty" }));
  });
});
