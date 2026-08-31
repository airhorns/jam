// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick, focus } from "../../testing";
import { AlertDialog } from "../../components/AlertDialog";
import { Dialog } from "../../components/Dialog";
import type { AlertDialogProps } from "../../components/AlertDialog";

beforeEach(() => {
  setupDefaultUI();
});

type ExampleProps = Partial<AlertDialogProps> & { cancelFirst?: boolean; onConfirm?: () => void; extraFocusable?: boolean };

function Example(props: ExampleProps) {
  const { cancelFirst = true, onConfirm, extraFocusable, ...rest } = props;
  const cancel = h(AlertDialog.Cancel, { "data-testid": "cancel" }, "Cancel");
  const action = h(AlertDialog.Action, { "data-testid": "action", onClick: onConfirm }, "Delete");
  return h(
    AlertDialog,
    rest,
    h(AlertDialog.Trigger, { "data-testid": "trigger" }, "Delete"),
    h(
      AlertDialog.Portal,
      null,
      h(AlertDialog.Overlay, { "data-testid": "overlay" }),
      h(
        AlertDialog.Content,
        { "data-testid": "content" },
        h(AlertDialog.Title, null, "Delete?"),
        h(AlertDialog.Description, null, "Irreversible."),
        extraFocusable ? h("input", { "data-testid": "extra" }) : null,
        cancelFirst ? cancel : action,
        cancelFirst ? action : cancel,
      ),
    ),
  );
}

