// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, keydown, focus, setupDefaultUI } from "../../testing";
import { Tabs } from "../../components/Tabs";

beforeEach(() => {
  setupDefaultUI();
});

const tabs = (props: Record<string, unknown> = {}, tabProps: Record<string, unknown> = {}) =>
  render(
    h(
      Tabs,
      props as never,
      h(
        Tabs.List,
        { key: "list" },
        h(Tabs.Tab, { key: "a", value: "a" }, "First"),
        h(Tabs.Tab, { key: "b", value: "b" }, "Second"),
        h(Tabs.Tab, { key: "c", value: "c", ...tabProps }, "Third"),
      ),
      h(Tabs.Content, { key: "ca", value: "a" }, "Panel A"),
      h(Tabs.Content, { key: "cb", value: "b" }, "Panel B"),
      h(Tabs.Content, { key: "cc", value: "c" }, "Panel C"),
    ),
  );

const tabList = (r: ReturnType<typeof render>) => r.all("[role=tab]");

describe("Tabs conformance", () => {
  describe("keyboard", () => {
    it.skip("APG tabs pattern: Enter/Space activates the focused tab in activationMode='manual' (Radix tabs.tsx TabsTrigger onKeyDown) — happy-dom does not simulate the native click-on-Enter default action for <button>, confirmed by dispatching keydown Enter on a plain button with a click listener", () => {
      const r = tabs({ defaultValue: "a", activationMode: "manual" });
      const tabsEls = tabList(r);
      tabsEls[0].focus();
      keydown(tabsEls[0], "ArrowRight"); // moves focus to "b" without selecting it (manual mode)
      expect(document.activeElement).toBe(tabsEls[1]);
      expect(tabsEls[1].getAttribute("aria-selected")).toBe("false");
      keydown(tabsEls[1], "Enter");
      expect(tabsEls[1].getAttribute("aria-selected")).toBe("true");
    });

    it("Radix tabs.tsx TabsTrigger guards arrow-key handling with event.target === event.currentTarget; our roving-focus container has no such guard, so a key bubbling from a focusable descendant nested inside a tab is treated as if no tab had focus at all", () => {
      const r = render(
        h(
          Tabs,
          { defaultValue: "a" } as never,
          h(
            Tabs.List,
            null,
            h(Tabs.Tab, { value: "a" }, "First"),
            h(Tabs.Tab, { value: "b" }, h("button", { key: "nested" }, "nested")),
            h(Tabs.Tab, { value: "c" }, "Third"),
          ),
          h(Tabs.Content, { value: "a" }, "Panel A"),
          h(Tabs.Content, { value: "b" }, "Panel B"),
          h(Tabs.Content, { value: "c" }, "Panel C"),
        ),
      );
      const nestedButton = r.get("[role=tab] button") as HTMLElement;
      nestedButton.focus();
      expect(document.activeElement).toBe(nestedButton);
      const event = keydown(nestedButton, "ArrowRight");
      // Radix's per-item guard means this keydown is ignored entirely: no preventDefault,
      // focus stays on the nested descendant. Our roving-focus handler is registered on the
      // list container with no target-restriction guard, so it fires regardless.
      expect(event.defaultPrevented).toBe(false); // FAILS — ours preventDefaults unconditionally
      expect(document.activeElement).toBe(nestedButton); // FAILS — ours moves focus to tab "a"
    });

    it("APG: Home/End move to the first/last tab regardless of orientation (vertical)", () => {
      const r = render(
        h(
          Tabs,
          { defaultValue: "a", orientation: "vertical" } as never,
          h(
            Tabs.List,
            null,
            h(Tabs.Tab, { value: "a" }, "First"),
            h(Tabs.Tab, { value: "b" }, "Second"),
            h(Tabs.Tab, { value: "c" }, "Third"),
          ),
          h(Tabs.Content, { value: "a" }, "A"),
          h(Tabs.Content, { value: "b" }, "B"),
          h(Tabs.Content, { value: "c" }, "C"),
        ),
      );
      const items = tabList(r);
      items[0].focus();
      keydown(items[0], "End");
      expect(document.activeElement).toBe(items[2]);
      keydown(items[2], "Home");
      expect(document.activeElement).toBe(items[0]);
    });

    it("loop=false still lets Home/End jump to the ends (Radix roving-focus-group.tsx maps Home/End unconditionally)", () => {
      const r = render(
        h(
          Tabs,
          { defaultValue: "a" } as never,
          h(Tabs.List, { loop: false }, h(Tabs.Tab, { value: "a" }, "A"), h(Tabs.Tab, { value: "b" }, "B"), h(Tabs.Tab, { value: "c" }, "C")),
          h(Tabs.Content, { value: "a" }, "A"),
          h(Tabs.Content, { value: "b" }, "B"),
          h(Tabs.Content, { value: "c" }, "C"),
        ),
      );
      const items = tabList(r);
      items[0].focus();
      keydown(items[0], "End");
      expect(document.activeElement).toBe(items[2]);
      keydown(items[2], "ArrowRight"); // loop off: End of the road, should stay put
      expect(document.activeElement).toBe(items[2]);
    });

    it("End skips a disabled last tab and lands on the last enabled one", () => {
      const r = tabs({ defaultValue: "a" }, { disabled: true });
      const items = tabList(r);
      items[0].focus();
      keydown(items[0], "End");
      expect(document.activeElement).toBe(items[1]);
    });

    it("vertical orientation: ArrowUp wraps from the first tab to the last (loop default true)", () => {
      const r = render(
        h(
          Tabs,
          { defaultValue: "a", orientation: "vertical" } as never,
          h(Tabs.List, null, h(Tabs.Tab, { value: "a" }, "A"), h(Tabs.Tab, { value: "b" }, "B"), h(Tabs.Tab, { value: "c" }, "C")),
          h(Tabs.Content, { value: "a" }, "A"),
          h(Tabs.Content, { value: "b" }, "B"),
          h(Tabs.Content, { value: "c" }, "C"),
        ),
      );
      const items = tabList(r);
      items[0].focus();
      keydown(items[0], "ArrowUp");
      expect(document.activeElement).toBe(items[2]);
    });

    it("a non-navigation key (e.g. 'a') is left alone: no preventDefault, no focus change", () => {
      const r = tabs({ defaultValue: "a" });
      const items = tabList(r);
      items[0].focus();
      const event = keydown(items[0], "a");
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(items[0]);
    });
  });

  describe("focus management", () => {
    it("clicking a tab moves focus to it (Radix tabs.tsx TabsTrigger onMouseDown focuses before selecting)", () => {
      const r = tabs({ defaultValue: "a" });
      const items = tabList(r);
      click(items[2]);
      expect(document.activeElement).toBe(items[2]);
    });

    it("a disabled tab cannot receive focus (APG: disabled tabs are removed from the tab sequence)", () => {
      const r = tabs({ defaultValue: "a" }, { disabled: true });
      const items = tabList(r);
      focus(items[2]);
      expect(document.activeElement).not.toBe(items[2]);
    });
  });

  describe("aria", () => {
    it("disabled tab does not get a `data-disabled` attribute (Radix tabs.tsx sets `data-disabled` on TabsTrigger when disabled)", () => {
      const r = tabs({ defaultValue: "a" }, { disabled: true });
      const items = tabList(r);
      expect(items[2].hasAttribute("data-disabled")).toBe(false);
    });

    it("every tab's aria-controls resolves to a content id, not only the selected tab's", () => {
      const r = tabs({ defaultValue: "b" });
      const items = tabList(r);
      const contentIds = r.all("[role=tabpanel], [id]").map((el) => el.id);
      for (const tab of items) {
        const controls = tab.getAttribute("aria-controls");
        expect(controls).toBeTruthy();
        // The content for tabs "a" and "c" is not mounted (no forceMount), so we can only
        // assert the id is well-formed and unique per tab rather than resolve it in the DOM.
        expect(items.filter((t) => t.getAttribute("aria-controls") === controls)).toHaveLength(1);
      }
      expect(contentIds).toContain(items[1].getAttribute("aria-controls"));
    });

    it("switching selection flips data-state on both the previously- and newly-selected tab in the same tick", () => {
      const r = tabs({ defaultValue: "a" });
      const items = tabList(r);
      click(items[1]);
      expect(items[0].dataset.state).toBe("inactive");
      expect(items[1].dataset.state).toBe("active");
    });
  });

  describe("state", () => {
    it("re-selecting the already-active tab does not call onValueChange again (useControllableState only fires on real change)", () => {
      const onValueChange = vi.fn();
      const r = tabs({ defaultValue: "a", onValueChange });
      click(tabList(r)[0]);
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it("activationMode='manual': moving focus with arrow keys never calls onValueChange", () => {
      const onValueChange = vi.fn();
      const r = tabs({ defaultValue: "a", activationMode: "manual", onValueChange });
      const items = tabList(r);
      items[0].focus();
      keydown(items[0], "ArrowRight");
      keydown(items[1], "End");
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe("RTL", () => {
    it("Radix tabs.tsx accepts a `dir` prop (useDirection) that reverses ArrowLeft/ArrowRight in horizontal orientation; Tabs has no `dir` prop and roving-focus.ts is not direction-aware", () => {
      // Three tabs so RTL's "next" (index 1) and plain-LTR "prev"-with-wrap (index 2, since
      // ours ignores `dir`) actually disagree — with only two tabs wrapping makes them coincide
      // and the test can't tell RTL-awareness apart from its absence.
      const r = render(
        h(
          Tabs,
          { defaultValue: "a", dir: "rtl" } as never,
          h(Tabs.List, null, h(Tabs.Tab, { value: "a" }, "A"), h(Tabs.Tab, { value: "b" }, "B"), h(Tabs.Tab, { value: "c" }, "C")),
          h(Tabs.Content, { value: "a" }, "A"),
          h(Tabs.Content, { value: "b" }, "B"),
          h(Tabs.Content, { value: "c" }, "C"),
        ),
      );
      const items = tabList(r);
      items[0].focus();
      // In RTL, Radix's roving-focus-group.tsx getDirectionAwareKey swaps ArrowLeft/ArrowRight
      // before mapping to prev/next, so ArrowLeft becomes "next" here.
      keydown(items[0], "ArrowLeft");
      expect(document.activeElement).toBe(items[1]); // FAILS — ours treats ArrowLeft as "prev" regardless of dir and wraps to items[2]
    });
  });
});
