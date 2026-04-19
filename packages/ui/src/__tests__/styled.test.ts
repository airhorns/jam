import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { h } from "@jam/core/jsx";
import { styled } from "../styled";
import { createTokens } from "../tokens";
import { createThemes, setTheme } from "../themes";
import { clearInjectedStyles } from "../css";

beforeEach(() => {
  db.clear();
  clearInjectedStyles();
});

describe("styled", () => {
  it("creates a component that renders the base tag", () => {
    const Box = styled("div", { name: "Box" });
    const result = Box({}) as any;
    expect(result.__vnode).toBe(true);
    expect(result.tag).toBe("div");
  });

  it("applies default props as styles", () => {
    const Box = styled("div", {
      name: "Box",
      defaultProps: { display: "flex", padding: 10 },
    });
    const result = Box({}) as any;
    // Should have a class prop with the generated class
    expect(result.props.class).toBeDefined();
    expect(typeof result.props.class).toBe("string");
  });

  it("passes through non-style props", () => {
    const Box = styled("div", { name: "Box" });
    const result = Box({ id: "my-box", "data-testid": "test" }) as any;
    expect(result.props.id).toBe("my-box");
    expect(result.props["data-testid"]).toBe("test");
  });

  it("resolves token references in style props", () => {
    createTokens({ space: { "4": 16 } });
    const Box = styled("div", {
      name: "Box",
      defaultProps: { padding: "$space.4" },
    });
    const result = Box({}) as any;
    // Should produce a class (CSS injection happens in background)
    expect(result.props.class).toBeDefined();
  });

  it("resolves theme references in style props", () => {
    createThemes({
      light: { background: "#fff" },
    });
    setTheme("light");

    const Box = styled("div", {
      name: "Box",
      defaultProps: { backgroundColor: "$background" },
    });
    const result = Box({}) as any;
    expect(result.props.class).toBeDefined();
  });

  it("applies variant styles", () => {
    const Button = styled("button", {
      name: "Button",
      variants: {
        size: {
          sm: { padding: 4, fontSize: 12 },
          lg: { padding: 12, fontSize: 18 },
        },
      },
    });

    const sm = Button({ size: "sm" }) as any;
    const lg = Button({ size: "lg" }) as any;
    // Different variants should produce different classes
    expect(sm.props.class).toBeDefined();
    expect(lg.props.class).toBeDefined();
    expect(sm.props.class).not.toBe(lg.props.class);
  });

  it("applies default variants", () => {
    const Button = styled("button", {
      name: "Button",
      variants: {
        size: {
          sm: { padding: 4 },
          lg: { padding: 12 },
        },
      },
      defaultVariants: { size: "sm" },
    });

    // No size prop — should use defaultVariants
    const result = Button({}) as any;
    expect(result.props.class).toBeDefined();
  });

  it("inline style props override defaults and variants", () => {
    const Box = styled("div", {
      name: "Box",
      defaultProps: { padding: 8 },
    });

    const withDefault = Box({}) as any;
    const withOverride = Box({ padding: 20 }) as any;
    // Different padding values → different classes
    expect(withDefault.props.class).not.toBe(withOverride.props.class);
  });

  it("expands shorthand props", () => {
    const Box = styled("div", { name: "Box" });
    const result = Box({ p: 10, bg: "red" }) as any;
    expect(result.props.class).toBeDefined();
  });

  it("handles pseudo-style props", () => {
    const Button = styled("button", {
      name: "Button",
      defaultProps: {
        backgroundColor: "blue",
        hoverStyle: { backgroundColor: "darkblue" },
      },
    });
    const result = Button({}) as any;
    expect(result.props.class).toBeDefined();
  });

  it("renders children", () => {
    const Box = styled("div", { name: "Box" });
    const result = Box({ children: "Hello" }) as any;
    expect(result.children).toContain("Hello");
  });

  it("merges existing class prop", () => {
    const Box = styled("div", {
      name: "Box",
      defaultProps: { padding: 10 },
    });
    const result = Box({ class: "custom" }) as any;
    expect(result.props.class).toContain("custom");
    expect(result.props.class).toContain("_jui_");
  });

  it("composes styled components", () => {
    const Base = styled("div", {
      name: "Base",
      defaultProps: { display: "flex" },
    });
    const Extended = styled(Base, {
      name: "Extended",
      defaultProps: { flexDirection: "column" },
    });
    const result = Extended({}) as any;
    // Should produce some output (the base component is called)
    expect(result).toBeDefined();
  });

  it("sets displayName", () => {
    const Box = styled("div", { name: "MyBox" });
    expect(Box.displayName).toBe("MyBox");

    const Unnamed = styled("div", {});
    expect(Unnamed.displayName).toBe("Styled(div)");
  });
});
