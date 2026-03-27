// Tests for puddy extension programs.
// These verify the folk-style pattern: programs read app-state facts
// and claim VDOM decorations, without modifying components.

import { describe, it, expect, beforeEach } from "vitest";
import { db, $, assert, set, retract, _ } from "@jam/core";

// We can't import the programs directly (they use whenever which
// creates long-lived reactions), so we test the fact patterns they
// rely on and verify the claims would work.

beforeEach(() => {
  db.clear();
});

describe("session-highlights pattern", () => {
  it("active sessions have addressable elements via key", () => {
    assert("session", "s-1", "agent", "claude");
    assert("session", "s-1", "status", "active");

    // The component would render <button key="s-1"> → entity "k:s-1"
    // The program claims: ["k:s-1", "class", "session-active"]
    // Verify the pattern match works:
    const matches = db.query(["session", $.sid, "status", "active"]);
    expect(matches).toEqual([{ sid: "s-1" }]);

    // Simulate what the program does:
    for (const { sid } of matches) {
      db.assert(`k:${sid}`, "class", "session-active");
    }

    // Verify the class claim exists in the unified fact DB
    expect(db.query([`k:s-1`, "class", "session-active"])).toHaveLength(1);
  });

  it("status transitions update highlights", () => {
    assert("session", "s-1", "status", "starting");
    let matches = db.query(["session", $.sid, "status", "active"]);
    expect(matches).toHaveLength(0);

    // Transition to active
    retract("session", "s-1", "status", "starting");
    assert("session", "s-1", "status", "active");
    matches = db.query(["session", $.sid, "status", "active"]);
    expect(matches).toHaveLength(1);
  });
});

describe("error-tooltips pattern", () => {
  it("joins session status with statusDetail", () => {
    assert("session", "s-1", "status", "failed");
    assert("session", "s-1", "statusDetail", "Connection refused");

    const matches = db.query(
      ["session", $.sid, "status", "failed"],
      ["session", $.sid, "statusDetail", $.reason],
    );
    expect(matches).toEqual([{ sid: "s-1", reason: "Connection refused" }]);

    // Program would claim a title prop:
    for (const { sid, reason } of matches) {
      db.assert(`k:${sid}`, "prop", "title", `Error: ${reason}`);
    }
    expect(db.query([`k:s-1`, "prop", "title", $.val])).toEqual([
      { val: "Error: Connection refused" },
    ]);
  });
});

describe("message-counts pattern", () => {
  it("counts messages per session", () => {
    assert("message", "s-1", "m1", "user", "text", "hello");
    assert("message", "s-1", "m2", "assistant", "text", "hi");
    assert("message", "s-2", "m3", "user", "text", "test");

    const messages = db.query(["message", $.sid, $.msgId, $.sender, $.kind, $.content]);

    const counts = new Map<string, number>();
    for (const { sid } of messages) {
      counts.set(sid as string, (counts.get(sid as string) ?? 0) + 1);
    }

    expect(counts.get("s-1")).toBe(2);
    expect(counts.get("s-2")).toBe(1);
  });
});

describe("cost-display pattern (VDOM query)", () => {
  it("can query VDOM facts to find elements by class", () => {
    // Simulate component emitting a connection-bar element
    db.assert("e42", "tag", "div");
    db.assert("e42", "class", "connection-bar");

    // Query VDOM facts to find the element
    const bars = db.query([$.el, "class", "connection-bar"]);
    expect(bars).toHaveLength(1);
    expect(bars[0].el).toBe("e42");
  });

  it("can join app-state cost with VDOM element", () => {
    // App state
    set("session", "s-1", "costAmount", 0.0042);
    set("session", "s-1", "costCurrency", "USD");

    // VDOM
    db.assert("e42", "class", "connection-bar");

    // The program joins these:
    const matches = db.query(
      ["session", $.sid, "costAmount", $.amount],
      ["session", $.sid, "costCurrency", $.currency],
      [$.el, "class", "connection-bar"],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].amount).toBe(0.0042);
    expect(matches[0].el).toBe("e42");
  });

  it("LIMITATION: element ID changes on re-render", () => {
    // First render: connection-bar gets e42
    db.assert("e42", "class", "connection-bar");
    db.assert("e42", "prop", "title", "cost info");

    // Simulate re-render: old facts retracted, new emitted with different ID
    db.retract("e42", "class", "connection-bar");
    db.retract("e42", "prop", "title", "cost info");
    db.assert("e99", "class", "connection-bar");

    // The old claim on e42 is gone. Need to re-claim on e99.
    // This works but means the whenever fires on every re-render.
    const bars = db.query([$.el, "class", "connection-bar"]);
    expect(bars).toHaveLength(1);
    expect(bars[0].el).toBe("e99"); // new ID
  });
});
