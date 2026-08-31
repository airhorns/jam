// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, resetUI, injectedRules } from "../testing";
import { createThemes, setTheme, setThemeClassTarget, updateTheme, injectThemeCSS, ensureThemeCSS, Theme, useThemeName } from "../themes";

beforeEach(() => {
  resetUI();
  createThemes({
    light: { background: "#fff", color: "#111" },
    light_blue: { background: "#eef" },
    light_blue_Button: { background: "#dde" },
    dark: { background: "#000", color: "#eee" },
  });
});

afterEach(() => {
  setThemeClassTarget("html");
});

const themeRules = () => injectedRules().filter((rule) => rule.startsWith(".t_"));
const selectorOf = (rule: string) => rule.slice(0, rule.indexOf(" {"));

describe("root theme class", () => {
  it("replaces earlier theme classes, keeps other classes and injects the body rule once", () => {
    document.documentElement.classList.add("app");
    setTheme("light_blue");
    expect(Array.from(document.documentElement.classList)).toEqual(["app", "t_light", "t_light_blue"]);
    setTheme("dark");
    expect(Array.from(document.documentElement.classList)).toEqual(["app", "t_dark"]);
    expect(injectedRules().filter((rule) => rule.startsWith("body"))).toHaveLength(1);
  });

  it("can target the body or no element at all", () => {
    setThemeClassTarget("body");
    setTheme("light");
    expect(document.body.classList.contains("t_light")).toBe(true);
    expect(document.documentElement.classList.contains("t_light")).toBe(false);

    setThemeClassTarget(false);
    setTheme("dark");
    expect(document.body.classList.contains("t_dark")).toBe(false);
    expect(document.documentElement.classList.contains("t_dark")).toBe(false);
  });
});

describe("theme CSS", () => {
  it("injects a theme's parents before it and only once", () => {
    ensureThemeCSS("light_blue_Button");
    ensureThemeCSS("light_blue");
    expect(themeRules().map(selectorOf)).toEqual([".t_light", ".t_light_blue", ".t_light_blue_Button"]);
    expect(themeRules()[1]).toContain("--background: #eef");
  });

  it("ignores unknown themes", () => {
    ensureThemeCSS("nope");
    expect(themeRules()).toEqual([]);
  });

  it("injectThemeCSS emits every registered theme", () => {
    injectThemeCSS();
    expect(themeRules().map(selectorOf)).toEqual([".t_light", ".t_light_blue", ".t_light_blue_Button", ".t_dark"]);
  });

  it("rewrites an injected theme's rule in place when it is updated", () => {
    setTheme("light_blue");
    const before = themeRules().map(selectorOf);
    updateTheme("light_blue", { background: "#abc", color: "#123" });
    expect(themeRules().map(selectorOf)).toEqual(before);
    const rule = themeRules().find((text) => text.startsWith(".t_light_blue "))!;
    expect(rule).toContain("--background: #abc");
    expect(rule).toContain("--color: #123");
    expect(themeRules().find((text) => text.startsWith(".t_light "))).toContain("--background: #fff");
  });

  it("still applies theme classes when the style element has no stylesheet", () => {
    const style = document.createElement("style");
    style.id = "jam-ui-themes";
    Object.defineProperty(style, "sheet", { get: () => null });
    document.head.appendChild(style);
    setTheme("light_blue");
    updateTheme("light_blue", { background: "#abc" });
    expect(document.documentElement.classList.contains("t_light_blue")).toBe(true);
    expect(injectedRules()).toEqual([]);
  });

  it("leaves the sheet alone when the updated theme's rule is no longer in it", () => {
    setTheme("light_blue");
    document.getElementById("jam-ui-themes")!.remove();
    updateTheme("light_blue", { background: "#abc" });
    expect(injectedRules()).toEqual([]);
    expect(document.getElementById("jam-ui-themes")).not.toBeNull();
  });

  it("applies the theme once the body exists when targeting a body that is not there yet", () => {
    setThemeClassTarget("body");
    const body = document.body;
    body.remove();
    setTheme("light");
    expect(document.documentElement.classList.contains("t_light")).toBe(false);
    document.documentElement.appendChild(body);
    setTheme("light");
    expect(body.classList.contains("t_light")).toBe(true);
  });
});

describe("Theme component", () => {
  const Probe = () => h("i", { "data-theme": useThemeName() ?? "none" });

  it("renders a bare span when the name resolves to the parent theme", () => {
    setTheme("light");
    const r = render(h(Theme, { name: "nope" }, h(Probe, null), h(Probe, null)));
    expect(r.root.tagName).toBe("SPAN");
    expect(r.root.className).toBe("");
    expect(r.all("i").map((el) => el.dataset.theme)).toEqual(["light", "light"]);
  });

  it("renders without children", () => {
    const r = render(h(Theme, { name: "dark" }));
    expect(r.root.classList.contains("t_dark")).toBe(true);
    expect(r.root.childElementCount).toBe(0);
  });

  it("inverts the scheme for its subtree", () => {
    setTheme("light");
    const r = render(h(Theme, { inverse: true }, h(Probe, null)));
    expect(r.root.classList.contains("t_dark")).toBe(true);
    expect(r.get("i").dataset.theme).toBe("dark");
  });
});
