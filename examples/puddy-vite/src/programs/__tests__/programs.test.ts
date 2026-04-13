// Tests for puddy extension programs.
// Run the actual whenever logic and verify claims appear in the DB.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { h } from "@jam/core/jsx";
import { vi } from "vitest";
import {
  db,
  $,
  remember,
  replace,
  forget,
  _,
  when,
  whenever,
  claim,
  select,
  injectVdom,
} from "@jam/core";

let disposers: (() => void)[] = [];

beforeEach(() => {
  db.clear();
});

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  db.clear();
});

// Replicate program logic inline so each test gets a fresh whenever.

function startSessionHighlights() {
  const d = whenever([["session", $.sid, "status", $.status]], (sessions) => {
    for (const { sid, status } of sessions) {
      const elId = `session-${sid}`;
      if (status === "active") claim(elId, "class", "session-active");
      else if (status === "failed") claim(elId, "class", "session-failed");
      else if (status === "ended") claim(elId, "class", "session-ended");
    }
  });
  disposers.push(d);
}

function startErrorTooltips() {
  const d = whenever(
    [
      ["session", $.sid, "status", "failed"],
      ["session", $.sid, "statusDetail", $.reason],
    ],
    (failed) => {
      for (const { sid, reason } of failed) {
        claim(`session-${sid}`, "prop", "title", `Error: ${reason}`);
      }
    },
  );
  disposers.push(d);
}

function startMessageCounts() {
  const d = whenever(
    [["message", $.sid, $.msgId, $.sender, $.kind, $.content]],
    (messages) => {
      const counts = new Map<string, number>();
      for (const { sid } of messages) {
        counts.set(sid as string, (counts.get(sid as string) ?? 0) + 1);
      }
      for (const [sid, count] of counts) {
        injectVdom(
          `session-${sid}`,
          1000,
          h("span", { class: "msg-count-badge" }, String(count)),
        );
      }
    },
  );
  disposers.push(d);
}

function startCostDisplay() {
  const d = whenever(
    [
      ["session", $.sid, "costAmount", $.amount],
      ["session", $.sid, "costCurrency", $.currency],
    ],
    (sessions) => {
      let totalCost = 0;
      let currency = "USD";
      for (const { amount, currency: cur } of sessions) {
        totalCost += amount as number;
        currency = cur as string;
      }
      const label = `Total cost: ${currency} ${totalCost.toFixed(4)}`;
      for (const el of select(".connection-bar")) {
        claim(el.id, "prop", "title", label);
      }
    },
  );
  disposers.push(d);
}

// --- Tests ---

describe("session-highlights", () => {
  beforeEach(() => startSessionHighlights());

  it("claims session-active class on active sessions", () => {
    replace("session", "s-1", "status", "active");
    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(
      1,
    );
  });

  it("claims session-failed class on failed sessions", () => {
    replace("session", "s-2", "status", "failed");
    expect(db.query(["session-s-2", "class", "session-failed"])).toHaveLength(
      1,
    );
  });

  it("claims session-ended class on ended sessions", () => {
    replace("session", "s-3", "status", "ended");
    expect(db.query(["session-s-3", "class", "session-ended"])).toHaveLength(1);
  });

  it("does not claim on starting sessions", () => {
    replace("session", "s-1", "status", "starting");
    expect(db.query(["session-s-1", "class", $.cls])).toHaveLength(0);
  });

  it("removes old claim when status changes", () => {
    replace("session", "s-1", "status", "active");
    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(
      1,
    );

    replace("session", "s-1", "status", "ended");

    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(
      0,
    );
    expect(db.query(["session-s-1", "class", "session-ended"])).toHaveLength(1);
  });

  it("handles multiple sessions independently", () => {
    replace("session", "s-1", "status", "active");
    replace("session", "s-2", "status", "failed");

    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(
      1,
    );
    expect(db.query(["session-s-2", "class", "session-failed"])).toHaveLength(
      1,
    );
  });
});

describe("error-tooltips", () => {
  beforeEach(() => startErrorTooltips());

  it("claims title prop on failed session with error detail", () => {
    remember("session", "s-1", "status", "failed");
    replace("session", "s-1", "statusDetail", "Connection refused");

    const props = db.query(["session-s-1", "prop", "title", $.val]);
    expect(props).toHaveLength(1);
    expect(props[0].val).toBe("Error: Connection refused");
  });

  it("does not claim when session is not failed", () => {
    replace("session", "s-1", "status", "active");
    replace("session", "s-1", "statusDetail", "some detail");

    expect(db.query(["session-s-1", "prop", "title", $.val])).toHaveLength(0);
  });

  it("does not claim when statusDetail is missing", () => {
    remember("session", "s-1", "status", "failed");
    expect(db.query(["session-s-1", "prop", "title", $.val])).toHaveLength(0);
  });
});

