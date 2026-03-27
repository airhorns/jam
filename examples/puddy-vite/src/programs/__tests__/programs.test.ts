// Tests for puddy extension programs.
// Run the actual whenever logic and verify claims appear in the DB.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { h } from "@jam/core/jsx";
import { db, $, assert, set, retract, _, whenever, claim, select, injectVdom } from "@jam/core";

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
  const d = whenever(
    [["session", $.sid, "status", $.status]],
    (sessions) => {
      for (const { sid, status } of sessions) {
        const elId = `session-${sid}`;
        if (status === "active") claim(elId, "class", "session-active");
        else if (status === "failed") claim(elId, "class", "session-failed");
        else if (status === "ended") claim(elId, "class", "session-ended");
      }
    },
  );
  disposers.push(d);
}

function startErrorTooltips() {
  const d = whenever(
    [["session", $.sid, "status", "failed"], ["session", $.sid, "statusDetail", $.reason]],
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
        injectVdom(`session-${sid}`, 1000,
          h("span", { class: "msg-count-badge" }, String(count)),
        );
      }
    },
  );
  disposers.push(d);
}

function startCostDisplay() {
  const connectionBars = select(".connection-bar");
  const d = whenever(
    [["session", $.sid, "costAmount", $.amount], ["session", $.sid, "costCurrency", $.currency]],
    (sessions) => {
      let totalCost = 0;
      let currency = "USD";
      for (const { amount, currency: cur } of sessions) {
        totalCost += amount as number;
        currency = cur as string;
      }
      const label = `Total cost: ${currency} ${totalCost.toFixed(4)}`;
      for (const el of connectionBars.get()) {
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
    assert("session", "s-1", "status", "active");
    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(1);
  });

  it("claims session-failed class on failed sessions", () => {
    assert("session", "s-2", "status", "failed");
    expect(db.query(["session-s-2", "class", "session-failed"])).toHaveLength(1);
  });

  it("claims session-ended class on ended sessions", () => {
    assert("session", "s-3", "status", "ended");
    expect(db.query(["session-s-3", "class", "session-ended"])).toHaveLength(1);
  });

  it("does not claim on starting sessions", () => {
    assert("session", "s-1", "status", "starting");
    expect(db.query(["session-s-1", "class", $.cls])).toHaveLength(0);
  });

  it("retracts old claim when status changes", () => {
    assert("session", "s-1", "status", "active");
    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(1);

    retract("session", "s-1", "status", "active");
    assert("session", "s-1", "status", "ended");

    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(0);
    expect(db.query(["session-s-1", "class", "session-ended"])).toHaveLength(1);
  });

  it("handles multiple sessions independently", () => {
    assert("session", "s-1", "status", "active");
    assert("session", "s-2", "status", "failed");

    expect(db.query(["session-s-1", "class", "session-active"])).toHaveLength(1);
    expect(db.query(["session-s-2", "class", "session-failed"])).toHaveLength(1);
  });
});

describe("error-tooltips", () => {
  beforeEach(() => startErrorTooltips());

  it("claims title prop on failed session with error detail", () => {
    assert("session", "s-1", "status", "failed");
    assert("session", "s-1", "statusDetail", "Connection refused");

    const props = db.query(["session-s-1", "prop", "title", $.val]);
    expect(props).toHaveLength(1);
    expect(props[0].val).toBe("Error: Connection refused");
  });

  it("does not claim when session is not failed", () => {
    assert("session", "s-1", "status", "active");
    assert("session", "s-1", "statusDetail", "some detail");

    expect(db.query(["session-s-1", "prop", "title", $.val])).toHaveLength(0);
  });

  it("does not claim when statusDetail is missing", () => {
    assert("session", "s-1", "status", "failed");
    expect(db.query(["session-s-1", "prop", "title", $.val])).toHaveLength(0);
  });
});

