// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { styled, createStyledContext } from "../styled";
import { createTokens } from "../tokens";
import { createThemes, setTheme, Theme, useThemeName } from "../themes";
import { createFont } from "../fonts";
import { createMedia } from "../media";
import { setDefaultFont, setAnimations } from "../settings";
import { render, css, mediaCss, resetUI, injectedRules } from "../testing";

beforeEach(() => {
  resetUI();
  createTokens({
    size: { "2": 32, "4": 44, true: 44 },
    space: { "2": 8, "4": 16, true: 16 },
    radius: { "2": 6, "4": 9, true: 9 },
    color: { blue9: "#0090ff" },
  });
  createThemes({
    light: { background: "#fff", backgroundHover: "#eee", color: "#111", borderColor: "#ccc", shadowColor: "rgba(0,0,0,0.1)" },
    dark: { background: "#000", backgroundHover: "#222", color: "#eee", borderColor: "#333", shadowColor: "rgba(0,0,0,0.6)" },
    light_blue: { background: "#e6f4ff", color: "#003" },
    light_Button: { background: "#f4f4f4" },
    light_Card: { background: "#fafafa" },
  });
  setTheme("light");
});

describe("styled basics", () => {
  it("renders the base tag with an is_ class and atomic classes", () => {
    const Box = styled("div", { name: "Box", defaultProps: { display: "flex", padding: 10 } });
    const r = render(h(Box, null, "hi"));
    expect(r.root.tagName).toBe("DIV");
    expect(r.root.classList.contains("is_Box")).toBe(true);
    expect(css(r.root)).toMatchObject({ display: "flex", padding: "10px" });
  });

  it("passes through non-style props and skips control props", () => {
    const Box = styled("div", { name: "Box" });
    const r = render(h(Box, { id: "my-box", "data-testid": "t", theme: "dark" }));
    expect(r.root.id).toBe("my-box");
    expect(r.root.getAttribute("data-testid")).toBe("t");
    expect(r.root.hasAttribute("theme")).toBe(false);
  });

  it("inline props override defaults, later declarations win", () => {
    const Box = styled("div", { defaultProps: { padding: 8, margin: 4 } });
    const r = render(h(Box, { padding: 20 }));
    expect(css(r.root).padding).toBe("20px");
    expect(css(r.root).margin).toBe("4px");
  });

  it("expands shorthands and virtual props", () => {
    const Box = styled("div");
    const r = render(h(Box, { p: 10, bg: "red", paddingHorizontal: 4, inset: 0 }));
    expect(css(r.root)).toMatchObject({
      "padding-top": "10px",
      "padding-bottom": "10px",
      "background-color": "red",
      "padding-left": "4px",
      "padding-right": "4px",
      top: "0px",
      left: "0px",
    });
    expect(css(r.root).padding).toBeUndefined();
  });

  it("expands shorthands so later longhands win regardless of class injection order", () => {
    const Line = styled("div", { defaultProps: { borderBottomWidth: 1, borderStyle: "solid" } });
    render(h(Line, {}));
    const Reset = styled("div", {
      defaultProps: { borderWidth: 0, borderStyle: "solid" },
      variants: { line: { true: { borderBottomWidth: 1 } } },
    });
    const r = render(h(Reset, { line: true }));
    expect(css(r.root)).toMatchObject({
      "border-top-width": "0px",
      "border-bottom-width": "1px",
      "border-top-style": "solid",
    });
    expect(css(r.root)["border-width"]).toBeUndefined();
  });

  it("merges class/className props with generated classes", () => {
    const Box = styled("div", { defaultProps: { padding: 10 } });
    const r = render(h(Box, { class: "custom", className: "other" }));
    expect(r.root.classList.contains("custom")).toBe(true);
    expect(r.root.classList.contains("other")).toBe(true);
    expect(Array.from(r.root.classList).some((c) => c.startsWith("_padtop-"))).toBe(true);
  });

  it("passes an inline style prop through untouched", () => {
    const Box = styled("div");
    const r = render(h(Box, { style: "width: 3px" }));
    expect(r.root.getAttribute("style")).toContain("width: 3px");
  });

  it("supports the tag override prop and config", () => {
    const Box = styled("div");
    expect(render(h(Box, { tag: "section" })).root.tagName).toBe("SECTION");
    const Para = styled(Box, { tag: "p" });
    expect(render(h(Para, null)).root.tagName).toBe("P");
  });

  it("sets displayName", () => {
    expect(styled("div", { name: "MyBox" }).displayName).toBe("MyBox");
    expect(styled("div", {}).displayName).toBe("Styled(div)");
  });
});

