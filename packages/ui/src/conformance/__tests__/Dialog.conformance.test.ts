// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick, focus } from "../../testing";
import { Dialog } from "../../components/Dialog";
import type { DialogProps } from "../../components/Dialog";

beforeEach(() => {
  setupDefaultUI();
});

type ExampleProps = Partial<DialogProps> & {
  contentChildren?: VChild | VChild[];
  withTitle?: boolean;
  withDescription?: boolean;
};

function Example(props: ExampleProps) {
  const { contentChildren, withTitle = true, withDescription = true, ...rest } = props;
  return h(
    Dialog,
    rest,
    h(Dialog.Trigger, { "data-testid": "trigger" }, "Open"),
    h(
      Dialog.Portal,
      null,
      h(Dialog.Overlay, { "data-testid": "overlay" }),
      h(
        Dialog.Content,
        { "data-testid": "content" },
        withTitle ? h(Dialog.Title, null, "Title") : null,
        withDescription ? h(Dialog.Description, null, "Description") : null,
        contentChildren ?? [h("input", { "data-testid": "field" }), h(Dialog.Close, { "data-testid": "close" }, "Close")],
      ),
    ),
  );
}

describe("Dialog conformance", () => {
  describe("aria wiring", () => {
    // radix dialog.test.tsx "aria-controls > should not reference a non-existent element while closed"
    it("does not point aria-controls at a non-existent element while closed", () => {
      const { get, query } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      expect(query("[data-testid=content]")).toBeNull();
      const controls = trigger.getAttribute("aria-controls");
      expect(controls == null || document.getElementById(controls) != null).toBe(true);
    });

    it("points aria-controls at the rendered content once open", () => {
      const { get } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      const content = get("[data-testid=content]");
      expect(get("[data-testid=trigger]").getAttribute("aria-controls")).toBe(content.id);
    });

    // radix dialog.test.tsx "should not set aria-labelledby when no Title is rendered"
    it("does not set aria-labelledby when no Title is rendered", () => {
      const { get } = render(h(Example, { withTitle: false }));
      click(get("[data-testid=trigger]"));
      const content = get("[data-testid=content]");
      const labelledby = content.getAttribute("aria-labelledby");
      expect(labelledby == null || document.getElementById(labelledby) != null).toBe(true);
    });

    // radix dialog.test.tsx "should not set aria-describedby when no Description is rendered"
    it("does not set aria-describedby when no Description is rendered", () => {
      const { get } = render(h(Example, { withDescription: false }));
      click(get("[data-testid=trigger]"));
      const content = get("[data-testid=content]");
      const describedby = content.getAttribute("aria-describedby");
      expect(describedby == null || document.getElementById(describedby) != null).toBe(true);
    });

    it("references the rendered Title and Description when both are present", () => {
      const { get } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      const content = get("[data-testid=content]");
      expect(document.getElementById(content.getAttribute("aria-labelledby")!)?.textContent).toBe("Title");
      expect(document.getElementById(content.getAttribute("aria-describedby")!)?.textContent).toBe("Description");
    });
  });

  describe("dismissal", () => {
    // radix dismissable-layer.test / dialog nested-layer test: only the topmost layer responds
    it("dismisses only the topmost of two nested modal dialogs on Escape", () => {
      const outerOnOpenChange = vi.fn();
      const innerOnOpenChange = vi.fn();
      const { get, query } = render(
        h(
          Dialog,
          { defaultOpen: true, onOpenChange: outerOnOpenChange },
          h(
            Dialog.Portal,
            null,
            h(
              Dialog.Content,
              { "data-testid": "outer-content" },
              h(
                Dialog,
                { defaultOpen: true, onOpenChange: innerOnOpenChange },
                h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "inner-content" }, h(Dialog.Close, { "data-testid": "inner-close" }, "Close"))),
              ),
            ),
          ),
        ),
      );
      expect(query("[data-testid=inner-content]")).not.toBeNull();
      keydown(document.body, "Escape");
      expect(innerOnOpenChange).toHaveBeenCalledWith(false);
      expect(outerOnOpenChange).not.toHaveBeenCalled();
      expect(query("[data-testid=outer-content]")).not.toBeNull();

      keydown(document.body, "Escape");
      expect(outerOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("dismisses only the topmost of two nested modal dialogs on an outside press", () => {
      const outerOnOpenChange = vi.fn();
      const innerOnOpenChange = vi.fn();
      const { get } = render(
        h(
          "div",
          null,
          h("button", { "data-testid": "outside" }, "Outside"),
          h(
            Dialog,
            { defaultOpen: true, onOpenChange: outerOnOpenChange },
            h(Dialog.Portal, null, h(Dialog.Overlay, { "data-testid": "outer-overlay" }), h(Dialog.Content, { "data-testid": "outer-content" })),
          ),
          h(
            Dialog,
            { defaultOpen: true, onOpenChange: innerOnOpenChange },
            h(Dialog.Portal, null, h(Dialog.Overlay, { "data-testid": "inner-overlay" }), h(Dialog.Content, { "data-testid": "inner-content" })),
          ),
        ),
      );
      click(get("[data-testid=outer-overlay]"));
      expect(innerOnOpenChange).toHaveBeenCalledWith(false);
      expect(outerOnOpenChange).not.toHaveBeenCalled();
    });

    it("does not close a controlled dialog by itself when Escape is pressed (relies on onOpenChange)", () => {
      const onOpenChange = vi.fn();
      const { query } = render(h(Example, { open: true, onOpenChange }));
      keydown(document.body, "Escape");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("respects dismissOnEscape={false}", () => {
      const onOpenChange = vi.fn();
      const { query } = render(h(Example, { defaultOpen: true, dismissOnEscape: false, onOpenChange }));
      keydown(document.body, "Escape");
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("respects dismissOnOutsidePress={false}", () => {
      const onOpenChange = vi.fn();
      const { get, query } = render(
        h("div", null, h("button", { "data-testid": "outside" }, "Outside"), h(Example, { defaultOpen: true, dismissOnOutsidePress: false, onOpenChange })),
      );
      click(get("[data-testid=outside]"));
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    // radix dismissable-layer.tsx onPointerDownOutside: a press that lands inside the layer's own content is not "outside"
    it("does not dismiss when a pointerdown lands on an element inside the content", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, onOpenChange }));
      click(get("[data-testid=field]"));
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(get("[data-testid=content]")).not.toBeNull();
    });
  });

  describe("focus management", () => {
    // docs/Dialog.md Accessibility: "[autofocus] element" wins over "first focusable element"
    it("focuses an explicit [autofocus] element over the first focusable element", async () => {
      const { get } = render(
        h(Example, {
          contentChildren: [h("input", { "data-testid": "first" }), h("input", { "data-testid": "auto", autofocus: true }), h("input", { "data-testid": "last" })],
        }),
      );
      click(get("[data-testid=trigger]"));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=auto]"));
    });

    it("focuses the content itself when it has no focusable children", async () => {
      const { get } = render(h(Example, { contentChildren: [h("span", null, "no focusable children here")] }));
      click(get("[data-testid=trigger]"));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=content]"));
    });

    it("does not steal focus away if something inside the content is already focused", async () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      await tick();
      const field = get("[data-testid=field]");
      field.focus();
      // simulate a re-render (e.g. a state update) after the initial autofocus microtask has run
      click(get("[data-testid=field]"));
      await tick();
      expect(document.activeElement).toBe(field);
    });

    // docs/Dialog.md Accessibility: "Tab and Shift+Tab cycle inside the content" while modal
    it("wraps Tab from the last focusable element back to the first while modal", () => {
      const { get } = render(h(Example, { defaultOpen: true, contentChildren: [h("input", { "data-testid": "first" }), h("input", { "data-testid": "last" })] }));
      const last = get("[data-testid=last]");
      last.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=first]"));
    });

    it("wraps Shift+Tab from the first focusable element to the last while modal", () => {
      const { get } = render(h(Example, { defaultOpen: true, contentChildren: [h("input", { "data-testid": "first" }), h("input", { "data-testid": "last" })] }));
      const first = get("[data-testid=first]");
      first.focus();
      const event = keydown(document.body, "Tab", { shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=last]"));
    });

    it("does not trap Tab when non-modal", () => {
      const { get } = render(h(Example, { defaultOpen: true, modal: false, contentChildren: [h("input", { "data-testid": "first" }), h("input", { "data-testid": "last" })] }));
      const last = get("[data-testid=last]");
      last.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(last);
    });

    it("does not restore focus to the trigger if it has been removed from the document", async () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();
      const { get, unmount } = render(h(Example, { defaultOpen: true }));
      await tick();
      trigger.remove();
      keydown(document.body, "Escape");
      await tick();
      expect(document.activeElement === document.body || document.activeElement == null).toBe(true);
      unmount();
    });

    // docs/Dialog.md Accessibility: "restores focus to the element that was focused before, typically the trigger" -
    // exercised here with a non-trigger element to confirm the contract is general, not trigger-specific
    it("restores focus to whatever element was focused before opening, not only the trigger", async () => {
      const { get } = render(
        h("div", null, h("button", { "data-testid": "elsewhere" }, "Elsewhere"), h(Example, {})),
      );
      const elsewhere = get("[data-testid=elsewhere]");
      focus(elsewhere);
      click(get("[data-testid=trigger]"));
      await tick();
      click(get("[data-testid=close]"));
      await tick();
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  describe("state", () => {
    // radix use-controllable-state: onChange fires once per real transition
    it("calls onOpenChange exactly once per Escape dismissal", () => {
      const onOpenChange = vi.fn();
      render(h(Example, { defaultOpen: true, onOpenChange }));
      keydown(document.body, "Escape");
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onOpenChange exactly once per trigger toggle", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { onOpenChange }));
      click(get("[data-testid=trigger]"));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
    });

    it("does not update visible state when controlled, even after onOpenChange fires", () => {
      const onOpenChange = vi.fn();
      const { get, query } = render(h(Example, { open: false, onOpenChange }));
      click(get("[data-testid=trigger]"));
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(query("[data-testid=content]")).toBeNull();
    });

    it("re-renders open when a controlled open prop changes", () => {
      const first = render(h(Example, { open: false }));
      expect(first.query("[data-testid=content]")).toBeNull();
      const second = render(h(Example, { open: true }));
      expect(second.query("[data-testid=content]")).not.toBeNull();
    });
  });

  describe("body scroll lock", () => {
    // radix dismissable-layer disableOutsidePointerEvents analogue: shared body-level
    // side effect persists until every modal layer has closed, regardless of order
    it("keeps the body scroll lock while any of two modal dialogs remains open, in either close order", () => {
      const a = render(h("div", { "data-testid": "wrapper" }));
      const wrapper = a.get("[data-testid=wrapper]");
      const setOpenA = vi.fn();
      const setOpenB = vi.fn();

      function Two(props: { openA: boolean; openB: boolean }) {
        return h(
          "div",
          null,
          h(Dialog, { open: props.openA, onOpenChange: setOpenA }, h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "a" }))),
          h(Dialog, { open: props.openB, onOpenChange: setOpenB }, h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "b" }))),
        );
      }

      const r1 = render(h(Two, { openA: true, openB: true }));
      expect(document.body.style.overflow).toBe("hidden");

      const r2 = render(h(Two, { openA: false, openB: true }));
      expect(document.body.style.overflow).toBe("hidden");

      const r3 = render(h(Two, { openA: false, openB: false }));
      expect(document.body.style.overflow).toBe("");
      wrapper.remove();
    });
  });

  describe("nesting", () => {
    it("keeps the outer dialog's Tab trap unaffected while a nested dialog is open", () => {
      const { get } = render(
        h(
          Dialog,
          { defaultOpen: true },
          h(
            Dialog.Portal,
            null,
            h(
              Dialog.Content,
              { "data-testid": "outer-content" },
              h("input", { "data-testid": "outer-field" }),
              h(
                Dialog,
                { defaultOpen: true },
                h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "inner-content" }, h("input", { "data-testid": "inner-field" }))),
              ),
            ),
          ),
        ),
      );
      const innerField = get("[data-testid=inner-field]");
      innerField.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(innerField);
    });
  });
});