describe("message-counts", () => {
  beforeEach(() => startMessageCounts());

  it("injects a badge element into the session row", () => {
    // The session button needs to exist as a VDOM entity
    db.insert("session-s-1", "tag", "button");

    remember("message", "s-1", "m1", "user", "text", "hello");
    remember("message", "s-1", "m2", "assistant", "text", "hi");

    // Should have a child at index 1000
    const children = db.query(["session-s-1", "child", 1000, $.child]);
    expect(children).toHaveLength(1);

    // The badge element should have the count as text
    const badgeId = children[0].child as string;
    expect(db.query([badgeId, "class", "msg-count-badge"])).toHaveLength(1);

    // Find the text child of the badge
    const textChildren = db.query([badgeId, "child", $.idx, $.textEl]);
    expect(textChildren).toHaveLength(1);
    const textId = textChildren[0].textEl as string;
    expect(db.query([textId, "text", "2"])).toHaveLength(1);
  });

  it("counts per session independently", () => {
    db.insert("session-s-1", "tag", "button");
    db.insert("session-s-2", "tag", "button");

    remember("message", "s-1", "m1", "user", "text", "hello");
    remember("message", "s-2", "m2", "user", "text", "test");
    remember("message", "s-2", "m3", "assistant", "text", "response");

    // s-1 badge
    const s1Children = db.query(["session-s-1", "child", 1000, $.child]);
    expect(s1Children).toHaveLength(1);

    // s-2 badge
    const s2Children = db.query(["session-s-2", "child", 1000, $.child]);
    expect(s2Children).toHaveLength(1);
  });

  it("updates badge when new messages arrive", () => {
    db.insert("session-s-1", "tag", "button");

    remember("message", "s-1", "m1", "user", "text", "hello");

    // Find badge text
    let children = db.query(["session-s-1", "child", 1000, $.child]);
    let badgeId = children[0].child as string;
    let textChildren = db.query([badgeId, "child", $.idx, $.textEl]);
    let textId = textChildren[0].textEl as string;
    expect(db.query([textId, "text", "1"])).toHaveLength(1);

    // Add another message
    remember("message", "s-1", "m2", "assistant", "text", "hi");

    // Badge should update — the whenever removes old and re-injects
    children = db.query(["session-s-1", "child", 1000, $.child]);
    badgeId = children[0].child as string;
    textChildren = db.query([badgeId, "child", $.idx, $.textEl]);
    textId = textChildren[0].textEl as string;
    expect(db.query([textId, "text", "2"])).toHaveLength(1);
  });
});

describe("cost-display", () => {
  beforeEach(() => startCostDisplay());

  it("claims cost tooltip on connection-bar element found via select()", () => {
    db.insert("detail:0", "tag", "div");
    db.insert("detail:0", "class", "connection-bar");

    replace("session", "s-1", "costAmount", 0.0042);
    replace("session", "s-1", "costCurrency", "USD");

    const props = db.query(["detail:0", "prop", "title", $.val]);
    expect(props).toHaveLength(1);
    expect(props[0].val).toBe("Total cost: USD 0.0042");
  });

  it("sums costs across multiple sessions", () => {
    db.insert("cb", "tag", "div");
    db.insert("cb", "class", "connection-bar");

    replace("session", "s-1", "costAmount", 0.01);
    replace("session", "s-1", "costCurrency", "USD");
    replace("session", "s-2", "costAmount", 0.02);
    replace("session", "s-2", "costCurrency", "USD");

    const props = db.query(["cb", "prop", "title", $.val]);
    expect(props).toHaveLength(1);
    expect(props[0].val).toBe("Total cost: USD 0.0300");
  });

  it("no claim when no cost data exists", () => {
    db.insert("cb", "tag", "div");
    db.insert("cb", "class", "connection-bar");

    expect(db.query(["cb", "prop", "title", $.val])).toHaveLength(0);
  });
});

describe("select() integration", () => {
  it("finds elements by CSS class", () => {
    db.insert("e1", "tag", "div");
    db.insert("e1", "class", "sidebar");

    const sidebars = select(".sidebar");
    expect(sidebars).toHaveLength(1);
    expect(sidebars[0].id).toBe("e1");
    expect(sidebars[0].classes).toContain("sidebar");
  });

  it("finds elements by id", () => {
    db.insert("my-panel", "tag", "div");
    db.insert("my-panel", "prop", "id", "my-panel");

    const panels = select("#my-panel");
    expect(panels).toHaveLength(1);
  });

  it("finds descendants with combinator", () => {
    db.insert("root", "tag", "div");
    db.insert("root", "class", "app");
    db.insert("root", "child", 0, "child1");
    db.insert("child1", "tag", "div");
    db.insert("child1", "class", "inner");
    db.insert("child1", "child", 0, "grandchild");
    db.insert("grandchild", "tag", "span");
    db.insert("grandchild", "class", "deep");

    expect(select(".app .deep")).toHaveLength(1);
    expect(select(".app > .deep")).toHaveLength(0);
    expect(select(".app > .inner")).toHaveLength(1);
  });
});

