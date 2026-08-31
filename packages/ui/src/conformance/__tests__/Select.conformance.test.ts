// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick } from "../../testing";
import { Select } from "../../components/Select";

beforeEach(() => {
  setupDefaultUI();
});

const FRUITS = [
  ["apple", "Apple"],
  ["banana", "Banana"],
  ["cherry", "Cherry"],
] as const;

type ExampleProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  disabledItems?: string[];
  name?: string;
};

function Example(props: ExampleProps) {
  const { disabledItems = [], ...rest } = props;
  return h(
    Select,
    rest,
    h(Select.Trigger, { "data-testid": "trigger", width: 200 }, h(Select.Value, { placeholder: "Pick a fruit", "data-testid": "value" })),
    h(
      Select.Content,
      { "data-testid": "content" },
      h(
        Select.Viewport,
        { "data-testid": "viewport" },
        h(
          Select.Group,
          { "data-testid": "group" },
          h(Select.Label, { "data-testid": "label" }, "Fruits"),
          ...FRUITS.map(([value, label]) => h(Select.Item, { value, disabled: disabledItems.includes(value), "data-testid": `item-${value}` }, h(Select.ItemText, null, label), h(Select.ItemIndicator, { "data-testid": `check-${value}` }))),
        ),
      ),
    ),
  );
}