describe("message-counts", () => {
  beforeEach(() => startMessageCounts());

  it("injects a badge element into the session row", () => {
    // The session button needs to exist as a VDOM entity
    db.assert("session-s-1", "tag", "button");

    assert("message", "s-1", "m1", "user", "text", "hello");
    assert("message", "s-1", "m2", "assistant", "text", "hi");

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
    db.assert("session-s-1", "tag", "button");
    db.assert("session-s-2", "tag", "button");

    assert("message", "s-1", "m1", "user", "text", "hello");
    assert("message", "s-2", "m2", "user", "text", "test");
    assert("message", "s-2", "m3", "assistant", "text", "response");

    // s-1 badge
    const s1Children = db.query(["session-s-1", "child", 1000, $.child]);
    expect(s1Children).toHaveLength(1);

    // s-2 badge
    const s2Children = db.query(["session-s-2", "child", 1000, $.child]);
    expect(s2Children).toHaveLength(1);
  });

  it("updates badge when new messages arrive", () => {
    db.assert("session-s-1", "tag", "button");

    assert("message", "s-1", "m1", "user", "text", "hello");

    // Find badge text
    let children = db.query(["session-s-1", "child", 1000, $.child]);
    let badgeId = children[0].child as string;
    let textChildren = db.query([badgeId, "child", $.idx, $.textEl]);
    let textId = textChildren[0].textEl as string;
    expect(db.query([textId, "text", "1"])).toHaveLength(1);

    // Add another message
    assert("message", "s-1", "m2", "assistant", "text", "hi");

    // Badge should update — the whenever retracts old and re-injects
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
    db.assert("detail:0", "tag", "div");
    db.assert("detail:0", "class", "connection-bar");

    set("session", "s-1", "costAmount", 0.0042);
    set("session", "s-1", "costCurrency", "USD");

    const props = db.query(["detail:0", "prop", "title", $.val]);
    expect(props).toHaveLength(1);
    expect(props[0].val).toBe("Total cost: USD 0.0042");
  });

  it("sums costs across multiple sessions", () => {
    db.assert("cb", "tag", "div");
    db.assert("cb", "class", "connection-bar");

    set("session", "s-1", "costAmount", 0.01);
    set("session", "s-1", "costCurrency", "USD");
    set("session", "s-2", "costAmount", 0.02);
    set("session", "s-2", "costCurrency", "USD");

    const props = db.query(["cb", "prop", "title", $.val]);
    expect(props).toHaveLength(1);
    expect(props[0].val).toBe("Total cost: USD 0.0300");
  });

  it("no claim when no cost data exists", () => {
    db.assert("cb", "tag", "div");
    db.assert("cb", "class", "connection-bar");

    expect(db.query(["cb", "prop", "title", $.val])).toHaveLength(0);
  });
});

describe("select() integration", () => {
  it("finds elements by CSS class", () => {
    db.assert("e1", "tag", "div");
    db.assert("e1", "class", "sidebar");

    const sidebars = select(".sidebar").get();
    expect(sidebars).toHaveLength(1);
    expect(sidebars[0].id).toBe("e1");
    expect(sidebars[0].classes).toContain("sidebar");
  });

  it("finds elements by id", () => {
    db.assert("my-panel", "tag", "div");
    db.assert("my-panel", "prop", "id", "my-panel");

    const panels = select("#my-panel").get();
    expect(panels).toHaveLength(1);
  });

  it("finds descendants with combinator", () => {
    db.assert("root", "tag", "div");
    db.assert("root", "class", "app");
    db.assert("root", "child", 0, "child1");
    db.assert("child1", "tag", "div");
    db.assert("child1", "class", "inner");
    db.assert("child1", "child", 0, "grandchild");
    db.assert("grandchild", "tag", "span");
    db.assert("grandchild", "class", "deep");

    expect(select(".app .deep").get()).toHaveLength(1);
    expect(select(".app > .deep").get()).toHaveLength(0);
    expect(select(".app > .inner").get()).toHaveLength(1);
  });
});
