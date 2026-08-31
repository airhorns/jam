// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick, focus } from "../../testing";
import { Sheet } from "../../components/Sheet";
import type { SheetProps } from "../../components/Sheet";
import { Dialog } from "../../components/Dialog";
import { useControllableState } from "../../state";

beforeEach(() => {
  setupDefaultUI();
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
});

type ExampleProps = Partial<SheetProps> & { contentChildren?: VChild | VChild[] };

function Example(props: ExampleProps) {
  const { contentChildren, ...rest } = props;
  return h(
    Sheet,
    { ...rest, "data-testid": "sheet" },
    h(Sheet.Overlay, { "data-testid": "overlay" }),
    h(Sheet.Handle, { "data-testid": "handle" }),
    h(
      Sheet.Frame,
      { "data-testid": "frame" },
      h("h2", { id: "sheet-heading" }, "Details"),
      h("p", { id: "sheet-desc" }, "More info"),
      contentChildren ?? [h("input", { "data-testid": "first" }), h("input", { "data-testid": "last" })],
    ),
  );
}

function pointer(type: string, target: EventTarget, clientY: number, button = 0) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button }) as unknown as PointerEvent);
}

function drag(handle: Element, from: number, to: number) {
  pointer("pointerdown", handle, from);
  pointer("pointermove", document, (from + to) / 2);
  pointer("pointerup", document, to);
}

function Toggleable() {
  const [openState, setOpen] = useControllableState<boolean>("open", { defaultValue: false });
  const open = openState === true;
  return h(
    "div",
    null,
    h("button", { "data-testid": "opener", onClick: () => setOpen(true) }, "Open"),
    h(
      Sheet,
      { open, onOpenChange: setOpen, "data-testid": "sheet" },
      h(
        Sheet.Frame,
        { "data-testid": "frame" },
        h("input", { "data-testid": "first" }),
        h("button", { "data-testid": "close", onClick: () => setOpen(false) }, "Close"),
      ),
    ),
  );
}

