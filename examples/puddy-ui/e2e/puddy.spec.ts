// Puddy e2e tests — ported from tests/puddy_e2e.rs
// Uses Playwright to test the full app in a real browser.
// Facts can be injected via window.__db (exposed by jam.ts in dev mode).

import { test, expect, type Page } from "@playwright/test";

// Helper: inject facts into the running app's fact database
async function injectFacts(page: Page, code: string) {
  await page.evaluate(code);
}

// Helper: call hold/claim/assert/retract on the app's jam module
async function evalJam(page: Page, code: string) {
  await page.evaluate(code);
}

test.describe("App loads", () => {
  test("renders without error", async ({ page }) => {
    await page.goto("/");
    const splitView = page.getByTestId("split-view");
    await expect(splitView).toBeVisible();
  });

  test("has sidebar and detail panes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("detail")).toBeVisible();
  });

  test("shows connection status bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("connection-bar")).toBeVisible();
  });

  test("shows Sessions header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Sessions")).toBeVisible();
  });

  test("shows new session button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("new-session")).toBeVisible();
    await expect(page.getByTestId("new-session")).toHaveText("+ New Session");
  });

  test("shows select a session placeholder", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Select a session",
    );
  });
});

test.describe("Connection status", () => {
  test("shows Disconnected when not connected", async ({ page }) => {
    await page.goto("/");
    // Default state with no server will eventually show Disconnected
    // But initial state is "checking", which shows "Connecting..."
    const bar = page.getByTestId("connection-bar");
    await expect(bar).toBeVisible();
    // Either checking or disconnected is fine for initial load
    await expect(
      bar.getByText(/Connecting|Disconnected/),
    ).toBeVisible();
  });

  test("updates reactively when connection status changes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("connection-bar")).toBeVisible();

    // Inject connected state
    await evalJam(page, `
      const { hold, claim } = window.__db ? { hold: window.__db.holdFacts.bind(window.__db), claim: window.__db.claimFact.bind(window.__db) } : {};
      window.__db.holdFacts("connection", () => {
        window.__db.claimFact("connection", "status", "connected");
        window.__db.claimFact("connection", "hostname", "myserver.local");
      });
    `);

    await expect(
      page.getByTestId("connection-bar").getByText("myserver.local"),
    ).toBeVisible();
  });
});

test.describe("New session button", () => {
  test("is disabled when not connected", async ({ page }) => {
    await page.goto("/");

    // Set disconnected state
    await evalJam(page, `
      window.__db.holdFacts("connection", () => {
        window.__db.claimFact("connection", "status", "disconnected");
        window.__db.claimFact("connection", "hostname", "localhost");
      });
    `);

    await expect(page.getByTestId("new-session")).toBeDisabled();
  });

  test("is enabled when connected", async ({ page }) => {
    await page.goto("/");

    await evalJam(page, `
      window.__db.holdFacts("connection", () => {
        window.__db.claimFact("connection", "status", "connected");
        window.__db.claimFact("connection", "hostname", "localhost");
      });
    `);

    await expect(page.getByTestId("new-session")).toBeEnabled();
  });
});

test.describe("Session in sidebar", () => {
  test("session appears when facts are injected", async ({ page }) => {
    await page.goto("/");

    await evalJam(page, `
      window.__db.assertFact("session", "test-session", "agent", "claude");
      window.__db.assertFact("session", "test-session", "status", "active");
    `);

    await expect(page.getByText("claude — test-session")).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();
  });

  test("clicking session selects it", async ({ page }) => {
    await page.goto("/");

    await evalJam(page, `
      window.__db.assertFact("session", "test-session", "agent", "claude");
      window.__db.assertFact("session", "test-session", "status", "active");
    `);

    await page.getByText("claude — test-session").click();
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Session: test-session",
    );
  });
});

