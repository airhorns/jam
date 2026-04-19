import { test, expect, type Page } from "@playwright/test";

type FactTerm = string | number | boolean;
type Fact = FactTerm[];

async function gotoApp(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => {
    const db = (window as any).__db;
    return Boolean(db?.insert && db?.replace && db?.drop);
  });
}

async function insertFacts(page: Page, facts: Fact[]) {
  await page.evaluate((facts) => {
    const db = (window as any).__db;
    for (const fact of facts) db.insert(...fact);
  }, facts);
}

async function replaceFacts(page: Page, facts: Fact[]) {
  await page.evaluate((facts) => {
    const db = (window as any).__db;
    for (const fact of facts) db.replace(...fact);
  }, facts);
}

async function seedConnection(
  page: Page,
  status: "connected" | "disconnected" | "checking",
  hostname = "localhost",
) {
  await replaceFacts(page, [
    ["connection", "status", status],
    ["connection", "hostname", hostname],
  ]);
}

async function seedSession(page: Page, sessionId = "s1") {
  await insertFacts(page, [
    ["session", sessionId, "agent", "claude"],
    ["session", sessionId, "status", "active"],
  ]);
  await replaceFacts(page, [["ui", "selectedSession", sessionId]]);
}

async function startBackendSession(page: Page) {
  await gotoApp(page);
  await expect(page.getByTestId("new-session")).toBeEnabled();
  await page.getByTestId("new-session").click();
  const sessionRow = page.locator(".session-row").filter({ hasText: "test-agent" }).last();
  await expect(sessionRow).toBeVisible();
  await sessionRow.click();
  await expect(page.getByTestId("detail-title")).toContainText("Session:");
}

test.describe("App loads", () => {
  test("renders without error", async ({ page }) => {
    await gotoApp(page);
    const splitView = page.getByTestId("split-view");
    await expect(splitView).toBeVisible();
  });

  test("has sidebar and detail panes", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("detail")).toBeVisible();
  });

  test("shows connection status bar", async ({ page }) => {
    await gotoApp(page);
    await seedConnection(page, "checking");
    await expect(page.getByTestId("connection-bar")).toBeVisible();
  });

  test("shows Sessions header", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByText("Sessions")).toBeVisible();
  });

  test("shows new session button", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("new-session")).toBeVisible();
    await expect(page.getByTestId("new-session")).toHaveText("+ New Session");
  });

  test("shows select a session placeholder", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Select a session",
    );
  });
});

test.describe("Connection status", () => {
  test("shows Disconnected when not connected", async ({ page }) => {
    await gotoApp(page);
    await seedConnection(page, "disconnected");

    const bar = page.getByTestId("connection-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByText("Disconnected")).toBeVisible();
  });

  test("updates reactively when connection status changes", async ({
    page,
  }) => {
    await gotoApp(page);
    await seedConnection(page, "checking");
    await expect(page.getByTestId("connection-bar")).toBeVisible();

    await seedConnection(page, "connected", "myserver.local");

    await expect(
      page.getByTestId("connection-bar").getByText("myserver.local"),
    ).toBeVisible();
  });
});

test.describe("New session button", () => {
  test("is disabled when not connected", async ({ page }) => {
    await gotoApp(page);
    await seedConnection(page, "disconnected");

    await expect(page.getByTestId("new-session")).toBeDisabled();
  });

  test("is enabled when connected", async ({ page }) => {
    await gotoApp(page);
    await seedConnection(page, "connected");

    await expect(page.getByTestId("new-session")).toBeEnabled();
  });
});

test.describe("Session in sidebar", () => {
  test("session appears when facts are injected", async ({ page }) => {
    await gotoApp(page);
    await insertFacts(page, [
      ["session", "test-session", "agent", "claude"],
      ["session", "test-session", "status", "active"],
    ]);

    await expect(page.getByText("claude — test-session")).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();
  });

  test("clicking session selects it", async ({ page }) => {
    await gotoApp(page);
    await insertFacts(page, [
      ["session", "test-session", "agent", "claude"],
      ["session", "test-session", "status", "active"],
    ]);

    await page.getByText("claude — test-session").click();
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Session: test-session",
    );
  });
});

