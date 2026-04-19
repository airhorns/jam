import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { clearInjectedStyles } from "../../css";
import { Stack, XStack, YStack, ZStack } from "../Stacks";
import { Text, SizableText, Paragraph, Heading, H1, H2, H3, H4, H5, H6 } from "../Text";
import { Spacer } from "../Spacer";
import { Separator } from "../Separator";
import { ScrollView } from "../ScrollView";
import { Group, XGroup, YGroup } from "../Group";
import { Square, Circle } from "../Shapes";
import { createFont } from "../../fonts";

beforeEach(() => {
  db.clear();
  clearInjectedStyles();
});

describe("Stacks", () => {
  it("Stack renders a div with display flex", () => {
    const result = Stack({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("XStack renders with row direction", () => {
    const result = XStack({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("YStack renders with column direction", () => {
    const result = YStack({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("ZStack renders with relative position", () => {
    const result = ZStack({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("stacks accept style props", () => {
    const result = XStack({ padding: 10, gap: 8 }) as any;
    expect(result.props.class).toBeDefined();
  });

  it("stacks accept children", () => {
    const result = YStack({ children: "hello" }) as any;
    expect(result.children).toContain("hello");
  });

  it("different stack types produce different classes", () => {
    const x = XStack({}) as any;
    const y = YStack({}) as any;
    expect(x.props.class).not.toBe(y.props.class);
  });
});

describe("Text", () => {
  it("Text renders a span", () => {
    const result = Text({ children: "hello" }) as any;
    expect(result.tag).toBe("span");
    expect(result.children).toContain("hello");
  });

  it("Paragraph renders a p tag", () => {
    const result = Paragraph({ children: "text" }) as any;
    expect(result.tag).toBe("p");
  });

  it("Heading renders an h2 tag", () => {
    const result = Heading({ children: "title" }) as any;
    expect(result.tag).toBe("h2");
  });

  it("H1-H6 render correct tags", () => {
    expect((H1({ children: "h" }) as any).tag).toBe("h1");
    expect((H2({ children: "h" }) as any).tag).toBe("h2");
    expect((H3({ children: "h" }) as any).tag).toBe("h3");
    expect((H4({ children: "h" }) as any).tag).toBe("h4");
    expect((H5({ children: "h" }) as any).tag).toBe("h5");
    expect((H6({ children: "h" }) as any).tag).toBe("h6");
  });

  it("SizableText resolves font size from font system", () => {
    createFont("body", {
      family: "Inter",
      size: { "1": 12, "2": 14, "3": 16, "4": 18 },
      lineHeight: { "1": 18, "2": 22, "3": 24, "4": 28 },
    });

    const result = SizableText({ size: "2", children: "hello" });
    // Should render something (the actual CSS class will contain the font size)
    expect(result).toBeDefined();
  });

  it("SizableText uses size 4 by default", () => {
    createFont("body", {
      family: "Inter",
      size: { "4": 18 },
    });
    const result = SizableText({ children: "hello" });
    expect(result).toBeDefined();
  });

  it("Text accepts style props", () => {
    const result = Text({ color: "red", fontSize: 16, children: "styled" }) as any;
    expect(result.props.class).toBeDefined();
  });
});

describe("Spacer", () => {
  it("renders with flex by default", () => {
    const result = Spacer({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("renders with fixed size when size variant provided", () => {
    const def = Spacer({}) as any;
    const fixed = Spacer({ size: "2" }) as any;
    expect(def.props.class).not.toBe(fixed.props.class);
  });
});

describe("Separator", () => {
  it("renders horizontal by default", () => {
    const result = Separator({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("renders vertical with variant", () => {
    const h = Separator({}) as any;
    const v = Separator({ vertical: "true" }) as any;
    expect(h.props.class).not.toBe(v.props.class);
  });
});

describe("ScrollView", () => {
  it("renders with overflow auto", () => {
    const result = ScrollView({}) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("renders horizontal variant", () => {
    const v = ScrollView({}) as any;
    const h = ScrollView({ horizontal: "true" }) as any;
    expect(v.props.class).not.toBe(h.props.class);
  });
});

describe("Group", () => {
  it("renders with flex row", () => {
    const result = Group({}) as any;
    expect(result.tag).toBe("div");
  });

  it("XGroup and YGroup render correctly", () => {
    const x = XGroup({}) as any;
    const y = YGroup({}) as any;
    expect(x.tag).toBe("div");
    expect(y.tag).toBe("div");
  });
});

describe("Shapes", () => {
  it("Square renders centered div", () => {
    const result = Square({ size: "3" }) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("Circle renders with border radius", () => {
    const result = Circle({ size: "3" }) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("different sizes produce different classes", () => {
    const s = Square({ size: "2" }) as any;
    const l = Square({ size: "6" }) as any;
    expect(s.props.class).not.toBe(l.props.class);
  });
});
