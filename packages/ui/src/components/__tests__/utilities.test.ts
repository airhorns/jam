import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { clearInjectedStyles } from "../../css";
import { Toast } from "../Toast";
import { Tooltip } from "../Tooltip";
import { VisuallyHidden } from "../VisuallyHidden";

beforeEach(() => {
  db.clear();
  clearInjectedStyles();
});

describe("Toast", () => {
  it("returns null when closed", () => {
    const result = Toast({ open: false, children: "msg" });
    expect(result).toBeNull();
  });

  it("renders when open", () => {
    const result = Toast({ open: true, children: "msg" }) as any;
    expect(result).toBeDefined();
    expect(result.props.role).toBe("status");
  });

  it("has all sub-components", () => {
    expect(Toast.Provider).toBeDefined();
    expect(Toast.Viewport).toBeDefined();
    expect(Toast.Title).toBeDefined();
    expect(Toast.Description).toBeDefined();
    expect(Toast.Action).toBeDefined();
    expect(Toast.Close).toBeDefined();
  });

  it("Toast.Title renders a span", () => {
    const result = Toast.Title({ children: "Success" }) as any;
    expect(result.tag).toBe("span");
  });
});

describe("Tooltip", () => {
  it("renders inline", () => {
    const result = Tooltip({ children: null }) as any;
    expect(result).toBeDefined();
  });

  it("has sub-components", () => {
    expect(Tooltip.Trigger).toBeDefined();
    expect(Tooltip.Content).toBeDefined();
    expect(Tooltip.Arrow).toBeDefined();
  });

  it("Tooltip.Content renders a div", () => {
    const result = Tooltip.Content({ children: "Tip" }) as any;
    expect(result.tag).toBe("div");
  });
});

describe("VisuallyHidden", () => {
  it("renders a span", () => {
    const result = VisuallyHidden({ children: "Screen reader text" }) as any;
    expect(result.tag).toBe("span");
    expect(result.props.class).toBeDefined();
  });
});
