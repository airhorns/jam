// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick, focus, blur, pointerEnter, pointerLeave } from "../../testing";
import { Tooltip } from "../../components/Tooltip";

beforeEach(() => {
  setupDefaultUI();
});

function Example(props: { delay?: number; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return h(
    Tooltip,
    { delay: props.delay ?? 0, open: props.open, onOpenChange: props.onOpenChange },
    h(Tooltip.Trigger, { "data-testid": "trigger" }, "Hover me"),
    h(Tooltip.Content, { "data-testid": "content" }, "Helpful hint"),
  );
}

function twoTooltips(delay: number) {
  return h(
    "div",
    null,
    h(Tooltip, { delay }, h(Tooltip.Trigger, { "data-testid": "triggerA" }, "A"), h(Tooltip.Content, { "data-testid": "contentA" }, "Tip A")),
    h(Tooltip, { delay }, h(Tooltip.Trigger, { "data-testid": "triggerB" }, "B"), h(Tooltip.Content, { "data-testid": "contentB" }, "Tip B")),
  );
}

describe("Tooltip conformance", () => {
  describe("hover delay", () => {
    it("re-arms the full hover delay after closing, since there is no Provider to pool skipDelayDuration across opens", async () => {
      vi.useFakeTimers();
      try {
        const { get, query } = render(h(Example, { delay: 100 }));
        const trigger = get("[data-testid=trigger]");
        pointerEnter(trigger);
        await vi.advanceTimersByTimeAsync(100);
        expect(query("[data-testid=content]")).not.toBeNull();
        pointerLeave(trigger);
        expect(query("[data-testid=content]")).toBeNull();
        pointerEnter(trigger);
        await vi.advanceTimersByTimeAsync(50);
        expect(query("[data-testid=content]")).toBeNull();
        await vi.advanceTimersByTimeAsync(50);
        expect(query("[data-testid=content]")).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    // Radix tooltip.tsx TooltipTrigger onFocus: opens immediately regardless of delayDuration.
    it("delay has no effect on opening via keyboard focus", () => {
      const { get, query } = render(h(Example, { delay: 100_000 }));
      focus(get("[data-testid=trigger]"));
      expect(query("[data-testid=content]")).not.toBeNull();
    });
  });

  describe("pointer / focus interplay", () => {
    // Radix tooltip.tsx TooltipTrigger: onFocus only opens `if (!isPointerDownRef.current)`,
    // so a click's implicit focus does not reopen a tooltip the click's pointerdown/onClick just closed.
    it("a pointerdown immediately followed by the focus it causes (as in a mouse click) does not open a closed tooltip", () => {
      const { get, query } = render(h(Example, { delay: 0 }));
      const trigger = get("[data-testid=trigger]");
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      focus(trigger);
      expect(query("[data-testid=content]")).toBeNull();
    });

    // Radix tooltip.tsx TooltipTrigger onPointerMove: `if (event.pointerType === 'touch') return`.
    it("a touch pointerenter does not schedule an open", async () => {
      const { get, query } = render(h(Example, { delay: 0 }));
      const trigger = get("[data-testid=trigger]");
      trigger.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false, pointerType: "touch" }));
      await tick();
      expect(query("[data-testid=content]")).toBeNull();
    });
  });

  describe("hoverable content", () => {
    // Docs: Tooltip.Content has pointerEvents:none; the trigger's own pointerleave always closes,
    // matching Radix's disableHoverableContent=true rather than Radix's default hoverable content.
    it("moving the pointer onto the content after leaving the trigger does not keep the tooltip open", () => {
      const { get, query } = render(h(Example, { delay: 0 }));
      const trigger = get("[data-testid=trigger]");
      pointerEnter(trigger);
      const content = get("[data-testid=content]");
      pointerLeave(trigger);
      pointerEnter(content);
      expect(query("[data-testid=content]")).toBeNull();
    });
  });

  describe("dismissal", () => {
    // dismissable-layer onKeyDown: `event.preventDefault()` before `onDismiss()`.
    it("Escape closes an open tooltip and prevents the underlying keydown default", () => {
      const { get, query } = render(h(Example, { delay: 0 }));
      focus(get("[data-testid=trigger]"));
      const event = keydown(document.body, "Escape");
      expect(event.defaultPrevented).toBe(true);
      expect(query("[data-testid=content]")).toBeNull();
    });

    // Tooltip.ts wires autoFocus:false, restoreFocus:false: focus never left the trigger to begin with.
    it("Escape closes without moving focus away from the trigger", () => {
      const { get, query } = render(h(Example, { delay: 0 }));
      const trigger = get("[data-testid=trigger]");
      focus(trigger);
      expect(document.activeElement).toBe(trigger);
      keydown(document.body, "Escape");
      expect(query("[data-testid=content]")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("a pointerdown outside the trigger and content closes the tooltip via the shared dismissable-layer program", () => {
      const { get, query } = render(h("div", null, h(Example, { delay: 0 }), h("button", { "data-testid": "outside" }, "Outside")));
      focus(get("[data-testid=trigger]"));
      click(get("[data-testid=outside]"));
      expect(query("[data-testid=content]")).toBeNull();
    });

    it("Escape closes only the topmost of two independently open tooltips", () => {
      const { get, query } = render(twoTooltips(0));
      pointerEnter(get("[data-testid=triggerA]"));
      pointerEnter(get("[data-testid=triggerB]"));
      expect(query("[data-testid=contentA]")).not.toBeNull();
      expect(query("[data-testid=contentB]")).not.toBeNull();
      keydown(document.body, "Escape");
      expect(query("[data-testid=contentB]")).toBeNull();
      expect(query("[data-testid=contentA]")).not.toBeNull();
    });
  });

  describe("aria", () => {
    it("clears aria-describedby synchronously on blur, not just after a tick", () => {
      const { get } = render(h(Example, { delay: 0 }));
      const trigger = get("[data-testid=trigger]");
      focus(trigger);
      expect(trigger.hasAttribute("aria-describedby")).toBe(true);
      blur(trigger);
      expect(trigger.hasAttribute("aria-describedby")).toBe(false);
    });

    // Radix tooltip.test.tsx "appends the tooltip id to an existing aria-describedby": Radix preserves a
    // caller-supplied aria-describedby while closed, and concatenates ("existing-description <contentId>")
    // while open. Ours drops the caller's value unconditionally, even before the tooltip ever opens.
    it("drops a caller-supplied aria-describedby instead of preserving/appending to it", () => {
      const { get } = render(
        h(
          Tooltip,
          { delay: 0 },
          h(Tooltip.Trigger, { "data-testid": "trigger", "aria-describedby": "existing-description" }, "Trigger"),
          h(Tooltip.Content, { "data-testid": "content" }, "Tip"),
        ),
      );
      const trigger = get("[data-testid=trigger]");
      expect(trigger.getAttribute("aria-describedby")).toBe("existing-description");
      focus(trigger);
      const content = get("[data-testid=content]");
      expect(trigger.getAttribute("aria-describedby")).toBe(`existing-description ${content.id}`);
      blur(trigger);
      expect(trigger.getAttribute("aria-describedby")).toBe("existing-description");
    });
  });

  describe("state", () => {
    it("onOpenChange fires exactly once per open and once per close", () => {
      const onOpenChange = vi.fn();
      const { get } = render(h(Example, { delay: 0, onOpenChange }));
      const trigger = get("[data-testid=trigger]");
      focus(trigger);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      blur(trigger);
      expect(onOpenChange).toHaveBeenCalledTimes(2);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });

    it("controlled open stays false through a focus-driven open attempt, only notifying via onOpenChange", () => {
      const onOpenChange = vi.fn();
      const { get, query } = render(h(Example, { open: false, delay: 0, onOpenChange }));
      focus(get("[data-testid=trigger]"));
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(query("[data-testid=content]")).toBeNull();
    });
  });

  describe("disabled trigger", () => {
    // Tooltip.ts has no `disabled` prop or disabled-awareness at all; probing what a disabled real button does.
    it("a disabled trigger (asChild onto a disabled button) still opens on pointer enter", () => {
      const { get, query } = render(
        h(
          Tooltip,
          { delay: 0 },
          h(Tooltip.Trigger, { asChild: true }, h("button", { "data-testid": "trigger", disabled: true }, "Trigger")),
          h(Tooltip.Content, { "data-testid": "content" }, "Tip"),
        ),
      );
      const trigger = get("[data-testid=trigger]");
      expect(trigger.hasAttribute("disabled")).toBe(true);
      pointerEnter(trigger);
      expect(query("[data-testid=content]")).not.toBeNull();
    });
  });

  describe("missing Tooltip.Provider (skipDelayDuration / disableHoverableContent / single-visible coordination)", () => {
    it("hovering a second tooltip immediately after the first opens still waits the full delay (no skipDelayDuration pooling)", async () => {
      vi.useFakeTimers();
      try {
        const { get, query } = render(twoTooltips(100));
        pointerEnter(get("[data-testid=triggerA]"));
        await vi.advanceTimersByTimeAsync(100);
        expect(query("[data-testid=contentA]")).not.toBeNull();
        pointerEnter(get("[data-testid=triggerB]"));
        expect(query("[data-testid=contentB]")).toBeNull();
        await vi.advanceTimersByTimeAsync(100);
        expect(query("[data-testid=contentB]")).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    // Radix tooltip.tsx: opening any Tooltip dispatches a document 'tooltip.open' CustomEvent that every
    // other open TooltipContent listens for and closes on — independent of Provider config.
    it("opening a second tooltip closes an already-open first tooltip", () => {
      const { get, query } = render(twoTooltips(0));
      pointerEnter(get("[data-testid=triggerA]"));
      expect(query("[data-testid=contentA]")).not.toBeNull();
      pointerEnter(get("[data-testid=triggerB]"));
      expect(query("[data-testid=contentA]")).toBeNull();
    });
  });
});
