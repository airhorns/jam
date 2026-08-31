// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick, focus } from "../../testing";
import { Popover } from "../../components/Popover";
import type { PopoverProps } from "../../components/Popover";

beforeEach(() => {
  setupDefaultUI();
});

type ExampleProps = Partial<PopoverProps> & { contentChildren?: VChild | VChild[] };

function Example(props: ExampleProps) {
  const { contentChildren, ...rest } = props;
  return h(
    Popover,
    rest,
    h(Popover.Trigger, { "data-testid": "trigger" }, "Open"),
    h(
      Popover.Content,
      { "data-testid": "content" },
      contentChildren ?? [h("button", { "data-testid": "first" }, "First"), h("button", { "data-testid": "last" }, "Last")],
    ),
  );
}

describe("Popover conformance", () => {
  describe("aria wiring", () => {
    // radix popover.test.tsx "aria-controls > should not reference a non-existent element while closed"
    it("does not point aria-controls at a non-existent element while closed", () => {
      const { get, query } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      expect(query("[data-testid=content]")).toBeNull();
      const controls = trigger.getAttribute("aria-controls");
      expect(controls == null || document.getElementById(controls) != null).toBe(true);
    });

    it("resets aria-expanded to false after an Escape dismissal", async () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      const trigger = get("[data-testid=trigger]");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      keydown(document.body, "Escape");
      await tick();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("resets aria-expanded to false after an outside-press dismissal", async () => {
      const { get, query } = render(h("div", null, h(Example, { defaultOpen: true }), h("button", { "data-testid": "outside" }, "Outside")));
      const trigger = get("[data-testid=trigger]");
      click(get("[data-testid=outside]"));
      await tick();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(query("[data-testid=content]")).toBeNull();
    });

    it("lets a consumer-supplied aria-haspopup override the dialog default", () => {
      const { get } = render(
        h(
          Popover,
          {},
          h(Popover.Trigger, { "data-testid": "trigger", "aria-haspopup": "menu" }, "Open"),
          h(Popover.Content, {}, "hi"),
        ),
      );
      expect(get("[data-testid=trigger]").getAttribute("aria-haspopup")).toBe("menu");
    });
  });

  describe("focus management", () => {
    it("does not trap Tab on the last focusable element when non-modal", async () => {
      const { get } = render(h(Example, { defaultOpen: true, modal: false }));
      await tick();
      const last = get("[data-testid=last]");
      last.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(last);
    });

    // APG dialog modal pattern: Tab on the last focusable element loops to the first.
    it("loops Tab from the last focusable to the first when modal", async () => {
      const { get } = render(h(Example, { defaultOpen: true, modal: true }));
      await tick();
      const last = get("[data-testid=last]");
      last.focus();
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=first]"));
    });

    it("loops Shift+Tab from the first focusable to the last when modal", async () => {
      const { get } = render(h(Example, { defaultOpen: true, modal: true }));
      await tick();
      const first = get("[data-testid=first]");
      first.focus();
      const event = keydown(document.body, "Tab", { shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(get("[data-testid=last]"));
    });

    it("traps Tab on the content itself when modal content has no focusable elements", async () => {
      const { get } = render(h(Example, { defaultOpen: true, modal: true, contentChildren: "Just some text" }));
      await tick();
      const content = get("[data-testid=content]");
      expect(document.activeElement).toBe(content);
      const event = keydown(document.body, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(content);
    });

    it("locks body scroll while a modal popover is open and restores it on close", async () => {
      document.body.style.overflow = "scroll";
      const { get, query } = render(h(Example, { defaultOpen: true, modal: true }));
      await tick();
      expect(document.body.style.overflow).toBe("hidden");
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=content]")).toBeNull();
      expect(document.body.style.overflow).toBe("scroll");
    });

    it("leaves focus where it was when disableFocus is set", async () => {
      const { get } = render(h("div", null, h("button", { "data-testid": "elsewhere" }, "Elsewhere"), h(Example, { disableFocus: true })));
      const elsewhere = get("[data-testid=elsewhere]");
      focus(elsewhere);
      click(get("[data-testid=trigger]"));
      await tick();
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  describe("dismissal rules", () => {
    it("ignores Escape when dismissOnEscape is false", async () => {
      const { query } = render(h(Example, { defaultOpen: true, dismissOnEscape: false }));
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("ignores an outside press when dismissOnOutsidePress is false", async () => {
      const { get, query } = render(h("div", null, h(Example, { defaultOpen: true, dismissOnOutsidePress: false }), h("button", { "data-testid": "outside" }, "Outside")));
      click(get("[data-testid=outside]"));
      await tick();
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    it("stays open when focus moves outside and dismissOnFocusOutside is explicitly false", async () => {
      const { get, query } = render(h("div", null, h(Example, { defaultOpen: true, dismissOnFocusOutside: false }), h("button", { "data-testid": "outside" }, "Outside")));
      focus(get("[data-testid=outside]"));
      expect(query("[data-testid=content]")).not.toBeNull();
    });

    // docs: dismissOnFocusOutside defaults to `!modal`, so a modal popover should ignore focus moving outside.
    it("defaults dismissOnFocusOutside to false when modal", async () => {
      const { get, query } = render(h("div", null, h(Example, { defaultOpen: true, modal: true }), h("button", { "data-testid": "outside" }, "Outside")));
      await tick();
      focus(get("[data-testid=outside]"));
      expect(query("[data-testid=content]")).not.toBeNull();
    });
  });

  describe("nesting", () => {
    function NestedExample() {
      return h(
        Popover,
        { defaultOpen: true },
        h(Popover.Trigger, { "data-testid": "outer-trigger" }, "Outer"),
        h(
          Popover.Content,
          { "data-testid": "outer-content" },
          h(
            Popover,
            { defaultOpen: true },
            h(Popover.Trigger, { "data-testid": "inner-trigger" }, "Inner"),
            h(Popover.Content, { "data-testid": "inner-content" }, "Inner content"),
          ),
        ),
      );
    }

    // layers.ts intends only the topmost layer to react to a dismissal; the outer popover
    // should be untouched by the inner one closing.
    it("closes only the innermost popover on Escape", async () => {
      const { get, query } = render(h(NestedExample, {}));
      await tick();
      expect(query("[data-testid=inner-content]")).not.toBeNull();
      expect(query("[data-testid=outer-content]")).not.toBeNull();
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=inner-content]")).toBeNull();
      expect(query("[data-testid=outer-content]")).not.toBeNull();
      keydown(document.body, "Escape");
      await tick();
      expect(query("[data-testid=outer-content]")).toBeNull();
    });

    // same intent as the Escape case above.
    it("closes only the innermost popover on an outside press", async () => {
      const { get, query } = render(h("div", null, h(NestedExample, {}), h("button", { "data-testid": "outside" }, "Outside")));
      await tick();
      click(get("[data-testid=outside]"));
      await tick();
      expect(query("[data-testid=inner-content]")).toBeNull();
      expect(query("[data-testid=outer-content]")).not.toBeNull();
    });
  });

  describe("controlled state", () => {
    it("calls onOpenChange exactly once when Escape dismisses", async () => {
      const onOpenChange = vi.fn();
      render(h(Example, { defaultOpen: true, onOpenChange }));
      keydown(document.body, "Escape");
      await tick();
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onOpenChange exactly once when an outside press dismisses", async () => {
      const onOpenChange = vi.fn();
      const { get } = render(h("div", null, h(Example, { defaultOpen: true, onOpenChange }), h("button", { "data-testid": "outside" }, "Outside")));
      click(get("[data-testid=outside]"));
      await tick();
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onOpenChange exactly once when Popover.Close is clicked", () => {
      const onOpenChange = vi.fn();
      const { get } = render(
        h(
          Popover,
          { defaultOpen: true, onOpenChange },
          h(Popover.Trigger, {}, "Open"),
          h(Popover.Content, {}, h(Popover.Close, { "data-testid": "close" }, "Close")),
        ),
      );
      click(get("[data-testid=close]"));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // use-controllable-state contract: a controlled prop is the single source of truth; the
    // component must not keep its own copy that diverges from it once the parent ignores onOpenChange.
    it("does not mutate a controlled open prop itself", async () => {
      const onOpenChange = vi.fn();
      const { query } = render(h(Example, { open: true, onOpenChange }));
      keydown(document.body, "Escape");
      await tick();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(query("[data-testid=content]")).not.toBeNull();
    });
  });
});
