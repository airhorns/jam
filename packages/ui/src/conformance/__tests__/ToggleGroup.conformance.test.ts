// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, keydown, setupDefaultUI } from "../../testing";
import { ToggleGroup } from "../../components/ToggleGroup";

beforeEach(() => {
  setupDefaultUI();
});

const group = (props: Record<string, unknown> = {}, values = ["a", "b", "c"], itemProps: Record<string, unknown> = {}) =>
  render(
    h(
      ToggleGroup,
      props as never,
      ...values.map((value, i) => h(ToggleGroup.Item, { key: value, value, ...(i === values.length - 1 ? itemProps : {}) }, value)),
    ),
  );

const items = (r: ReturnType<typeof render>) => r.all("button[aria-pressed], button[role=radio]");

describe("ToggleGroup conformance", () => {
  describe("keyboard", () => {
    // toggle-group.tsx's ToggleGroupItem is a RovingFocusGroup.Item, which only handles keys aimed at itself.
    it("ignores a key bubbling from a focusable nested in an item, matching Radix's per-item target guard", () => {
      const r = render(
        h(
          ToggleGroup,
          { defaultValue: "a" } as never,
          h(ToggleGroup.Item, { value: "a" }, "First"),
          h(ToggleGroup.Item, { value: "b" }, h("button", { key: "nested" }, "nested")),
          h(ToggleGroup.Item, { value: "c" }, "Third"),
        ),
      );
      const nestedButton = r.get("button[aria-pressed] button") as HTMLElement;
      nestedButton.focus();
      const event = keydown(nestedButton, "ArrowDown");
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(nestedButton);
    });

    // toggle-group.tsx's ToggleGroupImpl threads `dir` into RovingFocusGroup.Root,
    // reversing ArrowLeft/ArrowRight in horizontal orientation.
    it("reverses ArrowLeft/ArrowRight for dir='rtl'", () => {
      const r = group({ orientation: "horizontal", dir: "rtl", defaultValue: "a" } as never);
      const buttons = items(r);
      buttons[0].focus();
      keydown(buttons[0], "ArrowRight");
      expect(document.activeElement).toBe(buttons[2]);
    });

    it("Home/End move focus to the first/last item", () => {
      const r = group({ orientation: "horizontal", defaultValue: "a" } as never);
      const buttons = items(r);
      buttons[0].focus();
      keydown(buttons[0], "End");
      expect(document.activeElement).toBe(buttons[2]);
      keydown(buttons[2], "Home");
      expect(document.activeElement).toBe(buttons[0]);
    });

    it("End skips a disabled last item and lands on the last enabled one", () => {
      const r = group({}, ["a", "b", "c"], { disabled: true });
      const buttons = items(r);
      buttons[0].focus();
      keydown(buttons[0], "End");
      expect(document.activeElement).toBe(buttons[1]);
    });

    it("loop=false stops at the ends instead of wrapping", () => {
      const r = group({ orientation: "horizontal", loop: false } as never);
      const buttons = items(r);
      buttons[0].focus();
      keydown(buttons[0], "ArrowLeft");
      expect(document.activeElement).toBe(buttons[0]);
      buttons[2].focus();
      keydown(buttons[2], "ArrowRight");
      expect(document.activeElement).toBe(buttons[2]);
    });

    // toggle.tsx's Toggle is a plain Primitive.button with no onKeyDown at all;
    // Space/Enter activation is left entirely to the native button default action.
    it("leaves Enter to the native button", () => {
      const r = group();
      const event = keydown(items(r)[0], "Enter");
      expect(event.defaultPrevented).toBe(false);
    });

    it("a consumer onKeyDown handler passed to the group still fires (composed, not replaced)", () => {
      const onKeyDown = vi.fn();
      const r = group({ onKeyDown } as never);
      const buttons = items(r);
      buttons[0].focus();
      keydown(buttons[0], "ArrowDown");
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe("aria / data attributes", () => {
    it.skip("uses role=radiogroup and role=radio/aria-checked for a single-select group (deliberate: we follow tamagui's role=\"group\" + aria-pressed convention documented in ToggleGroup.md, not Radix's radiogroup/radio)", () => {
      const r = group({ type: "single", defaultValue: "a" } as never);
      expect(r.root.getAttribute("role")).toBe("radiogroup");
      const first = items(r)[0];
      expect(first.getAttribute("role")).toBe("radio");
      expect(first.hasAttribute("aria-pressed")).toBe(false);
    });

    it.skip("uses role=toolbar for a multiple-select group (deliberate: we follow tamagui's role=\"group\" convention documented in ToggleGroup.md, not Radix's toolbar)", () => {
      const r = group({ type: "multiple" } as never);
      expect(r.root.getAttribute("role")).toBe("toolbar");
    });

    // toggle.tsx Toggle: data-disabled={props.disabled ? '' : undefined} on each item.
    it("sets data-disabled on a disabled item", () => {
      const r = group({}, ["a", "b"], { disabled: true });
      expect(items(r)[1].hasAttribute("data-disabled")).toBe(true);
    });

    it("sets data-disabled on the group itself when disabled", () => {
      const r = group({ disabled: true });
      expect(r.root.hasAttribute("data-disabled")).toBe(true);
    });

    it("disables every item when the group itself is disabled, without each item setting disabled individually", () => {
      const onValueChange = vi.fn();
      const r = group({ disabled: true, onValueChange });
      click(items(r)[0]);
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe("state / controlled semantics", () => {
    it("clicking the active item in a single-select group deselects it", () => {
      const onValueChange = vi.fn();
      const r = group({ type: "single", defaultValue: "a", onValueChange });
      click(items(r)[0]);
      expect(onValueChange).toHaveBeenCalledWith("");
    });

    // disableDeactivation has no Radix equivalent (type="single" always allows
    // deactivation); it's a deliberate addition documented on ToggleGroupBaseProps.
    it("disableDeactivation keeps the active single item active when clicked again (documented addition beyond Radix)", () => {
      const onValueChange = vi.fn();
      const r = group({ type: "single", defaultValue: "a", disableDeactivation: true, onValueChange } as never);
      click(items(r)[0]);
      expect(onValueChange).not.toHaveBeenCalled();
      expect(items(r)[0].getAttribute("aria-pressed")).toBe("true");
    });

    it("accumulates an array of values in a multiple-select group across distinct clicks", () => {
      const onValueChange = vi.fn();
      const r = group({ type: "multiple", onValueChange } as never);
      const buttons = items(r);
      click(buttons[0]);
      click(buttons[1]);
      expect(onValueChange).toHaveBeenNthCalledWith(1, ["a"]);
      expect(onValueChange).toHaveBeenNthCalledWith(2, ["a", "b"]);
    });

    it("clicking a disabled item directly does not toggle it or call onValueChange", () => {
      const onValueChange = vi.fn();
      const r = group({ onValueChange }, ["a", "b"], { disabled: true });
      click(items(r)[1]);
      expect(onValueChange).not.toHaveBeenCalled();
      expect(items(r)[1].getAttribute("aria-pressed")).toBe("false");
    });

    it("defaults to type=single and reports an empty string, not an array, when deselected", () => {
      const onValueChange = vi.fn();
      const r = group({ defaultValue: "a", onValueChange });
      click(items(r)[0]);
      expect(onValueChange).toHaveBeenCalledWith("");
    });
  });
});
