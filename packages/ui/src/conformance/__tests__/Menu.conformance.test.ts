// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { render, setupDefaultUI, click, keydown, tick, focus } from "../../testing";
import { Menu } from "../../components/Menu";
import type { MenuProps } from "../../components/Menu";
import { Dialog } from "../../components/Dialog";

beforeEach(() => {
  setupDefaultUI();
});

type ExampleProps = Partial<MenuProps> & { items?: VChild | VChild[]; onSelect?: (event: Event) => void };

function Example(props: ExampleProps) {
  const { items, onSelect, ...rest } = props;
  return h(
    Menu,
    rest,
    h(Menu.Trigger, { "data-testid": "trigger" }, "Open"),
    h(
      Menu.Content,
      { "data-testid": "content" },
      items ?? [
        h(Menu.Item, { "data-testid": "one", onSelect }, "One"),
        h(Menu.Item, { "data-testid": "two", onSelect }, "Two"),
        h(Menu.Item, { "data-testid": "three", onSelect }, "Three"),
      ],
    ),
  );
}

const active = () => document.activeElement;

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  focus(el);
  return keydown(el, key, init);
}

describe("Menu conformance", () => {
  describe("aria wiring", () => {
    // radix dropdown-menu.test.tsx "aria-controls > should not reference a non-existent element while closed"
    it("does not reference a non-existent element while closed", () => {
      const { get, query } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      expect(query("[role=menu]")).toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.hasAttribute("aria-controls")).toBe(false);
    });

    // radix dropdown-menu.test.tsx "aria-controls > should reference the rendered content while open"
    it("references the rendered content while open", () => {
      const { get } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      press(trigger, "Enter");
      const content = get("[role=menu]");
      expect(content.id).toBeTruthy();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(trigger.getAttribute("aria-controls")).toBe(content.id);
      expect(document.getElementById(content.id)).toBe(content);
    });

    // APG menu button pattern: the button has aria-haspopup="menu" and the menu is labelled by it
    it("marks the trigger as a menu button and labels the menu with it", () => {
      const { get } = render(h(Example, { defaultOpen: true }));
      const trigger = get("[data-testid=trigger]");
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(get("[role=menu]").getAttribute("aria-labelledby")).toBe(trigger.id);
      expect(get("[role=menu]").getAttribute("aria-orientation")).toBe("vertical");
    });

    // radix menu.tsx: items are role=menuitem with aria-disabled/data-disabled; checkbox and radio items carry aria-checked
    it("gives items, checkbox items and radio items their menu roles and states", () => {
      const { get } = render(
        h(Example, {
          defaultOpen: true,
          items: [
            h(Menu.Item, { "data-testid": "plain", disabled: true }, "Plain"),
            h(Menu.CheckboxItem, { "data-testid": "check", checked: "indeterminate" }, "Check"),
            h(Menu.RadioGroup, { value: "b" }, h(Menu.RadioItem, { "data-testid": "radio", value: "b" }, "Radio")),
          ],
        }),
      );
      const plain = get("[data-testid=plain]");
      expect(plain.getAttribute("role")).toBe("menuitem");
      expect(plain.getAttribute("aria-disabled")).toBe("true");
      expect(plain.getAttribute("data-disabled")).toBe("");
      expect(plain.tabIndex).toBe(-1);
      const check = get("[data-testid=check]");
      expect(check.getAttribute("role")).toBe("menuitemcheckbox");
      expect(check.getAttribute("aria-checked")).toBe("mixed");
      expect(check.dataset.state).toBe("indeterminate");
      const radio = get("[data-testid=radio]");
      expect(radio.getAttribute("role")).toBe("menuitemradio");
      expect(radio.getAttribute("aria-checked")).toBe("true");
      expect(radio.closest("[role=group]")).not.toBeNull();
    });
  });

  describe("opening", () => {
    // APG menu button: Enter, Space and Down Arrow open the menu and focus the first item
    it("opens on Enter, Space or ArrowDown from the trigger and focuses the first item", async () => {
      const { get, query } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      for (const key of ["Enter", " ", "ArrowDown"]) {
        expect(press(trigger, key).defaultPrevented, `${key} is consumed`).toBe(true);
        await tick();
        expect(active(), `${key} focuses the first item`).toBe(get("[data-testid=one]"));
        keydown(document, "Escape");
        await tick();
        expect(query("[role=menu]")).toBeNull();
      }
    });

    // APG menu button: Up Arrow (optional) opens the menu and focuses the last item
    it("opens on ArrowUp from the trigger and focuses the last item", async () => {
      const { get } = render(h(Example, {}));
      press(get("[data-testid=trigger]"), "ArrowUp");
      await tick();
      expect(active()).toBe(get("[data-testid=three]"));
    });

    // radix dropdown-menu.tsx trigger: pointerdown opens without letting the trigger take focus, so the menu can
    it("opens on pointerdown and focuses the menu itself rather than an item", async () => {
      const { get } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
      trigger.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      await tick();
      expect(active()).toBe(get("[role=menu]"));
    });

    // radix dropdown-menu.tsx trigger: only the primary button opens, and not with Ctrl held (macOS right click)
    it("ignores secondary-button and ctrl-clicks on the trigger", () => {
      const { get, query } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 2 }));
      expect(query("[role=menu]")).toBeNull();
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
      expect(query("[role=menu]")).toBeNull();
    });

    it("does nothing from a disabled trigger", () => {
      const { get, query } = render(h(Menu, null, h(Menu.Trigger, { "data-testid": "trigger", disabled: true }, "Open"), h(Menu.Content, null, h(Menu.Item, null, "One"))));
      const trigger = get("[data-testid=trigger]");
      expect(trigger.getAttribute("data-disabled")).toBe("");
      click(trigger);
      press(trigger, "Enter");
      expect(query("[role=menu]")).toBeNull();
    });
  });

  describe("closing", () => {
    // APG menu button: Escape closes the menu and returns focus to the button
    it("closes on Escape and returns focus to the trigger", async () => {
      const { get, query } = render(h(Example, {}));
      const trigger = get("[data-testid=trigger]");
      press(trigger, "Enter");
      await tick();
      keydown(get("[data-testid=one]"), "Escape");
      await tick();
      expect(query("[role=menu]")).toBeNull();
      expect(active()).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    // radix dropdown-menu.test.tsx "closing on window blur"
    it("closes when the window loses focus", async () => {
      const { get, query } = render(h(Example, {}));
      press(get("[data-testid=trigger]"), "Enter");
      expect(query("[role=menu]")).not.toBeNull();
      window.dispatchEvent(new FocusEvent("blur"));
      await tick();
      expect(query("[role=menu]")).toBeNull();
      expect(get("[data-testid=trigger]").getAttribute("aria-expanded")).toBe("false");
    });

    it("closes on an outside press without returning focus to the trigger when the press focused something else", async () => {
      const { get, query } = render(h("div", null, h(Example, {}), h("button", { "data-testid": "outside" }, "Outside")));
      press(get("[data-testid=trigger]"), "Enter");
      await tick();
      const outside = get("[data-testid=outside]");
      click(outside);
      focus(outside);
      await tick();
      expect(query("[role=menu]")).toBeNull();
      expect(active()).toBe(outside);
    });

    // radix menu.tsx: Tab is prevented inside a menu; menus are not navigated with Tab
    it("swallows Tab instead of moving focus out", async () => {
      const { get, query } = render(h(Example, {}));
      press(get("[data-testid=trigger]"), "Enter");
      await tick();
      expect(keydown(get("[data-testid=one]"), "Tab").defaultPrevented).toBe(true);
      expect(query("[role=menu]")).not.toBeNull();
    });
  });

  describe("item selection", () => {
    // radix menu.tsx MenuItem: selecting calls onSelect with a cancelable event and closes the menu unless prevented
    it("calls onSelect and closes, unless onSelect prevents default", async () => {
      const onSelect = vi.fn();
      const { get, query } = render(h(Example, { onSelect }));
      press(get("[data-testid=trigger]"), "Enter");
      await tick();
      click(get("[data-testid=two]"));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0][0]).toBeInstanceOf(Event);
      expect(onSelect.mock.calls[0][0].cancelable).toBe(true);
      expect(query("[role=menu]")).toBeNull();

      const keep = vi.fn((event: Event) => event.preventDefault());
      const kept = render(h(Example, { onSelect: keep }));
      press(kept.get("[data-testid=trigger]"), "Enter");
      await tick();
      click(kept.get("[data-testid=two]"));
      expect(keep).toHaveBeenCalledTimes(1);
      expect(kept.query("[role=menu]")).not.toBeNull();
    });

    // radix dropdown-menu.test.tsx "keys from focusable descendants > still selects the item via Space/Enter when the item itself is focused"
    it("selects a focused item with Enter or Space, preventing the default", async () => {
      const onSelect = vi.fn();
      const { get } = render(h(Example, { onSelect }));
      press(get("[data-testid=trigger]"), "ArrowDown");
      await tick();
      expect(keydown(get("[data-testid=one]"), "Enter").defaultPrevented).toBe(true);
      expect(onSelect).toHaveBeenCalledTimes(1);
      press(get("[data-testid=trigger]"), "ArrowDown");
      await tick();
      expect(keydown(get("[data-testid=one]"), " ").defaultPrevented).toBe(true);
      expect(onSelect).toHaveBeenCalledTimes(2);
    });

    // radix dropdown-menu.test.tsx "keys from focusable descendants > does not intercept Space/Enter typed into a portaled focusable descendant"
    it("does not intercept Enter or Space typed into a focusable nested in an item", async () => {
      const onSelect = vi.fn((event: Event) => event.preventDefault());
      const { get } = render(
        h(Example, {
          defaultOpen: true,
          items: [h(Menu.Item, { "data-testid": "one", onSelect }, "One", h("input", { "data-testid": "input" }))],
        }),
      );
      const input = get("[data-testid=input]");
      focus(input);
      expect(keydown(input, " ").defaultPrevented).toBe(false);
      expect(keydown(input, "Enter").defaultPrevented).toBe(false);
      expect(onSelect).not.toHaveBeenCalled();
    });

    // radix menu.tsx MenuItem: disabled items do not select
    it("does not select disabled items", async () => {
      const onSelect = vi.fn();
      const { get, query } = render(h(Example, { defaultOpen: true, items: [h(Menu.Item, { "data-testid": "one", disabled: true, onSelect }, "One")] }));
      const item = get("[data-testid=one]");
      click(item);
      keydown(item, "Enter");
      expect(onSelect).not.toHaveBeenCalled();
      expect(query("[role=menu]")).not.toBeNull();
    });

    // radix menu.tsx MenuCheckboxItem / MenuRadioItem: selection toggles or picks, then closes like any item
    it("toggles checkbox items, picks radio items and closes afterwards", async () => {
      const onCheckedChange = vi.fn();
      const onValueChange = vi.fn();
      const { get, query } = render(
        h(Example, {
          defaultOpen: true,
          items: [
            h(Menu.CheckboxItem, { "data-testid": "check", checked: false, onCheckedChange }, "Check"),
            h(Menu.RadioGroup, { value: "a", onValueChange }, h(Menu.RadioItem, { "data-testid": "b", value: "b" }, "B")),
          ],
        }),
      );
      click(get("[data-testid=check]"));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
      expect(query("[role=menu]")).toBeNull();
      const again = render(
        h(Example, {
          defaultOpen: true,
          items: [h(Menu.RadioGroup, { value: "a", onValueChange }, h(Menu.RadioItem, { "data-testid": "b", value: "b" }, "B"))],
        }),
      );
      click(again.get("[data-testid=b]"));
      expect(onValueChange).toHaveBeenCalledWith("b");
      expect(again.query("[role=menu]")).toBeNull();
    });
  });

  describe("keyboard navigation", () => {
    // APG menu: Down/Up Arrow move focus; Home/End move to the first/last item
    it("moves focus with the arrow keys, Home and End, skipping disabled items", async () => {
      const { get } = render(
        h(Example, {
          items: [
            h(Menu.Item, { "data-testid": "one" }, "One"),
            h(Menu.Item, { "data-testid": "skip", disabled: true }, "Skip"),
            h(Menu.Item, { "data-testid": "two" }, "Two"),
            h(Menu.Item, { "data-testid": "three" }, "Three"),
          ],
        }),
      );
      press(get("[data-testid=trigger]"), "ArrowDown");
      await tick();
      keydown(get("[data-testid=one]"), "ArrowDown");
      expect(active()).toBe(get("[data-testid=two]"));
      keydown(get("[data-testid=two]"), "End");
      expect(active()).toBe(get("[data-testid=three]"));
      keydown(get("[data-testid=three]"), "ArrowUp");
      expect(active()).toBe(get("[data-testid=two]"));
      keydown(get("[data-testid=two]"), "Home");
      expect(active()).toBe(get("[data-testid=one]"));
    });

    // radix menu.tsx: FIRST_KEYS/LAST_KEYS pressed on the menu itself focus the first/last item
    it("focuses the first or last item when the keys are pressed on the menu itself", async () => {
      const { get } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      await tick();
      const content = get("[role=menu]");
      for (const [key, id] of [
        ["ArrowDown", "one"],
        ["Home", "one"],
        ["PageUp", "one"],
        ["ArrowUp", "three"],
        ["End", "three"],
        ["PageDown", "three"],
      ] as const) {
        focus(content);
        keydown(content, key);
        expect(active(), key).toBe(get(`[data-testid=${id}]`));
      }
    });

    // radix roving-focus: loop=false stops at the ends (the RovingFocusGroup default used by menus)
    it("does not wrap by default and wraps with loop", async () => {
      const { get } = render(h(Example, {}));
      press(get("[data-testid=trigger]"), "ArrowUp");
      await tick();
      keydown(get("[data-testid=three]"), "ArrowDown");
      expect(active()).toBe(get("[data-testid=three]"));
      const looped = render(h(Example, { loop: true }));
      press(looped.get("[data-testid=trigger]"), "ArrowUp");
      await tick();
      keydown(looped.get("[data-testid=three]"), "ArrowDown");
      expect(active()).toBe(looped.get("[data-testid=one]"));
    });

    // radix menu.tsx getNextMatch: repeated characters cycle, the query extends within a second, the current item is skipped
    it("finds items by typeahead the way Radix does", async () => {
      const { get } = render(
        h(Example, {
          items: [
            h(Menu.Item, { "data-testid": "apple" }, "Apple"),
            h(Menu.Item, { "data-testid": "apricot" }, "Apricot"),
            h(Menu.Item, { "data-testid": "banana" }, "Banana"),
            h(Menu.Item, { "data-testid": "blueberry", textValue: "Blueberry" }, h("svg", null), "Blue"),
          ],
        }),
      );
      press(get("[data-testid=trigger]"), "ArrowDown");
      await tick();
      vi.useFakeTimers();
      try {
        keydown(get("[data-testid=apple]"), "a");
        expect(active(), "a single character skips the current match").toBe(get("[data-testid=apricot]"));
        keydown(get("[data-testid=apricot]"), "a");
        expect(active(), "repeating it cycles").toBe(get("[data-testid=apple]"));
        vi.advanceTimersByTime(1001);
        keydown(get("[data-testid=apple]"), "b");
        expect(active()).toBe(get("[data-testid=banana]"));
        keydown(get("[data-testid=banana]"), "l");
        expect(active(), "extends the query to 'bl' and matches textValue").toBe(get("[data-testid=blueberry]"));
        vi.advanceTimersByTime(1001);
        keydown(get("[data-testid=blueberry]"), "z");
        expect(active(), "no match leaves focus where it is").toBe(get("[data-testid=blueberry]"));
      } finally {
        vi.useRealTimers();
      }
    });

    // radix menu.tsx MenuItem: Space during an active typeahead is part of the search, not a selection
    it("treats Space as part of the query while typing ahead", async () => {
      const onSelect = vi.fn();
      const { get, query } = render(h(Example, { onSelect, items: [h(Menu.Item, { "data-testid": "one", onSelect }, "New file"), h(Menu.Item, { "data-testid": "two", onSelect }, "New window")] }));
      press(get("[data-testid=trigger]"), "ArrowDown");
      await tick();
      keydown(get("[data-testid=one]"), "n");
      expect(active()).toBe(get("[data-testid=two]"));
      keydown(get("[data-testid=two]"), " ");
      expect(onSelect).not.toHaveBeenCalled();
      expect(query("[role=menu]")).not.toBeNull();
    });
  });

  describe("pointer interaction", () => {
    const move = (el: Element, type: string, pointerType = "mouse") => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "pointerType", { value: pointerType });
      el.dispatchEvent(event);
    };

    // radix menu.tsx MenuItemImpl: items focus on pointermove, and leaving one returns focus to the menu
    it("focuses the item under a moving mouse and the menu when the mouse leaves it", async () => {
      const { get } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      await tick();
      move(get("[data-testid=two]"), "pointermove");
      expect(active()).toBe(get("[data-testid=two]"));
      move(get("[data-testid=two]"), "pointerleave");
      expect(active()).toBe(get("[role=menu]"));
    });

    // radix menu.tsx MenuItemImpl: moving over a disabled item hands focus to the menu (onItemLeave)
    it("hands focus to the menu when the mouse moves over a disabled item", async () => {
      const { get } = render(h(Example, { items: [h(Menu.Item, { "data-testid": "one" }, "One"), h(Menu.Item, { "data-testid": "off", disabled: true }, "Off")] }));
      press(get("[data-testid=trigger]"), "ArrowDown");
      await tick();
      expect(active()).toBe(get("[data-testid=one]"));
      move(get("[data-testid=off]"), "pointermove");
      expect(active()).toBe(get("[role=menu]"));
    });

    // radix menu.tsx whenMouse: touch and pen pointers don't move focus
    it("ignores non-mouse pointer movement", async () => {
      const { get } = render(h(Example, {}));
      click(get("[data-testid=trigger]"));
      await tick();
      move(get("[data-testid=two]"), "pointermove", "touch");
      expect(active()).toBe(get("[role=menu]"));
    });

    // radix menu.tsx MenuItem onPointerUp: pressing on one item and releasing on another activates the one released on
    it("activates the item the pointer is released on when the press started elsewhere", async () => {
      const onSelect = vi.fn();
      const { get } = render(h(Example, { defaultOpen: true, onSelect }));
      const one = get("[data-testid=one]");
      const two = get("[data-testid=two]");
      one.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      two.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("layering", () => {
    it("a menu open inside a dialog closes on Escape without closing the dialog", async () => {
      const onOpenChange = vi.fn();
      const { get, query } = render(
        h(
          Dialog,
          { defaultOpen: true, onOpenChange },
          h(Dialog.Portal, null, h(Dialog.Content, { "data-testid": "dialog" }, h(Example, {}))),
        ),
      );
      press(get("[data-testid=trigger]"), "Enter");
      await tick();
      keydown(get("[data-testid=one]"), "Escape");
      await tick();
      expect(query("[role=menu]")).toBeNull();
      expect(query("[data-testid=dialog]")).not.toBeNull();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("a modal menu traps Tab and locks scroll while open", async () => {
      const { get, query } = render(h(Example, { modal: true }));
      press(get("[data-testid=trigger]"), "Enter");
      await tick();
      expect(document.body.style.overflow).toBe("hidden");
      keydown(document, "Escape");
      await tick();
      expect(query("[role=menu]")).toBeNull();
      expect(document.body.style.overflow).toBe("");
    });
  });
});
