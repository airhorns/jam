// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { set, when, $ } from "@jam/core";
import { render, css, click, resetUI, computed, injectedRules } from "../testing";
import { createJamUI } from "../config";
import { styled } from "../styled";
import { Button } from "../components/Button";

beforeEach(() => {
  resetUI();
  createJamUI({
    tokens: { size: { "2": 32, true: 44 }, radius: { "2": 8, true: 9 }, space: { "2": 8, true: 16 } },
    themes: {
      light: { background: "#fff", backgroundHover: "#eee", backgroundPress: "#ddd", color: "#111", borderColor: "#ccc", outlineColor: "blue" },
    },
    fonts: { body: { family: "Inter", size: { "2": 12, true: 14 } } },
    defaultTheme: "light",
  });
});

describe("testing harness", () => {
  it("renders into a real DOM and exposes injected CSS", () => {
    const r = render(h(Button, { size: "2" }, "Save"));
    const button = r.get<HTMLButtonElement>("button");
    expect(button.textContent).toBe("Save");

    const styles = css(button);
    expect(styles["display"]).toBe("flex");
    expect(styles["height"]).toBe("32px");
    expect(styles["border-radius"]).toBe("8px");
    expect(css(button, ":hover")["background-color"]).toBe("var(--backgroundHover)");
    expect(css(button, ":active")["background-color"]).toBe("var(--backgroundPress)");
    expect(injectedRules().find((rule) => rule.startsWith(".t_light "))).toContain("--backgroundHover: #eee");
    expect(css(r.get("span"))["font-size"]).toBe("12px");
  });

  it("computed styles resolve through injected classes", () => {
    const Box = styled("div", { defaultProps: { padding: "$space.2", color: "rgb(1, 2, 3)" } });
    const r = render(h(Box, null, "x"));
    expect(computed(r.root).padding).toBe("8px");
    expect(computed(r.root).color).toBe("rgb(1, 2, 3)");
  });

  it("dispatches events and re-renders reactively", () => {
    set("t", "count", 0);
    const Counter = () => {
      const n = Number(when(["t", "count", $.n])[0]?.n ?? 0);
      return h(Button, { onClick: () => set("t", "count", n + 1) }, String(n));
    };
    const r = render(h(Counter, null));
    click(r.get("button"));
    click(r.get("button"));
    expect(r.get("button").textContent).toBe("2");
  });
});
