// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, keydown, setupDefaultUI } from "../../testing";
import { Checkbox } from "../../components/Checkbox";
import { Label } from "../../components/Label";

beforeEach(() => {
  setupDefaultUI();
});

describe("Checkbox conformance", () => {
  describe("keyboard", () => {
    // APG checkbox pattern: Space activates the checkbox. Neither Radix's
    // CheckboxTrigger nor ours implement this in JS - both rely on the
    // browser's native button activation behaviour on keyup, which happy-dom
    // does not simulate (no default action wired from keydown to click).
    it.skip("Space toggles the checkbox (happy-dom has no native keydown-to-click default action for buttons)", () => {});

    // radix checkbox.tsx CheckboxTrigger onKeyDown: "According to WAI ARIA,
    // Checkboxes don't activate on enter keypress" - preventDefault on Enter.
    it("prevents default on Enter so the native button does not activate it", () => {
      const r = render(h(Checkbox, null));
      const event = keydown(r.root, "Enter");
      expect(event.defaultPrevented).toBe(true);
    });

    it("does not call onCheckedChange when Space or Enter is pressed while disabled", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Checkbox, { disabled: true, onCheckedChange }));
      keydown(r.root, " ");
      keydown(r.root, "Enter");
      expect(onCheckedChange).not.toHaveBeenCalled();
    });
  });

  describe("aria / data attributes", () => {
    // radix checkbox.tsx CheckboxTrigger: data-disabled={disabled ? '' : undefined}
    it("sets data-disabled when disabled", () => {
      const r = render(h(Checkbox, { disabled: true }));
      expect(r.root.hasAttribute("data-disabled")).toBe(true);
    });

    it("does not set data-disabled when enabled", () => {
      const r = render(h(Checkbox, null));
      expect(r.root.hasAttribute("data-disabled")).toBe(false);
    });
  });

  describe("controlled / uncontrolled semantics", () => {
    it("calls onCheckedChange exactly once per click", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Checkbox, { defaultChecked: false, onCheckedChange }));
      click(r.root);
      expect(onCheckedChange).toHaveBeenCalledTimes(1);
    });

    it("never mutates a controlled checked value across repeated clicks", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Checkbox, { checked: false, onCheckedChange }));
      click(r.root);
      click(r.root);
      click(r.root);
      expect(r.root.getAttribute("aria-checked")).toBe("false");
      expect(onCheckedChange).toHaveBeenCalledTimes(3);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    // radix checkbox.tsx onClick: setChecked(prev => isIndeterminate(prev) ? true : !prev)
    it("reports true (never indeterminate or false) when a controlled indeterminate checkbox is clicked", () => {
      const onCheckedChange = vi.fn();
      const r = render(h(Checkbox, { checked: "indeterminate", onCheckedChange }));
      click(r.root);
      click(r.root);
      expect(onCheckedChange).toHaveBeenCalledTimes(2);
      expect(onCheckedChange).toHaveBeenNthCalledWith(1, true);
      expect(onCheckedChange).toHaveBeenNthCalledWith(2, true);
    });

    it("toggles the Indicator's presence back off on a second click", () => {
      const r = render(h(Checkbox, { defaultChecked: false }, h(Checkbox.Indicator, null)));
      click(r.root);
      expect(r.query(".is_CheckboxIndicator")).not.toBeNull();
      click(r.root);
      expect(r.query(".is_CheckboxIndicator")).toBeNull();
    });
  });

  describe("form integration", () => {
    // radix checkbox.tsx CheckboxTrigger effect: registers a `reset` listener
    // on control.form that restores the initial checked state.
    it("restores its initial state when the owning form is reset", () => {
      const r = render(h("form", null, h(Checkbox, { name: "terms", defaultChecked: false })));
      const form = r.root as HTMLFormElement;
      click(r.get("button"));
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
      form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
      expect(r.get("button").getAttribute("aria-checked")).toBe("false");
    });

    it("mirrors `required` onto the hidden input independently of aria-required", () => {
      const r = render(h(Checkbox, { name: "terms", required: true }));
      const input = r.get<HTMLInputElement>("input[type=checkbox]");
      expect(input.required).toBe(true);
      expect(r.get("button").getAttribute("aria-required")).toBe("true");
    });

    it("renders no hidden input at all when name is omitted", () => {
      const r = render(h(Checkbox, null));
      expect(r.query("input[type=checkbox]")).toBeNull();
    });

    // radix checkbox.tsx: value={inputProps.value ?? 'on'}
    it("defaults the hidden input's value to 'on' when value is omitted", () => {
      const r = render(h(Checkbox, { name: "terms" }));
      expect(r.get<HTMLInputElement>("input[type=checkbox]").value).toBe("on");
    });

    it("mirrors indeterminate as unchecked (not indeterminate) on the hidden input", () => {
      const r = render(h(Checkbox, { name: "terms", checked: "indeterminate" }));
      expect(r.get<HTMLInputElement>("input[type=checkbox]").checked).toBe(false);
    });

    it("disables the hidden input to match a disabled control, so it is excluded from FormData", () => {
      const r = render(h("form", null, h(Checkbox, { name: "terms", disabled: true, defaultChecked: true })));
      expect(r.get<HTMLInputElement>("input[type=checkbox]").disabled).toBe(true);
      const data = new FormData(r.root as HTMLFormElement);
      expect(data.has("terms")).toBe(false);
    });

    it("reports only the checked boxes' values in FormData, grouped by name", () => {
      const r = render(
        h(
          "form",
          null,
          h(Checkbox, { name: "color", value: "red", defaultChecked: true }),
          h(Checkbox, { name: "color", value: "blue", defaultChecked: false }),
        ),
      );
      const data = new FormData(r.root as HTMLFormElement);
      expect(data.getAll("color")).toEqual(["red"]);
    });

    // Native <label for> click forwarding; happy-dom's HTMLLabelElement
    // dispatches a click at its associated control.
    it("toggles the checkbox when its <label for> is clicked", () => {
      const r = render(
        h(
          "div",
          null,
          h(Checkbox, { id: "terms" }),
          h(Label, { htmlFor: "terms" }, "Accept"),
        ),
      );
      const label = r.get("label");
      expect(label.getAttribute("for")).toBe("terms");
      click(label);
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    });
  });
});
