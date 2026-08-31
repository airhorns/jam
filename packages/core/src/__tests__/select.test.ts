import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { autorun, transaction } from "../reactive";
import { select, VdomIndex } from "../select";

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
  db.insert("app", "tag", "div");
  db.insert("app", "class", "app");
  db.insert("app", "prop", "id", "app");
  db.insert("dom", "child", 0, "app");

  db.insert("app:0", "tag", "div");
  db.insert("app:0", "class", "sidebar");
  db.insert("app", "child", 0, "app:0");

  db.insert("session-s1", "tag", "button");
  db.insert("session-s1", "class", "session-row");
  db.insert("session-s1", "prop", "id", "session-s1");
  db.insert("app:0", "child", 0, "session-s1");

  db.insert("session-s2", "tag", "button");
  db.insert("session-s2", "class", "session-row");
  db.insert("session-s2", "prop", "id", "session-s2");
  db.insert("app:0", "child", 1, "session-s2");

  db.insert("detail", "tag", "div");
  db.insert("detail", "class", "detail");
  db.insert("detail", "prop", "id", "detail");
  db.insert("app", "child", 1, "detail");

  db.insert("detail:0", "tag", "div");
  db.insert("detail:0", "class", "connection-bar");
  db.insert("detail:0", "class", "hstack");
  db.insert("detail", "child", 0, "detail:0");

  db.insert("detail:1", "tag", "div");
  db.insert("detail:1", "class", "message-list");
  db.insert("detail", "child", 1, "detail:1");

  db.insert("detail:1:0", "tag", "div");
  db.insert("detail:1:0", "class", "message");
  db.insert("detail:1:0", "class", "fg-blue");
  db.insert("detail:1", "child", 0, "detail:1:0");

  db.insert("detail:1:1", "tag", "div");
  db.insert("detail:1:1", "class", "message");
  db.insert("detail:1:1", "class", "fg-purple");
  db.insert("detail:1", "child", 1, "detail:1:1");
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

  it("reports an element without classes or props as empty", () => {
    db.insert("bare", "tag", "hr");
    expect(select("hr")).toEqual([{ id: "bare", tag: "hr", classes: [], props: {} }]);
  });
});

describe("select — selector syntax", () => {
  it("tolerates surrounding whitespace and matches nothing for a blank selector", () => {
    emitTree();
    expect(select("  button ")).toHaveLength(2);
    expect(select("")).toEqual([]);
    expect(select("   ")).toEqual([]);
  });

  it("accepts unquoted and single-quoted attribute values", () => {
    emitTree();
    expect(select("[id=session-s1]").map((e) => e.id)).toEqual(["session-s1"]);
    expect(select("[id='session-s2']").map((e) => e.id)).toEqual(["session-s2"]);
    expect(select("[id=nope]")).toEqual([]);
  });

  it("rejects characters it does not support instead of guessing", () => {
    expect(() => select("button, div")).toThrow('unsupported character ","');
    expect(() => select("div:hover")).toThrow('unsupported character ":"');
    expect(() => select("*")).toThrow('unsupported character "*"');
  });
});

describe("select — change tracking", () => {
  it("re-runs an effect only when the matched elements change", () => {
    emitTree();
    const seen: string[][] = [];
    const stop = autorun(() => seen.push(select(".message").map((e) => e.classes.join(" "))));
    expect(seen).toHaveLength(1);

    db.insert("detail:1:0", "prop", "title", "first");
    db.drain();
    expect(seen).toHaveLength(2);
    expect(select(".message")[0].props).toEqual({ title: "first" });

    db.insert("unrelated", "tag", "p");
    db.drain();
    expect(seen).toHaveLength(2);

    transaction(() => {
      db.drop("detail:1:1", "class", "fg-purple");
      db.insert("detail:1:1", "class", "fg-red");
    });
    expect(seen).toHaveLength(3);
    expect(seen[2]).toEqual(["fg-blue message", "fg-red message"]);
    stop();
  });

  it("notices when a matched element changes tag, classes or props", () => {
    db.insert("x", "tag", "div");
    db.insert("x", "class", "box");
    const before = select(".box");
    expect(select(".box")).toBe(before);

    db.drop("x", "tag", "div");
    db.insert("x", "tag", "section");
    expect(select(".box")[0].tag).toBe("section");

    db.insert("x", "class", "wide");
    expect(select(".box")[0].classes).toEqual(["box", "wide"]);

    db.insert("x", "prop", "title", "a");
    expect(select(".box")[0].props).toEqual({ title: "a" });

    db.drop("x", "prop", "title", "a");
    db.insert("x", "prop", "title", "b");
    expect(select(".box")[0].props).toEqual({ title: "b" });

    db.drop("x", "class", "box");
    db.insert("y", "tag", "div");
    db.insert("y", "class", "box");
    expect(select(".box").map((e) => e.id)).toEqual(["y"]);
  });
});

describe("VdomIndex", () => {
  it("stops following the database once disposed", () => {
    const index = new VdomIndex();
    db.insert("x", "tag", "div");
    db.drain();
    expect(index.tags.get("x")).toBe("div");
    index.dispose();
    db.insert("y", "tag", "span");
    db.drain();
    expect(index.tags.has("y")).toBe(false);
  });
});
