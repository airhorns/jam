import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "./session-manager";
import { db } from "../jam";

beforeEach(() => {
  db.clear();
});

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
    const statusFacts = db.query(["session", sid, "status", "starting"] as any);
    expect(statusFacts).toHaveLength(1);
  });

  it("hostname comes from client", () => {
    const mgr = new SessionManager();
    expect(mgr.hostname).toBe("localhost");
  });
});
