import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { clearInjectedStyles } from "../../css";
import { Portal } from "../Portal";
import { Dialog } from "../Dialog";
import { Sheet } from "../Sheet";
import { AlertDialog } from "../AlertDialog";
import { Popover } from "../Popover";

beforeEach(() => {
  db.clear();
  clearInjectedStyles();
});

describe("Portal", () => {
  it("returns children in non-browser environment", () => {
    const result = Portal({ children: "content" }) as any;
    // In test env (no document), returns children directly
    expect(result).toBe("content");
  });
});

describe("Dialog", () => {
  it("renders with data-state attribute", () => {
    const closed = Dialog({ open: false, children: null }) as any;
    expect(closed.props["data-state"]).toBe("closed");

    const open = Dialog({ open: true, children: null }) as any;
    expect(open.props["data-state"]).toBe("open");
  });

  it("has all sub-components", () => {
    expect(Dialog.Trigger).toBeDefined();
    expect(Dialog.Portal).toBeDefined();
    expect(Dialog.Overlay).toBeDefined();
    expect(Dialog.Content).toBeDefined();
    expect(Dialog.Title).toBeDefined();
    expect(Dialog.Description).toBeDefined();
    expect(Dialog.Close).toBeDefined();
  });

  it("Dialog.Trigger renders a button", () => {
    const result = Dialog.Trigger({ children: "Open" }) as any;
    expect(result.tag).toBe("button");
  });

  it("Dialog.Content renders with fixed positioning", () => {
    const result = Dialog.Content({ children: "Content" }) as any;
    expect(result.tag).toBe("div");
    expect(result.props.class).toBeDefined();
  });

  it("Dialog.Title renders h2", () => {
    const result = Dialog.Title({ children: "Title" }) as any;
    expect(result.tag).toBe("h2");
  });

  it("Dialog.Description renders p", () => {
    const result = Dialog.Description({ children: "Desc" }) as any;
    expect(result.tag).toBe("p");
  });
});

describe("Sheet", () => {
  it("returns null when closed", () => {
    const result = Sheet({ open: false, children: "Content" });
    expect(result).toBeNull();
  });

  it("renders when open", () => {
    const result = Sheet({ open: true, children: "Content" }) as any;
    expect(result).toBeDefined();
    expect(result.props["data-state"]).toBe("open");
  });

  it("has sub-components", () => {
    expect(Sheet.Overlay).toBeDefined();
    expect(Sheet.Frame).toBeDefined();
    expect(Sheet.Handle).toBeDefined();
    expect(Sheet.ScrollView).toBeDefined();
  });
});

describe("AlertDialog", () => {
  it("renders with role alertdialog", () => {
    const result = AlertDialog({ children: null }) as any;
    expect(result.props.role).toBe("alertdialog");
  });

  it("has all sub-components", () => {
    expect(AlertDialog.Trigger).toBeDefined();
    expect(AlertDialog.Portal).toBeDefined();
    expect(AlertDialog.Overlay).toBeDefined();
    expect(AlertDialog.Content).toBeDefined();
    expect(AlertDialog.Title).toBeDefined();
    expect(AlertDialog.Description).toBeDefined();
    expect(AlertDialog.Cancel).toBeDefined();
    expect(AlertDialog.Action).toBeDefined();
  });

  it("Cancel and Action render buttons", () => {
    const cancel = AlertDialog.Cancel({ children: "Cancel" }) as any;
    const action = AlertDialog.Action({ children: "Confirm" }) as any;
    expect(cancel.tag).toBe("button");
    expect(action.tag).toBe("button");
  });
});

describe("Popover", () => {
  it("renders with data-state and data-placement", () => {
    const result = Popover({ open: true, placement: "top", children: null }) as any;
    expect(result.props["data-state"]).toBe("open");
    expect(result.props["data-placement"]).toBe("top");
  });

  it("defaults to closed and bottom placement", () => {
    const result = Popover({ children: null }) as any;
    expect(result.props["data-state"]).toBe("closed");
    expect(result.props["data-placement"]).toBe("bottom");
  });

  it("has sub-components", () => {
    expect(Popover.Trigger).toBeDefined();
    expect(Popover.Content).toBeDefined();
    expect(Popover.Arrow).toBeDefined();
    expect(Popover.Anchor).toBeDefined();
    expect(Popover.Close).toBeDefined();
  });

  it("Popover.Trigger renders a button", () => {
    const result = Popover.Trigger({ children: "Open" }) as any;
    expect(result.tag).toBe("button");
  });
});