describe("Sheet conformance", () => {
  describe("aria wiring", () => {
    // docs/Sheet.md Accessibility: "Add aria-labelledby/aria-describedby yourself pointing at your heading
    // and text" - unlike Dialog, Sheet never auto-detects a heading/description among its children.
    it("does not auto-wire aria-labelledby/aria-describedby even when a heading and text are rendered inside, unlike Dialog", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      const sheet = get("[data-testid=sheet]");
      expect(sheet.hasAttribute("aria-labelledby")).toBe(false);
      expect(sheet.hasAttribute("aria-describedby")).toBe(false);
    });

    // Sheet.ts SheetRoot: "...rest" is spread onto the positioner, so the documented manual-wiring escape hatch works.
    it("honors an explicitly passed aria-labelledby/aria-describedby via the documented 'remaining props go to the positioner' contract", () => {
      const { get } = render(h(Example, { defaultOpen: true, "aria-labelledby": "sheet-heading", "aria-describedby": "sheet-desc" } as any));
      const sheet = get("[data-testid=sheet]");
      expect(sheet.getAttribute("aria-labelledby")).toBe("sheet-heading");
      expect(sheet.getAttribute("aria-describedby")).toBe("sheet-desc");
    });

    // APG modal dialog pattern: role="dialog" is not conditioned on modality; only aria-modal is.
    it("keeps role='dialog' regardless of modal", () => {
      const { get } = render(h(Example, { defaultOpen: true, modal: false }));
      expect(get("[data-testid=sheet]").getAttribute("role")).toBe("dialog");
      expect(get("[data-testid=sheet]").hasAttribute("aria-modal")).toBe(false);
    });

    // docs/Sheet.md Parts: Sheet.Overlay "is picked out of the children by type, so it can be written before or after the frame."
    it("renders Sheet.Overlay before the positioner in the DOM even when it is written after the Frame in JSX", () => {
      render(h(Sheet, { defaultOpen: true, "data-testid": "sheet" }, h(Sheet.Frame, { "data-testid": "frame" }), h(Sheet.Overlay, { "data-testid": "overlay" })));
      const sheet = document.querySelector("[data-testid=sheet]") as HTMLElement;
      const portal = sheet.parentElement!;
      expect(portal.firstElementChild).toBe(document.querySelector("[data-testid=overlay]"));
      expect(portal.lastElementChild).toBe(sheet);
    });
  });

  describe("focus management", () => {
    // Sheet has no Trigger part at all (unlike Dialog/AlertDialog); focus-on-open must not depend on one existing.
    it("moves focus into the first focusable content on open, even though Sheet has no Trigger part of its own", async () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=first]"));
    });

    // layers.ts startLayer: falls back to the content element itself (tabIndex=-1) when there is nothing focusable.
    it("focuses the positioner itself when it has no focusable content", async () => {
      const { get } = render(h(Example, { defaultOpen: true, contentChildren: [h("span", null, "nothing focusable")] }));
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=sheet]"));
    });

    // docs/Sheet.md Accessibility: "Tab is trapped inside while modal."
    it("wraps Tab from the last focusable element back to the first while modal", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      get("[data-testid=last]").focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=first]"));
    });

    it("wraps Shift+Tab from the first focusable element to the last while modal", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      get("[data-testid=first]").focus();
      const event = keydown(document.body, "Tab", { shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=last]"));
    });

    // docs/Sheet.md Parts: Sheet.Handle is "aria-hidden and pointer-only"; layers.ts focusableElements()
    // selects on a tabindex/native-focusable selector, which excludes it.
    it("never lands Tab focus on Sheet.Handle, which is aria-hidden and keyboard-unreachable", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      const handle = get("[data-testid=handle]");
      expect(handle.getAttribute("aria-hidden")).toBe("true");
      expect(handle.hasAttribute("tabindex")).toBe(false);
      get("[data-testid=last]").focus();
      keydown(document.body, "Tab");
      expect(document.activeElement).not.toBe(handle);
      expect(document.activeElement).toBe(get("[data-testid=first]"));
    });

    // Mirrors Dialog's "restores focus to whatever was focused before opening, not only the trigger" test,
    // but exercised through a plain external control since Sheet has no built-in Trigger part to click.
    it("restores focus to whatever external control opened it, across a full open/close cycle", async () => {
      const { get } = render(h(Toggleable, {}));
      const opener = get("[data-testid=opener]");
      focus(opener);
      click(opener);
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=first]"));
      click(get("[data-testid=close]"));
      await tick();
      expect(document.activeElement).toBe(opener);
    });

    // layers.ts finishLayer restores focus on useCleanup, not only on the open->false transition.
    it("restores focus to whatever was focused before, even when the Sheet unmounts directly instead of transitioning open to false", async () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();
      const { unmount } = render(h(Example, { defaultOpen: true }));
      await tick();
      unmount();
      await tick();
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });
  });

  describe("dismissal", () => {
    // layers.ts onPointerDown: dismisses on any press outside `[data-layer]`/`[data-layer-trigger]`/
    // `[data-layer-anchor]`, not specifically a press on the Sheet.Overlay element.
    it("dismisses on any outside press, not only a press on the literal Sheet.Overlay element", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h("div", null, h("button", { "data-testid": "outside" }, "Outside"), h(Example, { defaultOpen: true, onOpenChange })));
      click(get("[data-testid=outside]"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // Sheet.ts SheetRoot wires dismissOnOutsidePress: dismissOnOverlayPress regardless of `modal`,
    // so the default (dismissOnOverlayPress=true) still dismisses when non-modal.
    it("still dismisses on an outside press by default even when non-modal", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h("div", null, h("button", { "data-testid": "outside" }, "Outside"), h(Example, { defaultOpen: true, modal: false, onOpenChange })));
      click(get("[data-testid=outside]"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("respects dismissOnEscape={false}", () => {
      const onOpenChange = vi.fn();
      render(h(Example, { defaultOpen: true, dismissOnEscape: false, onOpenChange }));
      keydown(document.body, "Escape");
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    // layers.ts topmost(): only the last-registered layer responds, mirroring Dialog's nested-dialog test.
    it("dismisses only the topmost of two nested Sheets on Escape", () => {
      const outerOnOpenChange = vi.fn();
      const innerOnOpenChange = vi.fn();
      render(
        h(
          Sheet,
          { defaultOpen: true, onOpenChange: outerOnOpenChange },
          h(Sheet.Frame, null, h(Sheet, { defaultOpen: true, onOpenChange: innerOnOpenChange }, h(Sheet.Frame, null))),
        ),
      );
      keydown(document.body, "Escape");
      expect(innerOnOpenChange).toHaveBeenCalledWith(false);
      expect(outerOnOpenChange).not.toHaveBeenCalled();
    });

    // The shared layers.ts engine governs topmost-ness across component *types*, not just same-type siblings.
    it("dismisses only the topmost layer on Escape when a Dialog is nested inside an open Sheet", () => {
      const sheetOnOpenChange = vi.fn();
      const dialogOnOpenChange = vi.fn();
      render(
        h(
          Sheet,
          { defaultOpen: true, onOpenChange: sheetOnOpenChange },
          h(Sheet.Frame, null, h(Dialog, { defaultOpen: true, onOpenChange: dialogOnOpenChange }, h(Dialog.Portal, null, h(Dialog.Content, null)))),
        ),
      );
      keydown(document.body, "Escape");
      expect(dialogOnOpenChange).toHaveBeenCalledWith(false);
      expect(sheetOnOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("state", () => {
    it("calls onOpenChange exactly once per Escape dismissal", () => {
      const onOpenChange = vi.fn();
      render(h(Example, { defaultOpen: true, onOpenChange }));
      keydown(document.body, "Escape");
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // Sheet.ts settle(): closing and re-positioning are mutually exclusive (if/else if), so a
    // drag that closes the sheet must not also fire a position change.
    it("calls onOpenChange exactly once, and never onPositionChange, when a drag settles below the smallest snap point", () => {
      const onOpenChange = vi.fn();
      const onPositionChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, snapPoints: [80, 40], onOpenChange, onPositionChange }));
      drag(get("[data-testid=handle]"), 200, 900);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onPositionChange).not.toHaveBeenCalled();
    });

    // state.ts useControllableState.update(): onChange fires, but internal state is never written when controlled.
    it("does not close a controlled Sheet by itself on Escape (relies on onOpenChange)", () => {
      const onOpenChange = vi.fn();
      const { query } = render(h(Example, { open: true, onOpenChange }));
      keydown(document.body, "Escape");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=sheet]")).not.toBeNull();
    });

    it("does not close a controlled Sheet by itself when dragged below the smallest snap point", () => {
      const onOpenChange = vi.fn();
      const { get, query } = render(h(Example, { open: true, snapPoints: [80, 40], onOpenChange }));
      drag(get("[data-testid=handle]"), 200, 900);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=sheet]")).not.toBeNull();
    });
  });

  describe("body scroll lock and unmount", () => {
    // Mirrors Dialog's own scroll-lock test, but cross-component: the lock is a single shared
    // body-level side effect in layers.ts, not per-component-type.
    it("keeps the shared body scroll lock while either of a Sheet+Dialog pair remains open, regardless of close order", () => {
      const setSheetOpen = vi.fn();
      const setDialogOpen = vi.fn();
      function Pair(props: { sheetOpen: boolean; dialogOpen: boolean }) {
        return h(
          "div",
          null,
          h(Sheet, { open: props.sheetOpen, onOpenChange: setSheetOpen }, h(Sheet.Frame, { "data-testid": "frame" })),
          h(Dialog, { open: props.dialogOpen, onOpenChange: setDialogOpen }, h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "dialog-content" }))),
        );
      }
      render(h(Pair, { sheetOpen: true, dialogOpen: true }));
      expect(document.body.style.overflow).toBe("hidden");
      render(h(Pair, { sheetOpen: false, dialogOpen: true }));
      expect(document.body.style.overflow).toBe("hidden");
      render(h(Pair, { sheetOpen: false, dialogOpen: false }));
      expect(document.body.style.overflow).toBe("");
    });

    it("releases the scroll lock when the Sheet component itself unmounts while open, not only when open becomes false", async () => {
      const { unmount } = render(h(Example, { defaultOpen: true }));
      expect(document.body.style.overflow).toBe("hidden");
      unmount();
      await tick();
      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("dragging", () => {
    // Sheet.ts startDrag: `if (event.button !== 0) return;` before any listeners are attached.
    it("ignores a non-primary-button pointerdown on the handle (no drag starts)", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      const handle = get("[data-testid=handle]");
      pointer("pointerdown", handle, 200, 1);
      pointer("pointermove", document, 500);
      expect(get("[data-testid=sheet]").style.transform).toBe("");
    });
  });
});
