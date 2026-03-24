import { test } from "@playwright/test";

test("screenshot: initial state", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");

  // Wait for connection to settle (will go to disconnected since no server)
  await page.waitForTimeout(500);

  // Inject some demo state to show a populated app
  await page.evaluate(() => {
    const db = (window as any).__db;

    // Connected state
    db.holdFacts("connection", () => {
      db.claimFact("connection", "status", "connected");
      db.claimFact("connection", "hostname", "localhost");
    });

    // Two sessions
    db.assertFact("session", "s-1001", "agent", "claude-sonnet");
    db.assertFact("session", "s-1001", "status", "active");
    db.assertFact("session", "s-1001", "currentMode", "agent");

    db.assertFact("session", "s-1002", "agent", "claude-opus");
    db.assertFact("session", "s-1002", "status", "ended");

    // Select first session
    db.holdFacts("ui", () => {
      db.claimFact("ui", "selectedSession", "s-1001");
    });

    // Some messages
    db.assertFact("message", "s-1001", "msg-0", "user", "text", "Can you help me refactor the auth module?");
    db.assertFact("message", "s-1001", "msg-1", "assistant", "thought", "Let me look at the auth module structure...");
    db.assertFact("message", "s-1001", "msg-2", "assistant", "text", "I'll start by reading the current auth module to understand the structure.");
    db.assertFact("message", "s-1001", "tc-1", "assistant", "toolUse", "Read src/auth/middleware.ts");
    db.assertFact("message", "s-1001", "tc-1-result", "tool", "toolResult", "completed");
    db.assertFact("message", "s-1001", "msg-3", "assistant", "text", "The auth module uses a session-based approach. I recommend switching to JWT tokens for better scalability.");
    db.assertFact("message", "s-1001", "mc-1", "system", "modeChange", "architect");

    // Plan
    db.holdFacts("plan-s-1001", () => {
      db.claimFact("plan", "s-1001", "entry-0", "Analyze current auth flow", "completed", "high");
      db.claimFact("plan", "s-1001", "entry-1", "Design JWT token structure", "in_progress", "high");
      db.claimFact("plan", "s-1001", "entry-2", "Implement token generation", "pending", "medium");
      db.claimFact("plan", "s-1001", "entry-3", "Update middleware", "pending", "medium");
      db.claimFact("plan", "s-1001", "entry-4", "Write tests", "pending", "low");
    });

    // Streaming
    db.assertFact("session", "s-1001", "streamingText", "Now let me design the JWT structure. We'll need...");
  });

  await page.waitForTimeout(200);
  await page.screenshot({ path: "screenshot-initial.png", fullPage: false });
});
