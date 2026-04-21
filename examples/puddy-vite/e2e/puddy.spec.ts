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

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));

  expect(widths.documentScroll).toBeLessThanOrEqual(widths.documentClient + 1);
  expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient + 1);
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
  const sessionRow = page.locator(".session-row").filter({ hasText: "mock" }).last();
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

  test("shows workspace controls", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("sidebar").getByText("Workspaces")).toBeVisible();
    await expect(page.getByTestId("workspace-list")).toBeVisible();
    await expect(page.getByTestId("new-workspace")).toHaveText("+ Workspace");
    await expect(page.getByTestId("workspace-0")).toContainText("Alt+1");
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

test.describe("Meta agent", () => {
  test("meta-agent smoke: inspects Jam state and loads a browser program", async ({
    page,
  }) => {
    await gotoApp(page);

    const panel = page.getByTestId("meta-agent-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("/programs/puddy-meta-note.js");

    await page
      .getByTestId("meta-agent-input")
      .fill("inspect facts and the UI, then write a Jam program");
    await page.getByTestId("meta-agent-send").click();

    await expect(panel).toContainText("Jam app summary");
    await expect(panel).toContainText("Jam facts");
    await expect(panel).toContainText("Jam VDOM");
    await expect(panel).toContainText("Wrote program file");
    await expect(panel).toContainText("Loaded program");
    await expect(panel).toContainText("/programs/meta-agent-demo.js");
    await expect(panel).toContainText(
      "I inspected the Jam app from inside the browser",
    );

    const proof = await page.evaluate(() => {
      const facts = Array.from((window as any).__db.facts.values()) as Fact[];
      return {
        fileWritten: facts.some(
          (fact) =>
            fact[0] === "jamProgramFile" &&
            fact[1] === "/programs/meta-agent-demo.js" &&
            fact[2] === "size" &&
            Number(fact[3]) > 0,
        ),
        programFileLoaded: facts.some(
          (fact) =>
            fact[0] === "jamProgramFile" &&
            fact[1] === "/programs/meta-agent-demo.js" &&
            fact[2] === "programId" &&
            fact[3] === "meta-agent-demo",
        ),
        programLoaded: facts.some(
          (fact) =>
            fact[0] === "meta-agent-demo" &&
            fact[1] === "status" &&
            fact[2] === "loaded",
        ),
        promptCaptured: facts.some(
          (fact) =>
            fact[0] === "meta-agent-demo" &&
            fact[1] === "prompt" &&
            String(fact[2]).includes("inspect facts"),
        ),
      };
    });

    expect(proof).toEqual({
      fileWritten: true,
      programFileLoaded: true,
      programLoaded: true,
      promptCaptured: true,
    });
  });
});

test.describe("Workspaces", () => {
  test("creates and switches workspaces from the sidebar", async ({ page }) => {
    await gotoApp(page);

    await page.getByTestId("new-workspace").click();
    await expect(page.getByTestId("workspace-1")).toContainText("Workspace 2");
    await expect(page.getByTestId("detail-title")).toHaveText("Select a session");

    const selectedWorkspace = await page.evaluate(() =>
      (Array.from((window as any).__db.facts.values()) as Fact[]).filter(
        (fact: Fact) => fact[0] === "ui" && fact[1] === "selectedWorkspace",
      ),
    );
    expect(JSON.stringify(selectedWorkspace)).toContain("workspace-");
  });

  test("filters sessions by active workspace and restores selection", async ({
    page,
  }) => {
    await gotoApp(page);
    const workspaceIds = await page.evaluate(() => {
      const db = (window as any).__db;
      const defaultWorkspace = "default";
      const otherWorkspace = "workspace-test";
      db.insert("workspace", otherWorkspace, "name", "Project B");
      db.insert("workspace", otherWorkspace, "createdAt", 1);
      db.insert("session", "s-default", "agent", "claude");
      db.insert("session", "s-default", "workspace", defaultWorkspace);
      db.replace("session", "s-default", "status", "active");
      db.insert("session", "s-other", "agent", "codex");
      db.insert("session", "s-other", "workspace", otherWorkspace);
      db.replace("session", "s-other", "status", "active");
      db.replace("workspace", defaultWorkspace, "selectedSession", "s-default");
      db.replace("workspace", otherWorkspace, "selectedSession", "s-other");
      db.replace("ui", "selectedWorkspace", defaultWorkspace);
      db.replace("ui", "selectedSession", "s-default");
      return { defaultWorkspace, otherWorkspace };
    });

    await expect(page.getByText("claude — s-default")).toBeVisible();
    await expect(page.getByText("codex — s-other")).not.toBeVisible();
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Session: s-default",
    );

    await page.getByTestId("workspace-1").click();

    await expect(page.getByText("codex — s-other")).toBeVisible();
    await expect(page.getByText("claude — s-default")).not.toBeVisible();
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Session: s-other",
    );

    await page.keyboard.press("Alt+1");

    await expect(page.getByText("claude — s-default")).toBeVisible();
    await expect(page.getByTestId("detail-title")).toHaveText(
      "Session: s-default",
    );
    expect(workspaceIds.defaultWorkspace).toBe("default");
  });

  test("scopes terminal panels and workspace items to the active workspace", async ({
    page,
  }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      const db = (window as any).__db;
      db.insert("workspace", "workspace-test", "name", "Project B");
      db.insert("workspace", "workspace-test", "createdAt", 1);
      db.insert("session", "s-default", "agent", "claude");
      db.insert("session", "s-default", "workspace", "default");
      db.replace("session", "s-default", "status", "active");
      db.insert("session", "s-other", "agent", "codex");
      db.insert("session", "s-other", "workspace", "workspace-test");
      db.replace("session", "s-other", "status", "active");
      db.insert("terminal", "term-default", "session", "s-default");
      db.insert("terminal", "term-default", "workspace", "default");
      db.replace("terminal", "term-default", "status", "connected");
      db.insert("terminal", "term-other", "session", "s-other");
      db.insert("terminal", "term-other", "workspace", "workspace-test");
      db.replace("terminal", "term-other", "status", "connected");
      db.replace("terminal", "term-default", "cwd", "/default");
      db.replace("terminal", "term-other", "cwd", "/project-b");
      db.insert("workspaceItem", "item-default", "workspace", "default");
      db.insert("workspaceItem", "item-default", "label", "Default notes");
      db.insert("workspaceItem", "item-other", "workspace", "workspace-test");
      db.insert("workspaceItem", "item-other", "label", "Project B notes");
      db.replace("workspace", "default", "selectedSession", "s-default");
      db.replace("workspace", "workspace-test", "selectedSession", "s-other");
      db.replace("ui", "selectedWorkspace", "default");
      db.replace("ui", "selectedSession", "s-default");
    });

    await expect(page.getByText("Default notes")).toBeVisible();
    await expect(page.getByText("Project B notes")).not.toBeVisible();
    await expect(page.getByTestId("terminal-panel")).toContainText("/default");

    await page.getByTestId("workspace-1").click();

    await expect(page.getByText("Project B notes")).toBeVisible();
    await expect(page.getByText("Default notes")).not.toBeVisible();
    await expect(page.getByTestId("terminal-panel")).toContainText("/project-b");
  });
});

