import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { select } from "../select";

beforeEach(() => {
  db.clear();
});

// Helper: emit a mini VDOM tree as facts
function emitTree() {
  // <div class="app" id="app">
  //   <div class="sidebar">
  //     <button class="session-row" id="session-s1">
  //     <button class="session-row" id="session-s2">
  //   </div>
  //   <div class="detail" id="detail">
  //     <div class="connection-bar hstack">
  //     <div class="message-list">
  //       <div class="message fg-blue">
  //       <div class="message fg-purple">
  //     </div>
  //   </div>
  // </div>
  db.assert("app", "tag", "div");
  db.assert("app", "class", "app");
  db.assert("app", "prop", "id", "app");
  db.assert("dom", "child", 0, "app");

  db.assert("app:0", "tag", "div");
  db.assert("app:0", "class", "sidebar");
  db.assert("app", "child", 0, "app:0");

  db.assert("session-s1", "tag", "button");
  db.assert("session-s1", "class", "session-row");
  db.assert("session-s1", "prop", "id", "session-s1");
  db.assert("app:0", "child", 0, "session-s1");

  db.assert("session-s2", "tag", "button");
  db.assert("session-s2", "class", "session-row");
  db.assert("session-s2", "prop", "id", "session-s2");
  db.assert("app:0", "child", 1, "session-s2");

  db.assert("detail", "tag", "div");
  db.assert("detail", "class", "detail");
  db.assert("detail", "prop", "id", "detail");
  db.assert("app", "child", 1, "detail");

  db.assert("detail:0", "tag", "div");
  db.assert("detail:0", "class", "connection-bar");
  db.assert("detail:0", "class", "hstack");
  db.assert("detail", "child", 0, "detail:0");

  db.assert("detail:1", "tag", "div");
  db.assert("detail:1", "class", "message-list");
  db.assert("detail", "child", 1, "detail:1");

  db.assert("detail:1:0", "tag", "div");
  db.assert("detail:1:0", "class", "message");
  db.assert("detail:1:0", "class", "fg-blue");
  db.assert("detail:1", "child", 0, "detail:1:0");

  db.assert("detail:1:1", "tag", "div");
  db.assert("detail:1:1", "class", "message");
  db.assert("detail:1:1", "class", "fg-purple");
  db.assert("detail:1", "child", 1, "detail:1:1");
}

describe("select — tag selectors", () => {
  it("matches by tag name", () => {
    emitTree();
    const buttons = select("button");
    expect(buttons).toHaveLength(2);
    expect(buttons.map(e => e.id).sort()).toEqual(["session-s1", "session-s2"]);
  });
});

describe("select — class selectors", () => {
  it("matches by single class", () => {
    emitTree();
    const rows = select(".session-row");
    expect(rows).toHaveLength(2);
  });

  it("matches by compound classes", () => {
    emitTree();
    const bars = select(".connection-bar.hstack");
    expect(bars).toHaveLength(1);
    expect(bars[0].id).toBe("detail:0");
  });
});

describe("select — id selectors", () => {
  it("matches by #id", () => {
    emitTree();
    const detail = select("#detail");
    expect(detail).toHaveLength(1);
    expect(detail[0].tag).toBe("div");
    expect(detail[0].classes).toContain("detail");
  });

  it("matches by #id for session buttons", () => {
    emitTree();
    const s1 = select("#session-s1");
    expect(s1).toHaveLength(1);
    expect(s1[0].tag).toBe("button");
  });
});

describe("select — attribute selectors", () => {
  it("matches by attribute value", () => {
    emitTree();
    const s2 = select('[id="session-s2"]');
    expect(s2).toHaveLength(1);
    expect(s2[0].id).toBe("session-s2");
  });
});

describe("select — descendant combinator", () => {
  it("matches descendants", () => {
    emitTree();
    const messages = select(".detail .message");
    expect(messages).toHaveLength(2);
  });

  it("doesn't match non-descendants", () => {
    emitTree();
    const wrong = select(".sidebar .message");
    expect(wrong).toHaveLength(0);
  });
});

describe("select — child combinator", () => {
  it("matches direct children", () => {
    emitTree();
    const directChildren = select(".sidebar > button");
    expect(directChildren).toHaveLength(2);
  });

  it("doesn't match non-direct descendants", () => {
    emitTree();
    // Messages are inside message-list, not direct children of detail
    const wrong = select("#detail > .message");
    expect(wrong).toHaveLength(0);
  });
});

describe("select — compound + combinator", () => {
  it("matches compound with descendant", () => {
    emitTree();
    const blueMessages = select(".message-list .message.fg-blue");
    expect(blueMessages).toHaveLength(1);
    expect(blueMessages[0].id).toBe("detail:1:0");
  });
});

describe("select — rich return type", () => {
  it("returns VdomElement with tag, classes, and props", () => {
    emitTree();
    const bars = select(".connection-bar");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      id: "detail:0",
      tag: "div",
      classes: ["connection-bar", "hstack"],
      props: {},
    });
  });

  it("includes id in props", () => {
    emitTree();
    const detail = select("#detail");
    expect(detail[0].props).toEqual({ id: "detail" });
  });
});
