import { afterEach, describe, it, expect, vi } from "vitest";
import { SandboxAgentClient, SandboxAgentError } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SandboxAgentClient", () => {
  it("constructs with defaults", () => {
    const client = new SandboxAgentClient();
    expect(client.hostname).toBe("localhost");
  });

  it("constructs with custom URL", () => {
    const client = new SandboxAgentClient("http://myserver:9999");
    expect(client.hostname).toBe("myserver");
  });

  it("strips trailing slash from URL", () => {
    const client = new SandboxAgentClient("http://example.com/");
    expect(client.hostname).toBe("example.com");
  });

  it("creates an interactive terminal process", async () => {
    const process = {
      id: "proc-1",
      command: "bash",
      args: [],
      cwd: "/workspace",
      interactive: true,
      tty: true,
      status: "running",
      pid: 123,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(process), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SandboxAgentClient("http://sandbox.test");
    await expect(client.createTerminalProcess("/workspace")).resolves.toEqual(
      process,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://sandbox.test/v1/processes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          command: "bash",
          args: [],
          cwd: "/workspace",
          interactive: true,
          tty: true,
        }),
      }),
    );
  });

  it("sends terminal process input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SandboxAgentClient("http://sandbox.test");
    await client.sendProcessInput("proc/1", "pwd\n");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://sandbox.test/v1/processes/proc%2F1/input",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ data: "pwd\n", encoding: "utf8" }),
      }),
    );
  });

  it("builds a terminal websocket URL", () => {
    const client = new SandboxAgentClient("https://sandbox.test/root", "tok");

    expect(client.buildTerminalWebSocketURL("proc/1")).toBe(
      "wss://sandbox.test/v1/processes/proc%2F1/terminal/ws?access_token=tok",
    );
  });
});

describe("SandboxAgentError", () => {
  it("creates http error", () => {
    const err = SandboxAgentError.httpError(404, "Not found");
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.message).toBe("HTTP 404: Not found");
  });

  it("creates no ready agent error", () => {
    const err = SandboxAgentError.noReadyAgent();
    expect(err.code).toBe("NO_READY_AGENT");
  });
});