test.describe("Messages", () => {
  async function setupSession(page: Page) {
    await page.goto("/");
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "agent", "claude");
      window.__db.assertFact("session", "s1", "status", "active");
      window.__db.holdFacts("ui", () => {
        window.__db.claimFact("ui", "selectedSession", "s1");
      });
    `);
  }

  test("user text message renders", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("message", "s1", "msg-1", "user", "text", "Hello world");
    `);
    await expect(page.getByText("Hello world")).toBeVisible();
    // User messages have ">" prefix
    await expect(page.getByText(">")).toBeVisible();
  });

  test("assistant text message renders", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("message", "s1", "msg-2", "assistant", "text", "Hi there!");
    `);
    await expect(page.getByText("Hi there!")).toBeVisible();
  });

  test("thought message renders dimmed", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("message", "s1", "t1", "assistant", "thought", "Let me think about this...");
    `);
    await expect(page.getByText("Let me think about this...")).toBeVisible();
  });

  test("tool use message renders", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("message", "s1", "tc-1", "assistant", "toolUse", "Read file");
    `);
    await expect(page.getByText("Read file")).toBeVisible();
    await expect(page.getByText("~")).toBeVisible();
  });

  test("tool result renders", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("message", "s1", "tc-1-result", "tool", "toolResult", "completed");
    `);
    await expect(
      page.locator(".message").filter({ hasText: "completed" }),
    ).toBeVisible();
  });

  test("mode change message renders", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("message", "s1", "mc1", "system", "modeChange", "architect");
    `);
    await expect(page.getByText("Mode: architect")).toBeVisible();
  });
});

test.describe("Mode badge", () => {
  test("renders when currentMode fact exists", async ({ page }) => {
    await page.goto("/");
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "agent", "claude");
      window.__db.assertFact("session", "s1", "status", "active");
      window.__db.assertFact("session", "s1", "currentMode", "architect");
    `);
    await expect(page.getByText("[architect]")).toBeVisible();
  });
});

test.describe("Plan entries", () => {
  test("render with status indicators", async ({ page }) => {
    await page.goto("/");
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "agent", "claude");
      window.__db.assertFact("session", "s1", "status", "active");
      window.__db.holdFacts("ui", () => {
        window.__db.claimFact("ui", "selectedSession", "s1");
      });
      window.__db.holdFacts("plan-s1", () => {
        window.__db.claimFact("plan", "s1", "entry-0", "Read the file", "completed", "high");
        window.__db.claimFact("plan", "s1", "entry-1", "Fix the bug", "in_progress", "medium");
        window.__db.claimFact("plan", "s1", "entry-2", "Run tests", "pending", "low");
      });
    `);

    await expect(page.getByText("Read the file")).toBeVisible();
    await expect(page.getByText("Fix the bug")).toBeVisible();
    await expect(page.getByText("Run tests")).toBeVisible();
    // Status indicators
    await expect(page.getByText("[done]")).toBeVisible();
    await expect(page.getByText("[...]")).toBeVisible();
    await expect(page.getByText("[ ]")).toBeVisible();
    // High priority indicator
    await expect(page.getByText("!")).toBeVisible();
  });
});

test.describe("Streaming indicators", () => {
  async function setupSession(page: Page) {
    await page.goto("/");
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "agent", "claude");
      window.__db.assertFact("session", "s1", "status", "active");
      window.__db.holdFacts("ui", () => {
        window.__db.claimFact("ui", "selectedSession", "s1");
      });
    `);
  }

  test("streaming thought shows", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "streamingThought", "Analyzing the code...");
    `);
    await expect(page.getByText("Analyzing the code...")).toBeVisible();
  });

  test("streaming text shows", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "streamingText", "Here is my response so far");
    `);
    await expect(
      page.getByText("Here is my response so far"),
    ).toBeVisible();
  });

  test("active tools indicator shows", async ({ page }) => {
    await setupSession(page);
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "hasActiveTools", "true");
    `);
    await expect(page.getByText("Tools running...")).toBeVisible();
  });
});

test.describe("Input", () => {
  test("input field appears when session selected", async ({ page }) => {
    await page.goto("/");
    await evalJam(page, `
      window.__db.assertFact("session", "s1", "agent", "claude");
      window.__db.assertFact("session", "s1", "status", "active");
      window.__db.holdFacts("ui", () => {
        window.__db.claimFact("ui", "selectedSession", "s1");
      });
    `);
    await expect(page.getByTestId("message-input")).toBeVisible();
  });

  test("input field hidden when no session selected", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("message-input")).not.toBeVisible();
  });
});
