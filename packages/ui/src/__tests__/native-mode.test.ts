import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@jam/core";
import { emitVdom } from "@jam/core/jsx";
import { h } from "@jam/core/jsx";
import {
  Button,
  Card,
  Checkbox,
  H1,
  Input,
  Progress,
  RadioGroup,
  ScrollView,
  Slider,
  Switch,
  Tabs,
  Text,
  TextArea,
  XStack,
  YStack,
  createJamUI,
} from "../index";
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

  it("emits catalog-level component tags and resolved styles for Swift native rendering", () => {
    createJamUI({
      tokens: {
        size: { "2": 16, "3": 24, "4": 32 },
        space: { "2": 8, "3": 12, "4": 16 },
        radius: { "2": 8, "3": 12 },
        color: {
          surface: "#ffffff",
          text: "#172033",
          teal: "#007f73",
          border: "#d7dee8",
        },
        zIndex: { "1": 10 },
      },
      themes: {
        light: {
          background: "#f8fafc",
          backgroundHover: "#edf2f7",
          backgroundPress: "#e2e8f0",
          backgroundFocus: "#2f6fcb",
          borderColor: "#d7dee8",
          borderColorHover: "#95a3b8",
          borderColorFocus: "#2f6fcb",
          color: "#172033",
          outlineColor: "#2f6fcb",
        },
      },
      defaultTheme: "light",
    });
    setNativeMode(true);

    const vnode = h(ScrollView, { id: "catalog-root", flex: 1, backgroundColor: "$background" },
      h(YStack, { gap: "$space.4", padding: "$space.4" },
        h(Card, { id: "foundation-card", backgroundColor: "$color.surface", borderColor: "$color.border" },
          h(H1, { color: "$color.text" }, "@jam/ui native contract"),
          h(Text, { color: "$color.teal" }, "Catalog proof"),
        ),
        h(XStack, { gap: "$space.3", alignItems: "center" },
          h(Button, { id: "primary-button", onClick: () => undefined }, h(Text, {}, "Primary")),
          h(Input, { id: "name-input", placeholder: "Ada Lovelace" }),
          h(TextArea, { id: "notes-input", placeholder: "Native notes" }),
        ),
        h(XStack, { gap: "$space.3", alignItems: "center" },
          h(Checkbox, { id: "accepted", checked: true }, h(Checkbox.Indicator, {}, h(Text, {}, "ok"))),
          h(Switch, { id: "notifications", checked: true }),
          h(Slider, { id: "progress-slider", value: [82], min: 0, max: 100 }),
        ),
        h(RadioGroup, { value: "native", orientation: "horizontal" },
          h(RadioGroup.Item, { id: "radio-web", value: "web", checked: false }),
          h(RadioGroup.Item, { id: "radio-native", value: "native", checked: true },
            h(RadioGroup.Indicator, {}),
          ),
        ),
        h(Progress, { id: "progress", value: 82, max: 100 },
          h(Progress.Indicator, { width: "82%" }),
        ),
        h(Tabs, { value: "overview" },
          h(Tabs.List, {},
            h(Tabs.Tab, { id: "tab-overview" }, h(Text, {}, "Overview")),
            h(Tabs.Tab, { id: "tab-native" }, h(Text, {}, "Native")),
          ),
          h(Tabs.Content, {}, h(Text, {}, "Native mode emits style facts.")),
        ),
      ),
    );

    runInAction(() => {
      db.emitCollector = new Set();
      emitVdom(vnode, "dom", 0);
      db.emitCollector = null;
    });

    const facts = Array.from(db.facts.values());
    const tags = facts.filter(f => f[1] === "tag").map(f => f[2]);
    expect(tags).toEqual(expect.arrayContaining([
      "ScrollView",
      "YStack",
      "Card",
      "H1",
      "Button",
      "Input",
      "TextArea",
      "CheckboxFrame",
      "SwitchFrame",
      "SliderFrame",
      "RadioGroupFrame",
      "RadioItemFrame",
      "RadioGroupIndicator",
      "ProgressFrame",
      "ProgressIndicator",
      "TabsFrame",
      "TabsList",
      "TabsTab",
      "TabsContent",
    ]));

    const rootStyleFacts = facts.filter(f => f[0] === "catalog-root" && f[1] === "style");
    expect(rootStyleFacts).toContainEqual(["catalog-root", "style", "backgroundColor", "#f8fafc"]);
    expect(rootStyleFacts).toContainEqual(["catalog-root", "style", "flex", 1]);

    const buttonFacts = facts.filter(f => f[0] === "primary-button");
    expect(buttonFacts).toContainEqual(["primary-button", "handler", "click", "primary-button:handler:click"]);

    const sliderProps = facts.filter(f => f[0] === "progress-slider" && f[1] === "prop");
    expect(sliderProps).toContainEqual(["progress-slider", "prop", "aria-valuenow", "82"]);
    expect(sliderProps).toContainEqual(["progress-slider", "prop", "aria-valuemax", "100"]);

    const progressProps = facts.filter(f => f[0] === "progress" && f[1] === "prop");
    expect(progressProps).toContainEqual(["progress", "prop", "aria-valuenow", "82"]);
    expect(progressProps).toContainEqual(["progress", "prop", "role", "progressbar"]);

    const classFacts = facts.filter(f => f[1] === "class");
    expect(classFacts).toHaveLength(0);
  });
});