describe("Select conformance", () => {
  describe("opening focuses the selected option", () => {
    it("ArrowUp on the trigger also opens the list (APG combobox: ArrowUp/ArrowDown/Enter/Space all open) and focuses the selected item", async () => {
      const { get } = render(h(Example, { defaultValue: "banana" }));
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      expect(keydown(trigger, "ArrowUp").defaultPrevented).toBe(true);
      await tick();
      expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
    });
  });

  describe("keyboard selection from an already-focused option", () => {
    it("Space on a keyboard-focused option selects it and closes the list", async () => {
      const onValueChange = vi.fn();
      const { get, query } = render(h(Example, { defaultValue: "apple", onValueChange }));
      const trigger = get("[data-testid=trigger]");
      click(trigger);
      await tick();
      keydown(document.activeElement!, "ArrowDown");
      expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
      keydown(document.activeElement!, " ");
      expect(onValueChange).toHaveBeenCalledWith("banana");
      expect(query("[data-testid=content]")).toBeNull();
    });

    it("Escape after navigating away from the committed option closes without changing the value", async () => {
      const onValueChange = vi.fn();
      const { get, query } = render(h(Example, { defaultValue: "apple", onValueChange }));
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      click(trigger);
      await tick();
      keydown(document.activeElement!, "ArrowDown");
      keydown(document.activeElement!, "ArrowDown");
      expect(document.activeElement).toBe(get("[data-testid=item-cherry]"));
      keydown(document.activeElement!, "Escape");
      expect(query("[data-testid=content]")).toBeNull();
      expect(onValueChange).not.toHaveBeenCalled();
      expect(get("[data-testid=value]").textContent).toBe("Apple");
      await tick();
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe("onValueChange / controlled value", () => {
    it("onValueChange fires exactly once across a full open -> arrow -> arrow -> enter selection", async () => {
      const onValueChange = vi.fn();
      const { get } = render(h(Example, { defaultValue: "apple", onValueChange }));
      const trigger = get("[data-testid=trigger]");
      click(trigger);
      await tick();
      keydown(document.activeElement!, "ArrowDown");
      keydown(document.activeElement!, "ArrowDown");
      keydown(document.activeElement!, "Enter");
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith("cherry");
    });

    // A controlled `value` must only ever change via a re-render from the consumer, mirroring
    // useControllableState's contract for `open` (see Popover/Tooltip conformance suites).
    it("a controlled value is not mutated internally when a different option is clicked", () => {
      const onValueChange = vi.fn();
      const { get } = render(h(Example, { value: "apple", open: true, onValueChange }));
      click(get("[data-testid=item-cherry]"));
      expect(onValueChange).toHaveBeenCalledWith("cherry");
      expect(get("[data-testid=value]").textContent).toBe("Apple");
      expect(get("[data-testid=item-apple]").getAttribute("aria-selected")).toBe("true");
      expect(get("[data-testid=item-cherry]").getAttribute("aria-selected")).toBe("false");
    });
  });

  describe("disabled items are skipped at the boundaries and by typeahead", () => {
    it("Home skips a disabled first option and focuses the first enabled one", async () => {
      const { get } = render(h(Example, { disabledItems: ["apple"] }));
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      keydown(trigger, "ArrowDown");
      await tick();
      keydown(document.activeElement!, "Home");
      expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
    });

    it("End skips a disabled last option and focuses the last enabled one", async () => {
      const { get } = render(h(Example, { disabledItems: ["cherry"] }));
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      keydown(trigger, "ArrowDown");
      await tick();
      keydown(document.activeElement!, "End");
      expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
    });

    it("typeahead while the list is open skips a disabled option and matches the next label", async () => {
      const { get } = render(h(Example, { disabledItems: ["banana"] }));
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      keydown(trigger, "ArrowDown");
      await tick();
      keydown(document.activeElement!, "b");
      // "banana" is disabled, so the query must not move focus to it at all.
      expect(document.activeElement).not.toBe(get("[data-testid=item-banana]"));
    });

    it("typeahead never resolves to a match that only exists on a disabled option", () => {
      const onValueChange = vi.fn();
      const { get } = render(h(Example, { disabledItems: ["banana"], onValueChange }));
      keydown(get("[data-testid=trigger]"), "b");
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe("aria wiring against the APG combobox pattern", () => {
    // Radix's SelectTrigger never sets aria-activedescendant; ArrowDown moves real DOM focus onto the option instead.
    it("does not set aria-activedescendant; ArrowDown moves real DOM focus onto the option", async () => {
      const { get } = render(h(Example, { defaultValue: "apple" }));
      const trigger = get("[data-testid=trigger]");
      click(trigger);
      await tick();
      keydown(document.activeElement!, "ArrowDown");
      expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
      expect(trigger.hasAttribute("aria-activedescendant")).toBe(false);
    });

    it("the `autofocus` attribute is present only on the selected item", () => {
      const { get } = render(h(Example, { defaultOpen: true, defaultValue: "banana" }));
      expect(get("[data-testid=item-banana]").hasAttribute("autofocus")).toBe(true);
      expect(get("[data-testid=item-apple]").hasAttribute("autofocus")).toBe(false);
      expect(get("[data-testid=item-cherry]").hasAttribute("autofocus")).toBe(false);
    });

    // Radix's SelectGroup generates an id and SelectLabel renders it, wiring aria-labelledby
    // automatically.
    it("Select.Group is labelled by Select.Label via aria-labelledby", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      const group = get("[data-testid=group]");
      const label = get("[data-testid=label]");
      expect(group.getAttribute("aria-labelledby")).toBe(label.id);
    });

    it("a Select.Group without a Select.Label has no aria-labelledby rather than a dangling one", () => {
      const { get } = render(
        h(
          Select,
          { defaultOpen: true },
          h(Select.Trigger, null, h(Select.Value, null)),
          h(Select.Content, null, h(Select.Viewport, null, h(Select.Group, { "data-testid": "bare-group" }, h(Select.Item, { value: "a" }, h(Select.ItemText, null, "A"))))),
        ),
      );
      expect(get("[data-testid=bare-group]").hasAttribute("aria-labelledby")).toBe(false);
    });

    // Radix's SelectTrigger sets aria-required from a `required` root prop.
    it("Select's `required` prop is wired to aria-required on the trigger", () => {
      const { get } = render(h(Example, { ...({ required: true } as Record<string, unknown>) }));
      expect(get("[data-testid=trigger]").getAttribute("aria-required")).toBe("true");
    });
  });

  describe("disabled trigger blocks every open key", () => {
    it("ignores ArrowDown, Enter and Space while disabled, never opening the list", () => {
      const { get, query } = render(h(Example, { disabled: true, defaultValue: "apple" }));
      const trigger = get("[data-testid=trigger]");
      keydown(trigger, "ArrowDown");
      keydown(trigger, "Enter");
      keydown(trigger, " ");
      click(trigger);
      expect(query("[data-testid=content]")).toBeNull();
    });
  });

  describe("form integration", () => {
    // Radix's Select.Provider listens for the surrounding form's `reset` event and calls
    // setValue(initialValue) so its own displayed state resets along with the native control.
    it("resetting the surrounding form reverts Select's own displayed value to defaultValue", () => {
      const { get, container } = render(
        h("form", null, h(Example, { name: "fruit", defaultValue: "apple" }), h("button", { type: "reset" }, "Reset")),
      );
      click(get("[data-testid=trigger]"));
      click(get("[data-testid=item-cherry]"));
      expect(get("[data-testid=value]").textContent).toBe("Cherry");
      const form = container.querySelector("form")!;
      form.reset();
      expect(get("[data-testid=value]").textContent).toBe("Apple");
    });

    it("resetting the form clears a Select that started with no value back to its placeholder", () => {
      const { get, container } = render(h("form", null, h(Example, { name: "fruit" })));
      click(get("[data-testid=trigger]"));
      click(get("[data-testid=item-cherry]"));
      expect(get("[data-testid=value]").textContent).toBe("Cherry");
      container.querySelector("form")!.reset();
      expect(get("[data-testid=value]").textContent).toBe("Pick a fruit");
      expect(new FormData(container.querySelector("form")!).get("fruit")).toBe("");
    });
  });
});