describe("permissions-mode", () => {
  function startPermissionsMode(sendMessageSpy: ReturnType<typeof vi.fn>) {
    const mockSessionManager = { sendMessage: sendMessageSpy } as any;

    // Replicate the program logic with a mock session manager
    const initDispose = whenever(
      [["session", $.sid, "status", $.status]],
      (sessions) => {
        for (const { sid } of sessions) {
          const existing = when(["permissions", sid, "mode", $.mode]);
          if (existing.length === 0) {
            replace("permissions", sid, "mode", "default");
          }
        }
      },
    );

    const uiDispose = whenever(
      [["ui", "selectedSession", $.sid]],
      (selections) => {
        const sid = selections[0]?.sid as string;
        if (!sid) return;

        const currentMode = when(["permissions", sid, "mode", $.mode]);
        const mode = (currentMode[0]?.mode as string) ?? "default";

        injectVdom(
          "detail-header",
          1000,
          h(
            "div",
            {
              id: "permissions-toggle",
              class: "permissions-toggle hstack gap-4",
            },
            h(
              "button",
              {
                class: `perm-btn ${mode === "default" ? "perm-btn-active" : ""}`,
                onClick: () => {
                  replace("permissions", sid, "mode", "default");
                  mockSessionManager.sendMessage(
                    sid,
                    "/permissions-mode default",
                  );
                },
              },
              "Default",
            ),
            h(
              "button",
              {
                class: `perm-btn ${mode === "plan" ? "perm-btn-active" : ""}`,
                onClick: () => {
                  replace("permissions", sid, "mode", "plan");
                  mockSessionManager.sendMessage(sid, "/permissions-mode plan");
                },
              },
              "Plan",
            ),
            h(
              "button",
              {
                class: `perm-btn ${mode === "bypassPermissions" ? "perm-btn-active" : ""}`,
                onClick: () => {
                  replace("permissions", sid, "mode", "bypassPermissions");
                  mockSessionManager.sendMessage(
                    sid,
                    "/permissions-mode bypassPermissions",
                  );
                },
              },
              "YOLO",
            ),
          ),
        );
      },
    );

    disposers.push(initDispose, uiDispose);
  }

  it("initializes default permissions mode for new sessions", () => {
    const spy = vi.fn();
    startPermissionsMode(spy);

    replace("session", "s-1", "status", "active");

    expect(db.query(["permissions", "s-1", "mode", $.mode])).toEqual([
      { mode: "default" },
    ]);
  });

  it("injects toggle bar into detail-header when session selected", () => {
    const spy = vi.fn();
    startPermissionsMode(spy);

    // Simulate VDOM: detail-header exists
    db.insert("detail-header", "tag", "div");
    db.insert("detail-header", "prop", "id", "detail-header");

    replace("session", "s-1", "status", "active");
    replace("ui", "selectedSession", "s-1");

    // Check the toggle was injected as a child of detail-header
    const children = db.query(["detail-header", "child", 1000, $.child]);
    expect(children).toHaveLength(1);

    // The injected element should be the permissions toggle
    const toggleId = children[0].child as string;
    expect(db.query([toggleId, "class", "permissions-toggle"])).toHaveLength(1);
  });

  it("toggle buttons reflect current mode", () => {
    const spy = vi.fn();
    startPermissionsMode(spy);

    db.insert("detail-header", "tag", "div");
    replace("session", "s-1", "status", "active");
    replace("ui", "selectedSession", "s-1");

    // Find the toggle's children (the buttons)
    const toggleChildren = db.query(["detail-header", "child", 1000, $.toggle]);
    const toggleId = toggleChildren[0]?.toggle as string;
    const buttons = db.query([toggleId, "child", $.idx, $.btn]);

    // Default mode: first button should have perm-btn-active class
    const firstBtn = buttons.find((b) => b.idx === 0)?.btn as string;
    expect(db.query([firstBtn, "class", "perm-btn-active"])).toHaveLength(1);
  });

  it("clicking toggle updates the permissions fact", () => {
    const spy = vi.fn();
    startPermissionsMode(spy);

    replace("session", "s-1", "status", "active");
    replace("ui", "selectedSession", "s-1");

    // Initial mode
    expect(db.query(["permissions", "s-1", "mode", $.m])).toEqual([
      { m: "default" },
    ]);

    // Simulate clicking "plan" mode
    replace("permissions", "s-1", "mode", "plan");

    expect(db.query(["permissions", "s-1", "mode", $.m])).toEqual([
      { m: "plan" },
    ]);
  });

  it("does not reinitialize mode for existing sessions", () => {
    const spy = vi.fn();
    startPermissionsMode(spy);

    replace("session", "s-1", "status", "active");
    expect(db.query(["permissions", "s-1", "mode", $.m])).toEqual([
      { m: "default" },
    ]);

    // Change to plan
    replace("permissions", "s-1", "mode", "plan");

    // Status change should NOT reset the mode
    replace("session", "s-1", "status", "ended");

    expect(db.query(["permissions", "s-1", "mode", $.m])).toEqual([
      { m: "plan" },
    ]);
  });
});
