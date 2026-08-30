// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, setupDefaultUI, focus, blur, keydown, pointerEnter, pointerLeave } from "../../testing";
import { Toast, toastController } from "../../components/Toast";
import type { ToastProps } from "../../components/Toast";

beforeEach(() => {
  setupDefaultUI();
  toastController.hideAll();
});

function Example(props: Partial<ToastProps> & { onOpenChange?: (open: boolean) => void; "data-testid"?: string }) {
  const { "data-testid": testId = "toast", ...rest } = props;
  return h(
    Toast,
    { "data-testid": testId, ...rest },
    h(Toast.Title, null, "Saved"),
    h(Toast.Description, null, "Your changes are safe."),
    h(Toast.Action, { altText: "Undo the save" }, "Undo"),
    h(Toast.Close, null, "×"),
  );
}

describe("Toast conformance", () => {
  describe("role & aria", () => {
    // radix toast.tsx: "Toasts are always role=status to avoid stuttering issues with role=alert in SRs"
    it("keeps role=status, never role=alert, for both background and foreground toasts", () => {
      const bg = render(h(Example, { defaultOpen: true, duration: Infinity, type: "background" }));
      expect(bg.get("[data-testid=toast]").getAttribute("role")).toBe("status");
      const fg = render(h(Example, { defaultOpen: true, duration: Infinity, type: "foreground" }));
      expect(fg.get("[data-testid=toast]").getAttribute("role")).toBe("status");
    });

    // radix toast.tsx: role/aria-live live on a separate visually-hidden ToastAnnounce, not on the
    // interactive <li> itself, so screen readers get the announcement without also exposing a focusable
    // status region
    it("announces through a live region separate from the interactive toast, not on the toast itself", () => {
      const { get, all } = render(h(Example, { defaultOpen: true, duration: Infinity }));
      const toast = get("[data-testid=toast]");
      const hiddenAnnouncer = all("[aria-live]").find((el) => el !== toast);
      expect(hiddenAnnouncer).toBeDefined();
      expect(toast.hasAttribute("aria-live")).toBe(false);
    });
  });

  describe("keyboard", () => {
    // radix toast.tsx ToastImpl onKeyDown: `if (event.key !== "Escape") return; ...handleClose()`
    it("closes itself when Escape is pressed while it is focused", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, duration: Infinity, onOpenChange }));
      const toast = get("[data-testid=toast]");
      focus(toast);
      keydown(toast, "Escape");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // radix toast.tsx: VIEWPORT_DEFAULT_HOTKEY = ["F8"] moves focus to the viewport landmark
    it("moves focus to the viewport when F8 is pressed", () => {
      render(h(Toast.Viewport, { "data-testid": "viewport" }));
      const viewport = document.querySelector("[data-testid=viewport]");
      keydown(document, "F8");
      expect(document.activeElement).toBe(viewport);
    });
  });

  describe("swipe dismissal", () => {
    // radix toast.tsx ToastImpl onPointerMove: sets data-swipe as a drag crosses the move buffer
    it("sets data-swipe attributes while a pointer drags across the toast", () => {
      const { get } = render(h(Example, { defaultOpen: true, duration: Infinity }));
      const toast = get("[data-testid=toast]");
      toast.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
      toast.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: 0, clientY: 80 }));
      expect(toast.getAttribute("data-swipe")).toBe("move");
    });

    // radix toast.tsx: swipeThreshold defaults to 50px; releasing past it dismisses the toast
    it("dismisses when dragged past the swipe threshold", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, duration: Infinity, onOpenChange }));
      const toast = get("[data-testid=toast]");
      toast.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
      toast.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: 0, clientY: 80 }));
      toast.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 0, clientY: 80 }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("auto-dismiss timing", () => {
    it("calls onOpenChange exactly once when the auto-dismiss timer fires", () => {
      vi.useFakeTimers();
      const onOpenChange = vi.fn();
      render(h(Example, { defaultOpen: true, duration: 1000, onOpenChange }));
      vi.advanceTimersByTime(1000);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      vi.useRealTimers();
    });

    it("never schedules a dismiss for an Infinite duration, even across a pause/resume cycle", () => {
      vi.useFakeTimers();
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, duration: Infinity, onOpenChange }));
      const toast = get("[data-testid=toast]");
      pointerEnter(toast);
      pointerLeave(toast);
      vi.advanceTimersByTime(1_000_000);
      expect(onOpenChange).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    // radix toast.tsx closeTimerRemainingTimeRef: resuming after a pause restarts from the time left,
    // not the full duration
    it("resumes with the remaining time after a pointer leaves, not the full duration", () => {
      vi.useFakeTimers();
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, duration: 1000, onOpenChange }));
      const toast = get("[data-testid=toast]");
      vi.advanceTimersByTime(800);
      pointerEnter(toast);
      pointerLeave(toast);
      vi.advanceTimersByTime(200);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      vi.useRealTimers();
    });

    it("cancels the dismiss timer on focus and restarts it on blur", () => {
      vi.useFakeTimers();
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, duration: 200, onOpenChange }));
      const toast = get("[data-testid=toast]");
      focus(toast);
      vi.advanceTimersByTime(300);
      expect(onOpenChange).not.toHaveBeenCalled();
      blur(toast);
      vi.advanceTimersByTime(200);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      vi.useRealTimers();
    });

    // radix toast-viewport.tsx VIEWPORT_PAUSE/VIEWPORT_RESUME: hovering any toast pauses every toast
    // sharing its viewport, not just the one under the pointer
    it("pauses every toast in the viewport when hovering just one of them", () => {
      vi.useFakeTimers();
      const { get, query } = render(
        h(
          Toast.Viewport,
          { "data-testid": "viewport" },
          h(Example, { defaultOpen: true, duration: 200, "data-testid": "a" }),
          h(Example, { defaultOpen: true, duration: 200, "data-testid": "b" }),
        ),
      );
      pointerEnter(get("[data-testid=a]"));
      vi.advanceTimersByTime(500);
      expect(query("[data-testid=b]")).not.toBeNull();
      vi.useRealTimers();
    });
  });

  describe("controlled vs uncontrolled state", () => {
    it("does not remove itself from the DOM when controlled, even after the auto-dismiss timer fires", () => {
      vi.useFakeTimers();
      const onOpenChange = vi.fn();
      const { get, query } = render(h(Example, { open: true, duration: 200, onOpenChange }));
      get("[data-testid=toast]");
      vi.advanceTimersByTime(200);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=toast]")).not.toBeNull();
      vi.useRealTimers();
    });

    it("re-renders open when a controlled open prop changes, without requiring onOpenChange", () => {
      const first = render(h(Example, { open: false, duration: Infinity }));
      expect(first.query("[data-testid=toast]")).toBeNull();
      const second = render(h(Example, { open: true, duration: Infinity }));
      expect(second.query("[data-testid=toast]")).not.toBeNull();
    });
  });

  describe("Toast.Action", () => {
    // radix toast.tsx ToastAction: `if (!altText.trim()) console.error(...)` — a blank altText is
    // rejected rather than rendered as an action with no accessible name
    it("rejects a blank altText instead of rendering an action with no accessible name", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { get } = render(h(Toast, { defaultOpen: true, duration: Infinity }, h(Toast.Action, { altText: "", "data-testid": "action" }, "Undo")));
      const action = get("[data-testid=action]");
      expect(errorSpy).toHaveBeenCalled();
      expect(action.getAttribute("aria-label")).not.toBe("");
      errorSpy.mockRestore();
    });
  });

  describe("Toast.Close", () => {
    it('lets a custom aria-label override the default "Close" label', () => {
      const { get } = render(h(Toast, { defaultOpen: true, duration: Infinity }, h(Toast.Close, { "aria-label": "Dismiss", "data-testid": "close" })));
      expect(get("[data-testid=close]").getAttribute("aria-label")).toBe("Dismiss");
    });
  });

  describe("imperative toastController ordering", () => {
    it("preserves the show order of the remaining toasts when a middle one is hidden directly", () => {
      const { container } = render(h(Toast.Viewport, { "data-testid": "viewport" }));
      const a = toastController.show("A", { duration: Infinity });
      const b = toastController.show("B", { duration: Infinity });
      const c = toastController.show("C", { duration: Infinity });
      toastController.hide(b);
      const ids = Array.from(container.querySelectorAll<HTMLElement>("[data-toast-id]")).map((el) => el.dataset.toastId);
      expect(ids).toEqual([a, c]);
    });

    it("hideAll clears every imperative toast but leaves an open, controlled declarative Toast untouched", () => {
      const { get, query } = render(
        h(
          "div",
          null,
          h(Toast.Viewport, { "data-testid": "viewport" }),
          h(Toast, { open: true, duration: Infinity, "data-testid": "declarative" }, h(Toast.Title, null, "Standalone")),
        ),
      );
      toastController.show("Imperative", { duration: Infinity });
      toastController.hideAll();
      expect(query("[data-toast-id]")).toBeNull();
      expect(get("[data-testid=declarative]")).not.toBeNull();
    });
  });

  describe("Toast.Provider / Toast.Viewport", () => {
    it("flows the Provider's label to a nested Viewport's aria-label by default", () => {
      const { get } = render(h(Toast.Provider, { label: "Alerts" }, h(Toast.Viewport, { "data-testid": "viewport" })));
      expect(get("[data-testid=viewport]").getAttribute("aria-label")).toBe("Alerts");
    });

    it("lets Viewport's own label prop override the Provider default", () => {
      const { get } = render(h(Toast.Provider, { label: "Alerts" }, h(Toast.Viewport, { label: "Overrides", "data-testid": "viewport" })));
      expect(get("[data-testid=viewport]").getAttribute("aria-label")).toBe("Overrides");
    });
  });

  describe("dismissable-layer independence", () => {
    // unlike Dialog/AlertDialog/Sheet, Toast never registers with the shared layer engine (layers.ts)
    it("does not lock body scroll while open", () => {
      render(h(Example, { defaultOpen: true, duration: Infinity }));
      expect(document.body.style.overflow).not.toBe("hidden");
    });
  });
});
