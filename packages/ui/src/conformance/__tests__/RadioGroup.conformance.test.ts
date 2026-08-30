// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, keydown, focus, setupDefaultUI } from "../../testing";
import { RadioGroup } from "../../components/RadioGroup";

beforeEach(() => {
  setupDefaultUI();
});

const group = (props: Record<string, unknown> = {}, values = ["a", "b", "c"], itemProps: Record<string, unknown> = {}) =>
  render(
    h(
      RadioGroup,
      props as never,
      ...values.map((value, i) => h(RadioGroup.Item, { key: value, value, ...(i === values.length - 1 ? itemProps : {}) }, h(RadioGroup.Indicator, null))),
    ),
  );

const radios = (r: ReturnType<typeof render>) => r.all("[role=radio]");

describe("RadioGroup conformance", () => {
  describe("keyboard", () => {
    it("ignores a key bubbling from a focusable nested in an item, matching Radix's per-item target guard", () => {
      const r = render(
        h(
          RadioGroup,
          { defaultValue: "a" } as never,
          h(RadioGroup.Item, { value: "a" }, "First"),
          h(RadioGroup.Item, { value: "b" }, h("button", { key: "nested" }, "nested")),
          h(RadioGroup.Item, { value: "c" }, "Third"),
        ),
      );
      const nestedButton = r.get("[role=radio] button") as HTMLElement;
      nestedButton.focus();
      const event = keydown(nestedButton, "ArrowDown");
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(nestedButton);
    });

    it("threads `dir` through rovingFocus, reversing ArrowLeft/ArrowRight in horizontal orientation, like radio-group.tsx's RovingFocusGroup.Root", () => {
      // Three items so RTL's "previous" (index 2, wrapping) and plain-LTR "next" (index 1)
      // actually disagree — with only two items wrapping makes them coincide.
      const r = group({ orientation: "horizontal", dir: "rtl", defaultValue: "a" } as never);
      const items = radios(r);
      items[0].focus();
      // In RTL, ArrowRight maps to "previous": from the first item that wraps to the last.
      keydown(items[0], "ArrowRight");
      expect(document.activeElement).toBe(items[2]);
    });

    it("preventDefaults Enter on an item, since radio groups don't activate items on Enter per WAI-ARIA, like radio.tsx's RadioGroupItemTrigger", () => {
      const r = group({ defaultValue: "a" });
      const items = radios(r);
      items[0].focus();
      const event = keydown(items[0], "Enter");
      expect(event.defaultPrevented).toBe(true);
    });

    it("exposes a `loop` prop (default true) to opt out of end-to-end wraparound, forwarded to rovingFocus like radio-group.tsx forwards it to RovingFocusGroup", () => {
      const r = group({ loop: false } as never);
      const items = radios(r);
      items[2].focus();
      keydown(items[2], "ArrowDown");
      expect(document.activeElement).toBe(items[2]);
    });

    it("Home/End move to the first/last item regardless of orientation, in horizontal orientation too", () => {
      const r = group({ orientation: "horizontal", defaultValue: "a" } as never);
      const items = radios(r);
      items[0].focus();
      keydown(items[0], "End");
      expect(document.activeElement).toBe(items[2]);
      expect(items[2].getAttribute("aria-checked")).toBe("true");
      keydown(items[2], "Home");
      expect(document.activeElement).toBe(items[0]);
    });

    it("End skips a disabled last item and lands on the last enabled one", () => {
      const r = group({ defaultValue: "a" }, ["a", "b", "c"], { disabled: true });
      const items = radios(r);
      items[0].focus();
      keydown(items[0], "End");
      expect(document.activeElement).toBe(items[1]);
    });

    it("a consumer onKeyDown handler passed to the group still fires (composed, not replaced)", () => {
      const onKeyDown = vi.fn();
      const r = group({ defaultValue: "a", onKeyDown } as never);
      const items = radios(r);
      items[0].focus();
      keydown(items[0], "ArrowDown");
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe("focus management", () => {
    it("radio-group.tsx: an item only becomes checked when it receives focus during arrow-key navigation (isArrowKeyPressedRef), not from a plain programmatic .focus()", () => {
      const r = group({ defaultValue: "a" });
      const items = radios(r);
      focus(items[1]);
      expect(items[1].getAttribute("aria-checked")).toBe("false");
    });

    it.skip("clicking an item focuses it — Radix's RadioTrigger has no explicit .focus() call either, relying on the native click-focuses-<button> default action; happy-dom's click() helper does not dispatch that", () => {
      const r = group({ defaultValue: "a" });
      const items = radios(r);
      click(items[2]);
      expect(document.activeElement).toBe(items[2]);
    });
  });

  describe("aria", () => {
    it("sets `aria-required={required}` unconditionally, rendering 'false' when not required, like radio-group.tsx", () => {
      const r = group();
      expect(r.root.hasAttribute("aria-required")).toBe(true);
      expect(r.root.getAttribute("aria-required")).toBe("false");
    });

    it("renders a visually-hidden <input type=radio> per item for native form integration, like radio.tsx", () => {
      const r = group({ name: "plan", required: true });
      expect(r.all("input[type=radio]").length).toBeGreaterThan(0);
    });

    // data-disabled is the empty string when disabled, never "true" (matches Slider/Switch/Checkbox convention and Radix's data-disabled={disabled ? '' : undefined}).
    it("the group itself carries data-disabled when disabled, not just its items", () => {
      const r = group({ disabled: true });
      expect(r.root.getAttribute("data-disabled")).toBe("");
    });
  });

  describe("state", () => {
    it("re-selecting the already-checked item does not call onValueChange again (useControllableState only fires on real change; Radix: 'should not uncheck an item when clicked again')", () => {
      const onValueChange = vi.fn();
      const r = group({ defaultValue: "a", onValueChange });
      click(radios(r)[0]);
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it("clicking a disabled item directly does not select it or call onValueChange", () => {
      const onValueChange = vi.fn();
      const r = group({ onValueChange }, ["a", "b", "c"], { disabled: true });
      click(radios(r)[2]);
      expect(onValueChange).not.toHaveBeenCalled();
      expect(radios(r)[2].getAttribute("aria-checked")).toBe("false");
    });

    it("arrow-key navigation calls onValueChange exactly once with the newly-focused item's value", () => {
      const onValueChange = vi.fn();
      const r = group({ defaultValue: "a", onValueChange });
      const items = radios(r);
      items[0].focus();
      keydown(items[0], "ArrowDown");
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith("b");
    });
  });
});
