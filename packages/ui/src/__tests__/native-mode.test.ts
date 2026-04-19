import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@jam/core";
import { emitVdom } from "@jam/core/jsx";
import { h } from "@jam/core/jsx";
import { styled } from "../styled";
import { setNativeMode } from "../native-mode";
import { createTokens } from "../tokens";
import { createThemes, setTheme } from "../themes";
import { runInAction } from "mobx";

describe("native mode", () => {
  beforeEach(() => {
    db.clear();
    setNativeMode(false);
  });

  afterEach(() => {
    setNativeMode(false);
  });

  it("emits style facts instead of class facts when native mode is on", () => {
    setNativeMode(true);

    const Box = styled("div", {
      name: "Box",
      defaultProps: {
        padding: 16,
        backgroundColor: "red",
      },
    });

    const vnode = Box({});
    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const facts = Array.from(db.facts.values());

    // Should have tag "Box" (displayName), not "div"
    const tagFact = facts.find(f => f[0] === "dom:0" && f[1] === "tag");
    expect(tagFact).toBeDefined();
    expect(tagFact![2]).toBe("Box");

    // Should have style facts
    const styleFacts = facts.filter(f => f[0] === "dom:0" && f[1] === "style");
    expect(styleFacts.length).toBeGreaterThan(0);

    const paddingFact = styleFacts.find(f => f[2] === "padding");
    expect(paddingFact).toBeDefined();
    expect(paddingFact![3]).toBe(16);

    const bgFact = styleFacts.find(f => f[2] === "backgroundColor");
    expect(bgFact).toBeDefined();
    expect(bgFact![3]).toBe("red");

    // Should NOT have class facts
    const classFacts = facts.filter(f => f[0] === "dom:0" && f[1] === "class");
    expect(classFacts.length).toBe(0);
  });

  it("uses component displayName as tag", () => {
    setNativeMode(true);

    const MyButton = styled("button", {
      name: "MyButton",
      defaultProps: { padding: 8 },
    });

    const vnode = MyButton({});
    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const tagFact = Array.from(db.facts.values()).find(f => f[0] === "dom:0" && f[1] === "tag");
    expect(tagFact![2]).toBe("MyButton");
  });

  it("resolves token refs in native mode", () => {
    createTokens({
      space: { "4": 16 },
      size: {},
      radius: {},
      color: {},
      zIndex: {},
    });
    setNativeMode(true);

    const Box = styled("div", {
      name: "Box",
      defaultProps: { padding: "$space.4" },
    });

    const vnode = Box({});
    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const styleFacts = Array.from(db.facts.values()).filter(f => f[0] === "dom:0" && f[1] === "style");
    const paddingFact = styleFacts.find(f => f[2] === "padding");
    expect(paddingFact).toBeDefined();
    expect(paddingFact![3]).toBe(16);
  });

  it("resolves theme refs in native mode", () => {
    createThemes({
      dark: { background: "#0d1117", color: "#c9d1d9" },
    });
    setTheme("dark");
    setNativeMode(true);

    const Box = styled("div", {
      name: "Box",
      defaultProps: { backgroundColor: "$background" },
    });

    const vnode = Box({});
    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const styleFacts = Array.from(db.facts.values()).filter(f => f[0] === "dom:0" && f[1] === "style");
    const bgFact = styleFacts.find(f => f[2] === "backgroundColor");
    expect(bgFact).toBeDefined();
    expect(bgFact![3]).toBe("#0d1117");
  });

  it("restores web behavior when native mode is off", () => {
    setNativeMode(false);

    const Box = styled("div", {
      name: "Box",
      defaultProps: { padding: 16 },
    });

    const vnode = Box({});
    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const facts = Array.from(db.facts.values());

    // Should have tag "div" (HTML tag), not "Box"
    const tagFact = facts.find(f => f[0] === "dom:0" && f[1] === "tag");
    expect(tagFact![2]).toBe("div");

    // Should have class facts, not style facts
    const classFacts = facts.filter(f => f[0] === "dom:0" && f[1] === "class");
    expect(classFacts.length).toBeGreaterThan(0);

    const styleFacts = facts.filter(f => f[0] === "dom:0" && f[1] === "style");
    expect(styleFacts.length).toBe(0);
  });

  it("emits children correctly in native mode", () => {
    setNativeMode(true);

    const Box = styled("div", { name: "Box" });

    const vnode = Box({ children: h("span", null, "hello") });
    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const facts = Array.from(db.facts.values());

    // Should have child relationship
    const childFact = facts.find(f => f[0] === "dom:0" && f[1] === "child");
    expect(childFact).toBeDefined();
  });
});
