// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, keydown, setupDefaultUI } from "../../testing";
import { Accordion } from "../../components/Accordion";

beforeEach(() => {
  setupDefaultUI();
});

const items = [
  { value: "a", title: "First" },
  { value: "b", title: "Second" },
  { value: "c", title: "Third" },
];

const accordion = (props: Record<string, unknown> = {}, itemProps: Record<string, unknown> = {}) =>
  render(
    h(
      Accordion,
      props as never,
      ...items.map((item, i) =>
        h(
          Accordion.Item,
          { key: item.value, value: item.value, ...(i === 2 ? itemProps : {}) },
          h(Accordion.Header, null, h(Accordion.Trigger, null, item.title)),
          h(Accordion.Content, null, `Body ${item.title}`),
        ),
      ),
    ),
  );

const triggers = (r: ReturnType<typeof render>) => r.all("button[aria-expanded]");

describe("Accordion conformance", () => {
  describe("keyboard", () => {
    it("Radix accordion.tsx handleKeyDown finds the target in its trigger collection and returns early (no preventDefault) when it isn't one; a key bubbling from a focusable descendant nested in a trigger is ignored", () => {
      const r = render(
        h(
          Accordion,
          { defaultValue: "a" } as never,
          h(Accordion.Item, { value: "a" }, h(Accordion.Trigger, null, "First")),
          h(Accordion.Item, { value: "b" }, h(Accordion.Trigger, null, h("button", { key: "nested" }, "nested"))),
          h(Accordion.Item, { value: "c" }, h(Accordion.Trigger, null, "Third")),
        ),
      );
      const nestedButton = r.get("button[aria-expanded] button") as HTMLElement;
      nestedButton.focus();
      const event = keydown(nestedButton, "ArrowDown");
      expect(event.defaultPrevented).toBe(false); // FAILS — our container-level handler has no target-restriction guard
      expect(document.activeElement).toBe(nestedButton); // FAILS — ours jumps focus to the first trigger
    });

    it("Radix accordion.tsx accepts `dir` and reverses ArrowLeft/ArrowRight in horizontal orientation; Accordion has no `dir` prop", () => {
      // Three items so "previous" (RTL's meaning for ArrowRight) and "next" actually disagree —
      // with only two, wrapping makes them land on the same index and the test can't discriminate.
      const r = accordion({ orientation: "horizontal", dir: "rtl", defaultValue: "a" });
      const t = triggers(r);
      t[0].focus();
      // In RTL, Radix maps ArrowRight to "previous": from the first trigger that wraps to the last.
      keydown(t[0], "ArrowRight");
      expect(document.activeElement).toBe(t[2]); // FAILS — ours always treats ArrowRight as "next" regardless of dir
    });

    it("Radix accordion.tsx calls event.preventDefault() for any of the six accordion keys once the target is a registered (enabled) trigger, even when the key doesn't match the current orientation", () => {
      const r = accordion({ defaultValue: "a", orientation: "vertical" });
      const t = triggers(r);
      t[0].focus();
      const event = keydown(t[0], "ArrowLeft");
      expect(event.defaultPrevented).toBe(true); // FAILS — ours returns null (no preventDefault) for an orientation-mismatched key
      expect(document.activeElement).toBe(t[0]); // passes — focus does not move either way
    });

    it("End skips a disabled last trigger and lands on the last enabled one", () => {
      const r = accordion({ defaultValue: "a" }, { disabled: true });
      const t = triggers(r);
      t[0].focus();
      keydown(t[0], "End");
      expect(document.activeElement).toBe(t[1]);
    });

    it("Home skips a disabled first trigger and lands on the first enabled one", () => {
      const r = render(
        h(
          Accordion,
          { defaultValue: "a" } as never,
          h(Accordion.Item, { value: "a", disabled: true }, h(Accordion.Trigger, null, "First")),
          h(Accordion.Item, { value: "b" }, h(Accordion.Trigger, null, "Second")),
          h(Accordion.Item, { value: "c" }, h(Accordion.Trigger, null, "Third")),
        ),
      );
      const t = triggers(r);
      t[2].focus();
      keydown(t[2], "Home");
      expect(document.activeElement).toBe(t[1]);
    });

    it("Home/End move to the first/last trigger in horizontal orientation too (Radix's nextIndex for Home/End ignores orientation)", () => {
      const r = accordion({ orientation: "horizontal", defaultValue: "a" });
      const t = triggers(r);
      t[0].focus();
      keydown(t[0], "End");
      expect(document.activeElement).toBe(t[2]);
      keydown(t[2], "Home");
      expect(document.activeElement).toBe(t[0]);
    });

    it("a fully disabled accordion (Radix: onKeyDown={disabled ? undefined : handleKeyDown}) never preventDefaults on the container", () => {
      const r = accordion({ disabled: true });
      const event = keydown(r.root, "ArrowDown");
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("aria / data-state", () => {
    it("Radix accordion.tsx AccordionHeader carries data-state, data-orientation and data-disabled from context; our Header is a bare styled <h3> wired to none of it", () => {
      const r = accordion({ defaultValue: "a" }, { disabled: true });
      const headers = r.all("h3");
      expect(headers[0].getAttribute("data-state")).toBe("open"); // FAILS — null
      expect(headers[0].getAttribute("data-orientation")).toBe("vertical"); // FAILS — null
      expect(headers[2].getAttribute("data-disabled")).toBe(""); // FAILS — null
    });

    it("Radix's AccordionItem (CollapsiblePrimitive.Root) sets data-orientation from context; our Item does not", () => {
      const r = accordion({ orientation: "horizontal", defaultValue: "a" });
      expect(r.get("[data-value=a]").getAttribute("data-orientation")).toBe("horizontal"); // FAILS — null
    });

    it("Radix's CollapsibleTrigger omits aria-controls while its item is closed; our Trigger always sets it", () => {
      const r = accordion({ defaultValue: "a" });
      const t = triggers(r);
      expect(t[1].hasAttribute("aria-controls")).toBe(false); // FAILS — ours always sets aria-controls
    });

    it("Radix's CollapsibleTrigger sets data-disabled on the trigger itself when disabled; ours only sets it on the item", () => {
      const r = accordion({}, { disabled: true });
      const t = triggers(r);
      expect(t[2].hasAttribute("data-disabled")).toBe(true); // FAILS — only [data-value] carries it, not the trigger
    });

    it("Radix's AccordionTrigger sets aria-disabled when a single, non-collapsible trigger is open (docs: we deliberately omit this)", () => {
      const r = accordion({ defaultValue: "a" }); // collapsible defaults to false
      const t = triggers(r);
      expect(t[0].getAttribute("aria-disabled")).toBe("true"); // FAILS by design — see Accordion.md
    });
  });

  describe("state", () => {
    it("single, non-collapsible: clicking the already-open trigger never calls onValueChange", () => {
      const onValueChange = vi.fn();
      const r = accordion({ defaultValue: "a", onValueChange });
      click(triggers(r)[0]);
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it("single, collapsible: clicking the open trigger calls onValueChange exactly once with ''", () => {
      const onValueChange = vi.fn();
      const r = accordion({ defaultValue: "a", collapsible: true, onValueChange });
      click(triggers(r)[0]);
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith("");
    });

    it("multiple: clicking the same open item twice empties the array (Radix toggle-group/accordion multiple test)", () => {
      const onValueChange = vi.fn();
      const r = accordion({ type: "multiple", defaultValue: ["a"], onValueChange });
      click(triggers(r)[0]);
      expect(onValueChange).toHaveBeenCalledWith([]);
    });

    it("a disabled item's trigger does not toggle even when it is the currently open one", () => {
      const onValueChange = vi.fn();
      const r = render(
        h(
          Accordion,
          { defaultValue: "a", collapsible: true, onValueChange } as never,
          h(Accordion.Item, { value: "a", disabled: true }, h(Accordion.Trigger, null, "First")),
          h(Accordion.Item, { value: "b" }, h(Accordion.Trigger, null, "Second")),
        ),
      );
      click(triggers(r)[0]);
      expect(onValueChange).not.toHaveBeenCalled();
      expect(triggers(r)[0].getAttribute("aria-expanded")).toBe("true");
    });
  });
});
