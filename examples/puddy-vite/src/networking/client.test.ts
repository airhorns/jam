import { describe, it, expect } from "vitest";
import { SandboxAgentClient, SandboxAgentError } from "./client";

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