describe("token and theme resolution", () => {
  it("resolves qualified and bare token refs", () => {
    const Box = styled("div", { defaultProps: { padding: "$space.4", margin: "$2", width: "$4", borderRadius: "$true" } });
    const r = render(h(Box, null));
    expect(css(r.root)).toMatchObject({ padding: "16px", margin: "8px", width: "44px", "border-radius": "9px" });
  });

  it("resolves color tokens for any prop", () => {
    const Box = styled("div", { defaultProps: { borderColor: "$blue9" } });
    expect(css(render(h(Box, null)).root)["border-color"]).toBe("#0090ff");
  });

  it("resolves theme refs to CSS variables and injects the theme rule", () => {
    const Box = styled("div", { defaultProps: { backgroundColor: "$background", hoverStyle: { backgroundColor: "$backgroundHover" } } });
    const r = render(h(Box, null));
    expect(css(r.root)["background-color"]).toBe("var(--background)");
    expect(css(r.root, ":hover")["background-color"]).toBe("var(--backgroundHover)");
    const themeRule = injectedRules().find((rule) => rule.startsWith(".t_light "));
    expect(themeRule).toContain("--background: #fff");
    expect(document.documentElement.classList.contains("t_light")).toBe(true);
  });

  it("emits pseudo, media and placeholder rules", () => {
    createMedia({ sm: { maxWidth: 600 }, lg: { minWidth: 1000 } });
    const Box = styled("input", {
      defaultProps: {
        focusStyle: { outlineWidth: 2 },
        placeholderStyle: { color: "gray" },
        $sm: { padding: 2, hoverStyle: { padding: 3 } },
        $lg: { padding: 20 },
      },
    });
    const r = render(h(Box, null));
    expect(css(r.root, ":focus")["outline-width"]).toBe("2px");
    expect(css(r.root, "::placeholder").color).toBe("gray");
    expect(mediaCss(r.root, "(max-width: 600px)").padding).toBe("2px");
    expect(mediaCss(r.root, "(min-width: 1000px)").padding).toBe("20px");
    expect(injectedRules().some((rule) => rule.includes(":root:root:root .") && rule.includes("(min-width: 1000px)"))).toBe(true);
  });

  it("ranks pseudo rules so press beats hover and media beats both, whatever the injection order", () => {
    const Early = styled("div", { defaultProps: { pressStyle: { opacity: 0.5 } } });
    const Late = styled("div", { defaultProps: { hoverStyle: { opacity: 0.8 }, pressStyle: { opacity: 0.5 }, $sm: { opacity: 1 } } });
    render(h(Early, null));
    const r = render(h(Late, null));
    const rules = injectedRules();
    const rootsBefore = (selectorFor: string) => {
      const rule = rules.find((text) => text.includes(selectorFor));
      expect(rule, selectorFor).toBeDefined();
      return (rule!.match(/:root/g) ?? []).length;
    };
    const hoverClass = Array.from(r.root.classList).find((c) => c.includes("-hover-"))!;
    const pressClass = Array.from(r.root.classList).find((c) => c.includes("-active-"))!;
    const mediaClass = Array.from(r.root.classList).find((c) => c.includes("-m-"))!;
    expect(rootsBefore(`.${hoverClass}:hover`)).toBe(2);
    expect(rootsBefore(`.${pressClass}:active`)).toBe(3);
    expect(rootsBefore(`.${mediaClass}`)).toBeGreaterThan(5);
    expect(css(r.root, ":hover").opacity).toBe("0.8");
    expect(css(r.root, ":active").opacity).toBe("0.5");
  });

  it("applies disabledStyle inline when disabled and forwards the attribute", () => {
    const Btn = styled("button", { defaultProps: { opacity: 1, disabledStyle: { opacity: 0.5 } }, variants: { disabled: { true: { pointerEvents: "none" } } } });
    const r = render(h(Btn, { disabled: true }));
    expect(r.root.hasAttribute("disabled")).toBe(true);
    expect(css(r.root).opacity).toBe("0.5");
    expect(css(r.root)["pointer-events"]).toBe("none");
  });

  it("maps animation names to transitions, never easing the focus ring in", () => {
    setAnimations({ quick: "150ms ease-out" });
    const Box = styled("div");
    expect(css(render(h(Box, { animation: "quick" })).root).transition).toBe(
      "all 150ms ease-out, outline-color 0s, outline-width 0s, outline-offset 0s",
    );
    const el = render(h(Box, { animation: "quick", animateOnly: ["opacity", "backgroundColor"] })).root;
    expect(css(el).transition).toBe("opacity 150ms ease-out, background-color 150ms ease-out");
    expect(el.hasAttribute("animateOnly")).toBe(false);
  });
});

