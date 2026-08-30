// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, keydown, focus, setupDefaultUI } from "../../testing";
import { Switch } from "../../components/Switch";
import { Label } from "../../components/Label";

beforeEach(() => {
  setupDefaultUI();
});

const thumb = (r: ReturnType<typeof render>) => r.get(".is_SwitchThumb");

describe("Switch conformance", () => {
  describe("keyboard", () => {
    // radix switch.tsx SwitchTrigger has no onKeyDown handler at all (unlike
    // CheckboxTrigger's explicit Enter-preventDefault); Space/Enter activation
    // is left entirely to the native button's default keyup-to-click action.
    it("leaves Enter to the native button, unlike Checkbox which explicitly preventDefaults it", () => {
      const r = render(h(Switch, null));
      const event = keydown(r.root, "Enter");
      expect(event.defaultPrevented).toBe(false);
    });

    it.skip("Space toggles the switch (happy-dom has no native keydown-to-click default action for buttons)", () => {});

    it("does not call onCheckedChange for Space or Enter while disabled", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Switch, { disabled: true, onCheckedChange }));
      keydown(r.root, " ");
      keydown(r.root, "Enter");
      expect(onCheckedChange).not.toHaveBeenCalled();
    });

    // Switch.ts onKeyDown returns before calling preventDefault when disabled,
    // relying on the native disabled attribute rather than an explicit guard.
    it("does not preventDefault an ArrowRight press while disabled", () => {
      const r = render(h(Switch, { disabled: true }));
      const event = keydown(r.root, "ArrowRight");
      expect(event.defaultPrevented).toBe(false);
    });

    // Documented, deliberate addition beyond Radix's contract (Switch.ts doc
    // comment: "the arrow keys set it off and on explicitly"). useControllableState
    // (state.ts) dedupes same-value updates, so a redundant ArrowRight is a no-op.
    it("does not call onCheckedChange for a redundant ArrowRight press that leaves the value unchanged", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Switch, { defaultChecked: true, onCheckedChange }));
      keydown(r.root, "ArrowRight");
      expect(onCheckedChange).not.toHaveBeenCalled();
    });
  });

  describe("focus", () => {
    // APG switch pattern: the switch's checked state is toggled only by
    // activation (click/Space/Enter), never merely by receiving focus.
    it("does not change checked state merely by receiving focus", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Switch, { onCheckedChange }));
      focus(r.root as HTMLElement);
      expect(onCheckedChange).not.toHaveBeenCalled();
      expect(r.root.getAttribute("aria-checked")).toBe("false");
    });
  });

  describe("aria / data attributes", () => {
    // radix switch.tsx SwitchProviderProps includes `required?: boolean`,
    // reflected as aria-required={required} on SwitchTrigger; SwitchProps has
    // no `required` field at all, so it can never be set (missing feature).
    it("has no way to set aria-required, since required is not a prop", () => {
      const r = render(h(Switch, { ...({ required: true } as Record<string, unknown>) }));
      expect(r.root.hasAttribute("aria-required")).toBe(false);
    });

    // radix switch.tsx SwitchTrigger: data-disabled={disabled ? '' : undefined}
    it("sets data-disabled on the root when disabled (missing: styled() has no automatic data-disabled injection)", () => {
      const r = render(h(Switch, { disabled: true }));
      expect(r.root.hasAttribute("data-disabled")).toBe(true);
    });

    it("does not set data-disabled on the root when enabled", () => {
      const r = render(h(Switch, null));
      expect(r.root.hasAttribute("data-disabled")).toBe(false);
    });

    // radix switch.tsx SwitchThumb: data-disabled={context.disabled ? '' : undefined}
    // Our SwitchState context only carries `checked`, so Switch.Thumb has no
    // way to know the parent is disabled at all.
    it("sets data-disabled on Switch.Thumb when the parent Switch is disabled", () => {
      const r = render(h(Switch, { disabled: true }, h(Switch.Thumb, null)));
      expect(thumb(r).hasAttribute("data-disabled")).toBe(true);
    });
  });

  describe("controlled / uncontrolled semantics", () => {
    it("calls onCheckedChange exactly once per click when uncontrolled", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Switch, { defaultChecked: false, onCheckedChange }));
      click(r.root);
      expect(onCheckedChange).toHaveBeenCalledTimes(1);
    });

    it("never mutates a controlled checked value across repeated clicks, reporting every one", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Switch, { checked: false, onCheckedChange }));
      click(r.root);
      click(r.root);
      click(r.root);
      expect(r.root.getAttribute("aria-checked")).toBe("false");
      expect(onCheckedChange).toHaveBeenCalledTimes(3);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    // Switch.Thumb reads `checked` from SwitchState context, which is derived
    // from the Switch's own (here: controlled, externally-fixed) value - a
    // click must not advance the thumb on its own.
    it("keeps Switch.Thumb's data-state pinned to a controlled value across clicks", () => {
      const r = render(h(Switch, { checked: false }, h(Switch.Thumb, null)));
      click(r.root);
      expect(thumb(r).dataset.state).toBe("unchecked");
    });
  });

  describe("form integration", () => {
    // radix switch.tsx: SwitchProviderProps carries `name`, `form`, `value`
    // (default 'on'); SwitchTrigger renders a hidden SwitchBubbleInput mirror
    // so the switch participates in FormData. SwitchProps has none of this.
    it("has no name/value props and contributes nothing to FormData", () => {
      const r = render(h("form", null, h(Switch, { ...({ name: "notifications" } as Record<string, unknown>), defaultChecked: true })));
      expect(r.query("input")).toBeNull();
      const data = new FormData(r.root as HTMLFormElement);
      expect(data.has("notifications")).toBe(false);
    });

    // radix switch.tsx SwitchTrigger effect: registers a `reset` listener on
    // control.form via initialCheckedStateRef that restores the initial
    // checked state; Switch.ts has no such effect at all.
    it("does not restore its initial state when the owning form is reset (missing: no reset listener)", () => {
      const r = render(h("form", null, h(Switch, { defaultChecked: false })));
      const form = r.root as HTMLFormElement;
      click(r.get("button"));
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
      form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    });
  });

  describe("label integration", () => {
    // Native <label for> click forwarding; happy-dom's HTMLLabelElement
    // dispatches a click at its associated BUTTON-tagged control.
    it("toggles the switch when its <label for> is clicked", () => {
      const r = render(
        h(
          "div",
          null,
          h(Switch, { id: "notifications" }),
          h(Label, { htmlFor: "notifications" }, "Notifications"),
        ),
      );
      const label = r.get("label");
      expect(label.getAttribute("for")).toBe("notifications");
      click(label);
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    });
  });
});