test.describe("Messages", () => {
  async function setupSession(page: Page) {
    await gotoApp(page);
    await seedSession(page);
  }

  test("user text message renders", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["message", "s1", "msg-1", "user", "text", "Hello world"],
    ]);
    await expect(page.getByText("Hello world")).toBeVisible();
    await expect(page.getByText(">")).toBeVisible();
  });

  test("assistant text message renders", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["message", "s1", "msg-2", "assistant", "text", "Hi there!"],
    ]);
    await expect(page.getByText("Hi there!")).toBeVisible();
  });

  test("thought message renders dimmed", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      [
        "message",
        "s1",
        "t1",
        "assistant",
        "thought",
        "Let me think about this...",
      ],
    ]);
    await expect(page.getByText("Let me think about this...")).toBeVisible();
  });

  test("tool use message renders", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["message", "s1", "tc-1", "assistant", "toolUse", "Read file"],
    ]);
    await expect(page.getByText("Read file")).toBeVisible();
    await expect(page.getByText("~")).toBeVisible();
  });

  test("tool result renders", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["message", "s1", "tc-1-result", "tool", "toolResult", "completed"],
    ]);
    await expect(
      page.locator(".message").filter({ hasText: "completed" }),
    ).toBeVisible();
  });

  test("mode change message renders", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["message", "s1", "mc1", "system", "modeChange", "architect"],
    ]);
    await expect(page.getByText("Mode: architect")).toBeVisible();
  });
});

test.describe("Mode badge", () => {
  test("renders when currentMode fact exists", async ({ page }) => {
    await gotoApp(page);
    await insertFacts(page, [
      ["session", "s1", "agent", "claude"],
      ["session", "s1", "status", "active"],
      ["session", "s1", "currentMode", "architect"],
    ]);
    await expect(page.getByText("[architect]")).toBeVisible();
  });
});

test.describe("Plan entries", () => {
  test("render with status indicators", async ({ page }) => {
    await gotoApp(page);
    await seedSession(page);
    await insertFacts(page, [
      ["plan", "s1", "entry-0", "Read the file", "completed", "high"],
      ["plan", "s1", "entry-1", "Fix the bug", "in_progress", "medium"],
      ["plan", "s1", "entry-2", "Run tests", "pending", "low"],
    ]);

    await expect(page.getByText("Read the file")).toBeVisible();
    await expect(page.getByText("Fix the bug")).toBeVisible();
    await expect(page.getByText("Run tests")).toBeVisible();
    await expect(page.getByText("[done]")).toBeVisible();
    await expect(page.getByText("[...]")).toBeVisible();
    await expect(page.getByText("[ ]")).toBeVisible();
    await expect(page.getByText("!")).toBeVisible();
  });
});

test.describe("Streaming indicators", () => {
  async function setupSession(page: Page) {
    await gotoApp(page);
    await seedSession(page);
  }

  test("streaming thought shows", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["session", "s1", "streamingThought", "Analyzing the code..."],
    ]);
    await expect(page.getByText("Analyzing the code...")).toBeVisible();
  });

  test("streaming text shows", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [
      ["session", "s1", "streamingText", "Here is my response so far"],
    ]);
    await expect(page.getByText("Here is my response so far")).toBeVisible();
  });

  test("active tools indicator shows", async ({ page }) => {
    await setupSession(page);
    await insertFacts(page, [["session", "s1", "hasActiveTools", "true"]]);
    await expect(page.getByText("Tools running...")).toBeVisible();
  });
});

test.describe("Input", () => {
  test("input field appears when session selected", async ({ page }) => {
    await gotoApp(page);
    await seedSession(page);
    await expect(page.getByTestId("message-input")).toBeVisible();
  });

  test("input field hidden when no session selected", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("message-input")).not.toBeVisible();
  });

  test("submits typed message for the selected session", async ({ page }) => {
    await gotoApp(page);
    await seedSession(page);
    await page.evaluate(() => {
      const manager = (window as any).sessionManager;
      manager.sessionStatuses.set("s1", "active");
      manager.sendMessage = (sessionId: string, text: string) => {
        (window as any).__db.insert(
          "message",
          sessionId,
          "submitted-message",
          "user",
          "text",
          text,
        );
      };
    });

    const input = page.getByTestId("message-input");
    await input.fill("Hello from the browser");
    await input.press("Enter");

    await expect(page.getByText("Hello from the browser")).toBeVisible();
    await expect(input).toHaveValue("");
  });
});

test.describe("Sandbox-agent server integration", () => {
  test("sends a normal agent prompt and renders the streamed response", async ({
    page,
  }) => {
    await startBackendSession(page);

    const input = page.getByTestId("message-input");
    await input.fill("hello from e2e");
    await input.press("Enter");

    await expect(page.getByText("hello from e2e")).toBeVisible();
    await expect(page.getByText("sandbox-agent heard: hello from e2e")).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("starts a terminal through sandbox-agent process endpoints", async ({
    page,
  }) => {
    await startBackendSession(page);

    await page.getByTestId("new-terminal").click();

    await expect(page.getByTestId("terminal-panel")).toBeVisible();
    await expect(page.getByTestId("terminal-tabs")).toContainText("connected");

    const terminal = page.getByTestId("terminal-output");
    await expect(terminal).toContainText("$");
    await terminal.click();
    await page.keyboard.type("pwd");
    await page.keyboard.press("Enter");

    await expect(terminal).toContainText("pwd");
    await expect(terminal).toContainText("/");
  });
});