describe("themes on elements", () => {
  it("applies the theme class chain for a theme prop and provides it to children", () => {
    const Box = styled("div", { defaultProps: { color: "$color" } });
    const Probe = () => h("i", { "data-theme": useThemeName() });
    const r = render(h(Box, { theme: "blue" }, h(Probe, null)));
    expect(Array.from(r.root.classList)).toEqual(expect.arrayContaining(["t_light", "t_light_blue"]));
    expect(r.get("i").getAttribute("data-theme")).toBe("light_blue");
    expect(injectedRules().some((rule) => rule.startsWith(".t_light_blue ") && rule.includes("--background: #e6f4ff"))).toBe(true);
  });

  it("themeInverse flips the scheme", () => {
    const Box = styled("div");
    const r = render(h(Box, { themeInverse: true }));
    expect(r.root.classList.contains("t_dark")).toBe(true);
  });

  it("selects a component theme by name when one exists", () => {
    const Button = styled("button", { name: "Button" });
    const r = render(h(Button, null));
    expect(Array.from(r.root.classList)).toEqual(expect.arrayContaining(["t_light", "t_light_Button", "is_Button"]));
    const Plain = styled("div", { name: "Nope" });
    expect(render(h(Plain, null)).root.className).not.toContain("t_");
  });

  it("never nests one component theme inside another", () => {
    const Card = styled("div", { name: "Card" });
    const Button = styled("button", { name: "Button" });
    const r = render(h(Card, null, h(Button, null), h(Button, { theme: "blue" })));
    const [plain, blue] = Array.from(r.container.querySelectorAll("button"));
    expect(Array.from(plain.classList)).toEqual(expect.arrayContaining(["t_light", "t_light_Button"]));
    expect(plain.className).not.toContain("t_light_Card");
    expect(Array.from(blue.classList)).toEqual(expect.arrayContaining(["t_light", "t_light_blue"]));
  });

  it("the Theme component wraps children in a display: contents span", () => {
    const Probe = () => h("i", { "data-theme": useThemeName() });
    const r = render(h(Theme, { name: "dark" }, h(Probe, null)));
    expect(r.root.tagName).toBe("SPAN");
    expect(r.root.classList.contains("t_dark")).toBe(true);
    expect(r.root.getAttribute("style")).toContain("display: contents");
    expect(r.get("i").getAttribute("data-theme")).toBe("dark");
  });
});

