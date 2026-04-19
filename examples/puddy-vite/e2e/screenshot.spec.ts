import { expect, test } from "@playwright/test";

test("screenshot: initial state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.waitForFunction(() => {
    const db = (window as any).__db;
    return Boolean(db?.insert && db?.replace);
  });

  await page.evaluate(() => {
    const db = (window as any).__db;

    db.replace("connection", "status", "connected");
    db.replace("connection", "hostname", "localhost");

    db.insert("session", "s-1001", "agent", "claude-sonnet");
    db.insert("session", "s-1001", "status", "active");
    db.insert("session", "s-1001", "currentMode", "agent");

    db.insert("session", "s-1002", "agent", "claude-opus");
    db.insert("session", "s-1002", "status", "ended");

    db.replace("ui", "selectedSession", "s-1001");

    db.insert("message", "s-1001", "msg-0", "user", "text", "Can you help me refactor the auth module?");
    db.insert("message", "s-1001", "msg-1", "assistant", "thought", "Let me look at the auth module structure...");
    db.insert("message", "s-1001", "msg-2", "assistant", "text", "I'll start by reading the current auth module to understand the structure.");
    db.insert("message", "s-1001", "tc-1", "assistant", "toolUse", "Read src/auth/middleware.ts");
    db.insert("message", "s-1001", "tc-1-result", "tool", "toolResult", "completed");
    db.insert("message", "s-1001", "msg-3", "assistant", "text", "The auth module uses a session-based approach. I recommend switching to JWT tokens for better scalability.");
    db.insert("message", "s-1001", "mc-1", "system", "modeChange", "architect");

    db.insert("plan", "s-1001", "entry-0", "Analyze current auth flow", "completed", "high");
    db.insert("plan", "s-1001", "entry-1", "Design JWT token structure", "in_progress", "high");
    db.insert("plan", "s-1001", "entry-2", "Implement token generation", "pending", "medium");
    db.insert("plan", "s-1001", "entry-3", "Update middleware", "pending", "medium");
    db.insert("plan", "s-1001", "entry-4", "Write tests", "pending", "low");

    db.insert("session", "s-1001", "streamingText", "Now let me design the JWT structure. We'll need...");
  });

  await expect(page.getByText("Can you help me refactor the auth module?")).toBeVisible();
  await expect(page.getByText("Analyze current auth flow")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("initial-state.png"),
    fullPage: false,
  });
});
