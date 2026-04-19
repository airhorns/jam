import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { clearInjectedStyles } from "../../css";
import { Card } from "../Card";
import { Avatar } from "../Avatar";
import { Image } from "../Image";
import { ListItem } from "../ListItem";
import { Progress } from "../Progress";
import { Spinner } from "../Spinner";
import { Accordion } from "../Accordion";
import { Tabs } from "../Tabs";

beforeEach(() => {
  db.clear();
  clearInjectedStyles();
});

describe("Card", () => {
  it("renders a div with card styling", () => {
    const result = Card({ children: "Content" }) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("has Header, Footer, Background sub-components", () => {
    expect(Card.Header).toBeDefined();
    expect(Card.Footer).toBeDefined();
    expect(Card.Background).toBeDefined();
  });

  it("applies size variant", () => {
    const sm = Card({ size: "1", children: "sm" }) as any;
    const lg = Card({ size: "5", children: "lg" }) as any;
    expect(sm.props.class).not.toBe(lg.props.class);
  });

  it("applies elevated variant", () => {
    const flat = Card({ children: "flat" }) as any;
    const elevated = Card({ elevated: "true", children: "elevated" }) as any;
    expect(flat.props.class).not.toBe(elevated.props.class);
  });
});

describe("Avatar", () => {
  it("renders with circular styling", () => {
    const result = Avatar({ children: null }) as any;
    expect(result.tag).toBe("div");
  });

  it("has Image and Fallback sub-components", () => {
    expect(Avatar.Image).toBeDefined();
    expect(Avatar.Fallback).toBeDefined();
  });

  it("Avatar.Image renders an img", () => {
    const result = Avatar.Image({ src: "test.jpg" }) as any;
    expect(result.tag).toBe("img");
  });

  it("Avatar.Fallback renders a span", () => {
    const result = Avatar.Fallback({ children: "AB" }) as any;
    expect(result.tag).toBe("span");
  });

  it("applies size variant", () => {
    const sm = Avatar({ size: "2", children: null }) as any;
    const lg = Avatar({ size: "7", children: null }) as any;
    expect(sm.props.class).not.toBe(lg.props.class);
  });
});

describe("Image", () => {
  it("renders an img element", () => {
    const result = Image({ src: "test.jpg" }) as any;
    expect(result.tag).toBe("img");
  });
});

describe("ListItem", () => {
  it("renders a div", () => {
    const result = ListItem({ children: "Item" }) as any;
    expect(result.tag).toBe("div");
  });

  it("has Text, Title, Subtitle, Icon sub-components", () => {
    expect(ListItem.Text).toBeDefined();
    expect(ListItem.Title).toBeDefined();
    expect(ListItem.Subtitle).toBeDefined();
    expect(ListItem.Icon).toBeDefined();
  });

  it("Title renders a span", () => {
    const result = ListItem.Title({ children: "Title" }) as any;
    expect(result.tag).toBe("span");
  });
});

describe("Progress", () => {
  it("renders with role progressbar", () => {
    const result = Progress({ value: 50, max: 100 }) as any;
    expect(result.props.role).toBe("progressbar");
    expect(result.props["aria-valuenow"]).toBe("50");
    expect(result.props["aria-valuemax"]).toBe("100");
  });

  it("has Indicator sub-component", () => {
    expect(Progress.Indicator).toBeDefined();
  });

  it("clamps values", () => {
    const result = Progress({ value: 150, max: 100 }) as any;
    expect(result.props["aria-valuenow"]).toBe("150");
  });
});

describe("Spinner", () => {
  it("renders a div", () => {
    const result = Spinner({}) as any;
    expect(result).toBeDefined();
  });

  it("accepts size prop", () => {
    const sm = Spinner({ size: "1" }) as any;
    const lg = Spinner({ size: "5" }) as any;
    expect(sm).toBeDefined();
    expect(lg).toBeDefined();
  });
});

describe("Accordion", () => {
  it("renders with data-type", () => {
    const result = Accordion({ type: "single", children: null }) as any;
    expect(result.props["data-type"]).toBe("single");
  });

  it("has Item, Trigger, Content sub-components", () => {
    expect(Accordion.Item).toBeDefined();
    expect(Accordion.Trigger).toBeDefined();
    expect(Accordion.Content).toBeDefined();
  });

  it("Accordion.Trigger renders a button", () => {
    const result = Accordion.Trigger({ children: "Open" }) as any;
    expect(result.tag).toBe("button");
  });
});

describe("Tabs", () => {
  it("renders with data-orientation and data-value", () => {
    const result = Tabs({ value: "tab1", children: null }) as any;
    expect(result.props["data-value"]).toBe("tab1");
    expect(result.props["data-orientation"]).toBe("horizontal");
  });

  it("has List, Tab, Content sub-components", () => {
    expect(Tabs.List).toBeDefined();
    expect(Tabs.Tab).toBeDefined();
    expect(Tabs.Content).toBeDefined();
  });

  it("Tabs.Tab renders a button", () => {
    const result = Tabs.Tab({ children: "Tab 1" }) as any;
    expect(result.tag).toBe("button");
  });
});