describe("variants", () => {
  it("matches exact keys and booleans", () => {
    const Box = styled("div", {
      variants: {
        size: { sm: { padding: 4 }, lg: { padding: 12 } },
        active: { true: { opacity: 1 }, false: { opacity: 0.5 } },
      },
      defaultVariants: { size: "sm", active: false },
    });
    expect(css(render(h(Box, null)).root)).toMatchObject({ padding: "4px", opacity: "0.5" });
    expect(css(render(h(Box, { size: "lg", active: true })).root)).toMatchObject({ padding: "12px", opacity: "1" });
    expect(render(h(Box, { size: "lg" })).root.hasAttribute("size")).toBe(false);
  });

  it("spreads token categories and accepts bare or $ keys", () => {
    const Box = styled("div", {
      variants: {
        size: {
          "...size": (value: string, { tokens }) => ({ height: tokens.size[value], width: tokens.size[value] }),
          ":number": (value: number) => ({ height: value }),
        },
      },
    });
    expect(css(render(h(Box, { size: "$2" })).root).height).toBe("32px");
    expect(css(render(h(Box, { size: "4" })).root).height).toBe("44px");
    expect(css(render(h(Box, { size: 12 })).root).height).toBe("12px");
  });

  it("supports bare-function variants with extras", () => {
    const Box = styled("div", {
      variants: {
        elev: (value: number, { theme, tokens }) => ({ shadowColor: theme.shadowColor, shadowRadius: value, shadowOffset: { width: 0, height: tokens.space["2"] } }),
      },
    });
    expect(css(render(h(Box, { elev: 3 })).root)["box-shadow"]).toBe("0px 8px 3px var(--shadowColor)");
  });

  it("treats variant keys inside a variant result as defaults", () => {
    const Box = styled("div", {
      variants: {
        unstyled: { false: { size: "lg", color: "red" } },
        size: { sm: { padding: 4 }, lg: { padding: 12 } },
      },
      defaultVariants: { unstyled: false },
    });
    expect(css(render(h(Box, null)).root)).toMatchObject({ padding: "12px", color: "red" });
    expect(css(render(h(Box, { size: "sm" })).root).padding).toBe("4px");
    expect(css(render(h(Box, { unstyled: true })).root).padding).toBeUndefined();
  });

  it("unstyled drops default styles but keeps variants", () => {
    const Box = styled("div", { defaultProps: { padding: 8 }, variants: { big: { true: { margin: 2 } } } });
    const s = css(render(h(Box, { unstyled: true, big: true })).root);
    expect(s.padding).toBeUndefined();
    expect(s.margin).toBe("2px");
  });

  it("a wrapper that defaults to unstyled keeps the styles declared with it", () => {
    const Base = styled("button", { defaultProps: { padding: 8, color: "red" } });
    const Bare = styled(Base, { defaultProps: { unstyled: true, color: "blue" } });
    const Ext = styled(Bare, { defaultProps: { margin: 2 } });
    expect(css(render(h(Bare, null)).root)).toMatchObject({ color: "blue" });
    expect(css(render(h(Bare, null)).root).padding).toBeUndefined();
    expect(css(render(h(Ext, null)).root)).toMatchObject({ color: "blue", margin: "2px" });
    expect(css(render(h(Ext, { unstyled: true })).root).margin).toBeUndefined();
    expect(css(render(h(Ext, { unstyled: false })).root).padding).toBe("8px");
  });

  it("merges variants one level deep when extending", () => {
    const Base = styled("div", { variants: { unstyled: { false: { padding: 4, color: "red" } } }, defaultVariants: { unstyled: false } });
    const Ext = styled(Base, { variants: { unstyled: { false: { color: "blue", margin: 1 } } } });
    expect(css(render(h(Ext, null)).root)).toMatchObject({ padding: "4px", color: "blue", margin: "1px" });
  });

  it("deep-merges pseudo objects in defaultProps when extending", () => {
    const Base = styled("div", { defaultProps: { hoverStyle: { color: "red", padding: 1 } } });
    const Ext = styled(Base, { defaultProps: { hoverStyle: { color: "blue" } } });
    expect(css(render(h(Ext, null)).root, ":hover")).toMatchObject({ color: "blue", padding: "1px" });
  });
});