describe("AlertDialog conformance", () => {
  describe("focus management", () => {
    // radix alert-dialog.test.tsx "should focus the cancel button" — Radix's AlertDialogContent
    // hardcodes onOpenAutoFocus to focus the Cancel-tracked ref regardless of DOM order.
    it("focuses Cancel on open when Action precedes Cancel in the markup", async () => {
      const { get } = render(h(Example, { cancelFirst: false }));
      click(get("[data-testid=trigger]"));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=cancel]"));
    });

    it("focuses Cancel on open when Cancel precedes Action in the markup", async () => {
      const { get } = render(h(Example, { cancelFirst: true }));
      click(get("[data-testid=trigger]"));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=cancel]"));
    });

    // docs/AlertDialog.md: "put autofocus on the Cancel button to make the safe choice the
    // default" — with an explicit autofocus prop the documented opt-in should work regardless.
    it("honours an explicit autofocus prop on Cancel", async () => {
      const { get } = render(
        h(
          AlertDialog,
          {},
          h(AlertDialog.Trigger, { "data-testid": "trigger" }, "Delete"),
          h(
            AlertDialog.Portal,
            null,
            h(
              AlertDialog.Content,
              { "data-testid": "content" },
              h(AlertDialog.Action, { "data-testid": "action" }, "Delete"),
              h(AlertDialog.Cancel, { "data-testid": "cancel", autofocus: true }, "Cancel"),
            ),
          ),
        ),
      );
      click(get("[data-testid=trigger]"));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=cancel]"));
    });

    it("returns focus to the trigger on close via Cancel", async () => {
      const { get } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      click(trigger);
      await tick();
      click(get("[data-testid=cancel]"));
      await tick();
      expect(document.activeElement).toBe(trigger);
    });

    // APG modal dialog pattern: Tab on the last tabbable element loops to the first.
    it("wraps Tab from the last focusable back to the first inside the content", async () => {
      const { get } = render(h(Example, { extraFocusable: true }));
      click(get("[data-testid=trigger]"));
      await tick();
      const action = get("[data-testid=action]");
      action.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=extra]"));
    });

    it("wraps Shift+Tab from the first focusable back to the last inside the content", async () => {
      const { get } = render(h(Example, { extraFocusable: true }));
      click(get("[data-testid=trigger]"));
      await tick();
      const extra = get("[data-testid=extra]");
      extra.focus();
      const event = keydown(document.body, "Tab", { shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=action]"));
    });
  });

  describe("modality", () => {
    // radix alert-dialog.tsx forces `modal={true}` unconditionally on DialogPrimitive.Root
    // and its public type omits `modal` from AlertDialogProps entirely.
    it("stays modal (aria-modal, Tab trap, scroll lock) even when modal={false} is passed", async () => {
      document.body.style.overflow = "";
      const { get } = render(h(Example, { modal: false }));
      click(get("[data-testid=trigger]"));
      await tick();
      const content = get("[data-testid=content]");
      expect(content.getAttribute("aria-modal")).toBe("true");
      expect(document.body.style.overflow).toBe("hidden");
      const action = get("[data-testid=action]");
      action.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("dismissal rules", () => {
    it("ignores an outside press by default", async () => {
      const { get, query } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      await tick();
      click(get("[data-testid=overlay]"));
      await tick();
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    // radix alert-dialog.tsx: AlertDialogContent unconditionally calls event.preventDefault()
    // in onPointerDownOutside/onInteractOutside — not consumer-configurable.
    it("still ignores an outside press when dismissOnOutsidePress is explicitly true", async () => {
      const { get, query } = render(h(Example, { dismissOnOutsidePress: true }));
      click(get("[data-testid=trigger]"));
      await tick();
      click(get("[data-testid=overlay]"));
      await tick();
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("closes on Escape by default", async () => {
      const { get, query } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      await tick();
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=content]")).toBeNull();
    });

    it("ignores Escape when dismissOnEscape is false, without invoking Action", async () => {
      const onConfirm = vi.fn();
      const { get, query } = render(h(Example, { dismissOnEscape: false, onConfirm }));
      click(get("[data-testid=trigger]"));
      await tick();
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=content]")).not.toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("nesting", () => {
    function DialogWithNestedAlert() {
      return h(
        Dialog,
        { defaultOpen: true },
        h(Dialog.Trigger, { "data-testid": "dialog-trigger" }, "Open"),
        h(
          Dialog.Portal,
          null,
          h(
            Dialog.Content,
            { "data-testid": "dialog-content" },
            h(Example, { defaultOpen: true }),
          ),
        ),
      );
    }

    // layers.ts keeps one shared registry across component types: only the topmost layer
    // (the nested AlertDialog) reacts to Escape, leaving the underlying Dialog open.
    it("closes only the nested AlertDialog on Escape, leaving the outer Dialog open", async () => {
      const { query } = render(h(DialogWithNestedAlert, {}));
      await tick();
      expect(query("[data-testid=content]")).not.toBeNull();
      expect(query("[data-testid=dialog-content]")).not.toBeNull();
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=content]")).toBeNull();
      expect(query("[data-testid=dialog-content]")).not.toBeNull();
    });
  });

  describe("onOpenChange semantics", () => {
    it("fires onOpenChange exactly once when Cancel is clicked", async () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { onOpenChange }));
      click(get("[data-testid=trigger]"));
      await tick();
      onOpenChange.mockClear();
      click(get("[data-testid=cancel]"));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("fires onOpenChange exactly once when Action is clicked, after the consumer's onClick", async () => {
      const onOpenChange = vi.fn();
      const order: string[] = [];
      const onConfirm = vi.fn(() => order.push("confirm"));
      const { get } = render(h(Example, { onOpenChange, onConfirm }));
      click(get("[data-testid=trigger]"));
      await tick();
      onOpenChange.mockClear();
      click(get("[data-testid=action]"));
      order.push(onOpenChange.mock.calls.length > 0 ? "open-change" : "none");
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["confirm", "open-change"]);
    });

    it("fires onOpenChange exactly once when Escape dismisses", async () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { onOpenChange }));
      click(get("[data-testid=trigger]"));
      await tick();
      onOpenChange.mockClear();
      keydown(document.body, "Escape");
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("controlled state", () => {
    // use-controllable-state contract: a controlled `open` prop is the single source of truth;
    // Cancel/Action must report through onOpenChange without the component rendering closed itself.
    it("does not mutate a controlled open prop when Cancel is clicked", () => {
      const onOpenChange = vi.fn();
      const { get, query } = render(h(Example, { open: true, onOpenChange }));
      click(get("[data-testid=cancel]"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("does not mutate a controlled open prop when Action is clicked", () => {
      const onOpenChange = vi.fn();
      const onConfirm = vi.fn();
      const { get, query } = render(h(Example, { open: true, onOpenChange, onConfirm }));
      click(get("[data-testid=action]"));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("does not mutate a controlled open prop when Escape is pressed", async () => {
      const onOpenChange = vi.fn();
      const { query } = render(h(Example, { open: true, onOpenChange }));
      keydown(document.body, "Escape");
      await tick();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=content]")).not.toBeNull();
    });
  });

  describe("asChild", () => {
    it("Cancel merges close behaviour onto its child without the default outlined Button styling", () => {
      const { get, query } = render(
        h(
          AlertDialog,
          { defaultOpen: true },
          h(
            AlertDialog.Portal,
            null,
            h(
              AlertDialog.Content,
              {},
              h(AlertDialog.Cancel, { asChild: true, "data-testid": "cancel" }, h("a", { href: "#" }, "Cancel")),
            ),
          ),
        ),
      );
      const cancel = get("[data-testid=cancel]");
      expect(cancel.tagName).toBe("A");
      expect(cancel.classList.contains("is_Button")).toBe(false);
      click(cancel);
      expect(query("[data-testid=cancel]")).toBeNull();
    });

    it("Action merges close behaviour onto its child and runs the consumer's onClick first", () => {
      const order: string[] = [];
      const onConfirm = vi.fn(() => order.push("confirm"));
      const { get, query } = render(
        h(
          AlertDialog,
          { defaultOpen: true, onOpenChange: () => order.push("open-change") },
          h(
            AlertDialog.Portal,
            null,
            h(
              AlertDialog.Content,
              {},
              h(AlertDialog.Action, { asChild: true, "data-testid": "action", onClick: onConfirm }, h("a", { href: "#" }, "Delete")),
            ),
          ),
        ),
      );
      const action = get("[data-testid=action]");
      expect(action.tagName).toBe("A");
      expect(action.classList.contains("is_Button")).toBe(false);
      click(action);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["confirm", "open-change"]);
      expect(query("[data-testid=action]")).toBeNull();
    });
  });

  describe("aria wiring", () => {
    it("sets role=alertdialog and aria-modal=true on the content", async () => {
      const { get } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      await tick();
      const content = get("[data-testid=content]");
      expect(content.getAttribute("role")).toBe("alertdialog");
      expect(content.getAttribute("aria-modal")).toBe("true");
    });

    // Radix tracks titlePresent/descriptionPresent so the content never references a missing element.
    it("omits aria-labelledby and aria-describedby when Title/Description are absent", async () => {
      const { get } = render(
        h(
          AlertDialog,
          { defaultOpen: true },
          h(AlertDialog.Content, { "data-testid": "content" }, h(AlertDialog.Cancel, {}, "Cancel")),
        ),
      );
      await tick();
      const content = get("[data-testid=content]");
      expect(content.getAttribute("aria-labelledby")).toBeNull();
      expect(content.getAttribute("aria-describedby")).toBeNull();
    });
  });
});