test.describe("Mobile layout", () => {
  test("switches between workspaces, session, terminal, and meta panels without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await seedConnection(page, "connected", "mobile-sandbox.local");
    await insertFacts(page, [
      ["session", "s-mobile", "agent", "mock"],
      ["session", "s-mobile", "workspace", "default"],
      ["session", "s-mobile", "status", "active"],
      ["message", "s-mobile", "msg-1", "assistant", "text", "Mobile ready"],
      ["terminal", "term-mobile", "session", "s-mobile"],
      ["terminal", "term-mobile", "workspace", "default"],
      ["terminal", "term-mobile", "status", "connected"],
    ]);
    await replaceFacts(page, [
      ["ui", "selectedSession", "s-mobile"],
      ["workspace", "default", "selectedSession", "s-mobile"],
      ["terminal", "term-mobile", "cwd", "/mobile"],
    ]);
    await page.evaluate(() => {
      const manager = (window as any).sessionManager;
      manager.sessionStatuses.set("s-mobile", "active");
      manager.sendMessage = (sessionId: string, text: string) => {
        (window as any).__db.insert(
          "message",
          sessionId,
          "mobile-submitted-message",
          "user",
          "text",
          text,
        );
      };
    });

    await expect(page.getByTestId("mobile-panel-tabs")).toBeVisible();
    await expect(page.getByTestId("detail")).toBeVisible();
    await expect(page.getByTestId("detail-title")).toHaveText("Session: s-mobile");
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("mobile-panel-workspaces").click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await page.getByTestId("new-workspace").click();
    await expect(page.getByTestId("workspace-1")).toContainText("Workspace 2");
    await page.getByTestId("workspace-0").click();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("mobile-panel-session").click();
    await expect(page.getByTestId("mobile-session-tabs")).toBeVisible();
    await expect(page.getByTestId("mobile-session-chat")).toBeVisible();
    await expect(page.getByTestId("mobile-session-terminal")).toBeVisible();
    await expect(page.getByText("Mobile ready")).toBeVisible();
    await expect(page.getByTestId("terminal-panel")).not.toBeVisible();
    const input = page.getByTestId("message-input");
    await input.fill("hello from mobile");
    await input.press("Enter");
    await expect(page.getByText("hello from mobile")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("mobile-session-terminal").click();
    await expect(page.getByTestId("terminal-panel")).toBeVisible();
    await expect(page.getByTestId("terminal-panel")).toContainText("/mobile");
    await expect(page.getByTestId("message-input")).not.toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("mobile-session-chat").click();
    await expect(page.getByText("Mobile ready")).toBeVisible();
    await expect(page.getByTestId("message-input")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("mobile-panel-meta").click();
    await expect(page.getByTestId("meta-agent-panel")).toBeVisible();
    await expect(page.getByTestId("meta-agent-input")).toBeVisible();
    await page.getByTestId("meta-agent-input").fill("inspect mobile layout");
    await page.getByTestId("meta-agent-send").click();
    await expect(page.getByTestId("meta-agent-panel")).toContainText("Jam app summary");
    await expectNoHorizontalOverflow(page);
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
    await seedSession(page);
    await insertFacts(page, [["session", "s1", "currentMode", "architect"]]);
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

    await expect(page.getByText("hello from e2e", { exact: true })).toBeVisible();
    await expect(page.getByText("mock echoed: hello from e2e")).toBeVisible();
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
    await terminal.click();
    await page.keyboard.type("pwd");
    await page.keyboard.press("Enter");

    await expect(terminal).toContainText("pwd");
    await expect(terminal).toContainText("/");
  });
});