describe("fonts", () => {
  beforeEach(() => {
    createFont("body", { family: "Inter", size: { "2": 12, "4": 14, true: 14 }, lineHeight: { "2": 16, "4": 20 }, weight: { "2": "400", "4": "500" } });
    createFont("heading", { family: "Georgia", size: { "2": 20, "4": 28, true: 28 }, weight: { "4": "700" } });
    setDefaultFont("body");
  });

  it("resolves fontFamily tokens to family strings and font-size tokens from that font", () => {
    const T = styled("span", { defaultProps: { fontFamily: "$heading", fontSize: "$4", fontWeight: "$4" } });
    expect(css(render(h(T, null)).root)).toMatchObject({ "font-family": "Georgia", "font-size": "28px", "font-weight": "700" });
  });

  it("isText components default to the configured font", () => {
    const T = styled("span", { isText: true, defaultProps: { fontSize: "$2", lineHeight: "$2" } });
    expect(css(render(h(T, null)).root)).toMatchObject({ "font-family": "Inter", "font-size": "12px", "line-height": "16px" });
  });

  it("exposes the font in variant extras", () => {
    const T = styled("span", { isText: true, variants: { size: (value: string, { font }) => ({ fontSize: font!.size[value] }) } });
    expect(css(render(h(T, { size: "$4" })).root)["font-size"]).toBe("14px");
    expect(css(render(h(T, { size: "$4", fontFamily: "$heading" })).root)["font-size"]).toBe("28px");
  });
});

describe("styled context", () => {
  const Ctx = createStyledContext<{ size?: string; color?: string }>({ size: undefined, color: undefined });
  const Frame = styled("div", { context: Ctx, variants: { size: { sm: { padding: 2 }, lg: { padding: 20 } } } });
  const Label = styled("span", { context: Ctx, variants: { size: { sm: { fontSize: 10 }, lg: { fontSize: 30 } } } });

  it("passes variant values from a parent to descendants", () => {
    const r = render(h(Frame, { size: "lg" }, h(Label, null, "x")));
    expect(css(r.get("span"))["font-size"]).toBe("30px");
    expect(r.root.hasAttribute("size")).toBe(false);
  });

  it("lets explicit props on descendants win", () => {
    const r = render(h(Frame, { size: "lg" }, h(Label, { size: "sm" }, "x")));
    expect(css(r.get("span"))["font-size"]).toBe("10px");
  });

  it("applies inherited style props and provides through Provider", () => {
    const r = render(h(Ctx.Provider, { value: { size: "sm", color: "red" } }, h(Label, null, "x")));
    expect(css(r.get("span"))).toMatchObject({ "font-size": "10px", color: "red" });
  });
});

describe("asChild and composition", () => {
  it("asChild merges classes and handlers onto the child", () => {
    let clicks = 0;
    const Trigger = styled("button", { defaultProps: { padding: 3 } });
    const r = render(h(Trigger, { asChild: true, onClick: () => clicks++, "data-x": "1" }, h("a", { href: "#", onClick: () => clicks++, class: "link" }, "go")));
    expect(r.root.tagName).toBe("A");
    expect(r.root.classList.contains("link")).toBe(true);
    expect(css(r.root).padding).toBe("3px");
    expect(r.root.getAttribute("data-x")).toBe("1");
    r.root.click();
    expect(clicks).toBe(2);
  });

  it("extends a plain function component", () => {
    const Base = (props: Record<string, unknown>) => h("section", { class: props.class as string, id: "s" }, props.children as any);
    const Styled = styled(Base, { defaultProps: { padding: 5 } });
    const r = render(h(Styled, null, "x"));
    expect(r.root.tagName).toBe("SECTION");
    expect(css(r.root).padding).toBe("5px");
  });

  it("composes styled components", () => {
    const Base = styled("div", { name: "Base", defaultProps: { display: "flex" } });
    const Extended = styled(Base, { name: "Extended", defaultProps: { flexDirection: "column" } });
    const r = render(h(Extended, null));
    expect(css(r.root)).toMatchObject({ display: "flex", "flex-direction": "column" });
    expect(r.root.classList.contains("is_Extended")).toBe(true);
  });
});
