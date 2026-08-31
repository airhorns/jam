// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, keydown, tick, focus } from "../../testing";
import { Menu } from "../Menu";
import type { MenuProps } from "../Menu";
import { Button } from "../Button";
import { renderError } from "./helpers";

beforeEach(() => {
  setupDefaultUI();
});

function pointer(el: Element, type: string, init: PointerEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init }) as PointerEvent;
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
  el.dispatchEvent(event);
  return event;
}

type ExampleProps = Partial<MenuProps> & {
  onSelect?: (name: string, event: Event) => void;
  keepOpen?: boolean;
  items?: VChild | VChild[];
  asChild?: boolean;
};

function Example(props: ExampleProps) {
  const { onSelect, keepOpen, items, asChild, ...rest } = props;
  const item = (name: string, extra: Record<string, unknown> = {}) =>
    h(
      Menu.Item,
      {
        "data-testid": name.toLowerCase(),
        onSelect: (event: Event) => {
          if (keepOpen) event.preventDefault();
          onSelect?.(name, event);
        },
        ...extra,
      },
      name,
    );
  return h(
    Menu,
    rest,
    asChild ? h(Menu.Trigger, { asChild: true }, h(Button, { "data-testid": "trigger" }, "Open")) : h(Menu.Trigger, { "data-testid": "trigger" }, "Open"),
    h(Menu.Content, { "data-testid": "content" }, items ?? [item("Alpha"), item("Beta"), item("Bravo", { disabled: true }), item("Gamma")]),
  );
}

const active = () => document.activeElement as HTMLElement | null;

/** Press `key` on the focused trigger, as a keyboard user would. */
function press(trigger: HTMLElement, key: string) {
  focus(trigger);
  return keydown(trigger, key);
}

describe("Menu", () => {
  it("opens from the trigger with menu-button aria wiring and closes on a second press", () => {
    const { get, query } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
    expect(query("[data-testid=content]")).toBeNull();

    click(trigger);
    const content = get("[data-testid=content]");
    expect(content.getAttribute("role")).toBe("menu");
    expect(content.getAttribute("aria-orientation")).toBe("vertical");
    expect(content.id).toBe(trigger.getAttribute("aria-controls"));
    expect(content.getAttribute("aria-labelledby")).toBe(trigger.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.dataset.state).toBe("open");

    click(trigger);
    expect(query("[data-testid=content]")).toBeNull();
    expect(trigger.dataset.state).toBe("closed");
  });

  it("works with asChild triggers", () => {
    const { get } = render(h(Example, { asChild: true }));
    const trigger = get("[data-testid=trigger]");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    click(trigger);
    expect(get("[data-testid=content]").id).toBe(trigger.getAttribute("aria-controls"));
  });

  it("focuses the menu itself when opened with the pointer and the first item when opened with the keyboard", async () => {
    const { get, query } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    click(trigger);
    await tick();
    expect(active()).toBe(get("[data-testid=content]"));

    keydown(document, "Escape");
    await tick();
    expect(query("[data-testid=content]")).toBeNull();
    expect(active()).toBe(trigger);

    press(trigger, "ArrowDown");
    await tick();
    expect(active()).toBe(get("[data-testid=alpha]"));

    keydown(document, "Escape");
    await tick();
    press(trigger, "ArrowUp");
    await tick();
    expect(active()).toBe(get("[data-testid=gamma]"));

    keydown(document, "Escape");
    await tick();
    press(trigger, "Enter");
    await tick();
    expect(active()).toBe(get("[data-testid=alpha]"));
  });

  it("prevents the trigger's native key actions so Enter and Space don't also click it", () => {
    const { get } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    expect(keydown(trigger, "Enter").defaultPrevented).toBe(true);
    expect(keydown(trigger, " ").defaultPrevented).toBe(true);
    expect(keydown(trigger, "ArrowDown").defaultPrevented).toBe(true);
  });

  it("moves between enabled items with the arrow keys, Home and End without wrapping by default", async () => {
    const { get } = render(h(Example, {}));
    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    const alpha = get("[data-testid=alpha]");
    const beta = get("[data-testid=beta]");
    const gamma = get("[data-testid=gamma]");
    expect(active()).toBe(alpha);
    keydown(alpha, "ArrowDown");
    expect(active()).toBe(beta);
    keydown(beta, "ArrowDown");
    expect(active(), "skips the disabled item").toBe(gamma);
    keydown(gamma, "ArrowDown");
    expect(active(), "stays on the last item").toBe(gamma);
    keydown(gamma, "Home");
    expect(active()).toBe(alpha);
    keydown(alpha, "ArrowUp");
    expect(active(), "stays on the first item").toBe(alpha);
    keydown(alpha, "End");
    expect(active()).toBe(gamma);
  });

  it("wraps around with loop", async () => {
    const { get } = render(h(Example, { loop: true }));
    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    keydown(get("[data-testid=alpha]"), "ArrowUp");
    expect(active()).toBe(get("[data-testid=gamma]"));
    keydown(get("[data-testid=gamma]"), "ArrowDown");
    expect(active()).toBe(get("[data-testid=alpha]"));
  });

  it("focuses the first or last item from the menu itself", async () => {
    const { get } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    await tick();
    const content = get("[data-testid=content]");
    keydown(content, "ArrowDown");
    expect(active()).toBe(get("[data-testid=alpha]"));
    focus(content);
    keydown(content, "ArrowUp");
    expect(active()).toBe(get("[data-testid=gamma]"));
  });

  it("moves to the next item whose text starts with the typed characters", async () => {
    const { get } = render(h(Example, {}));
    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    vi.useFakeTimers();
    try {
      keydown(get("[data-testid=alpha]"), "g");
      expect(active()).toBe(get("[data-testid=gamma]"));
      vi.advanceTimersByTime(1001);
      keydown(get("[data-testid=gamma]"), "b");
      expect(active(), "disabled Bravo is skipped").toBe(get("[data-testid=beta]"));
      keydown(get("[data-testid=beta]"), "e");
      expect(active(), "the query extends within a second").toBe(get("[data-testid=beta]"));
      vi.advanceTimersByTime(1001);
      keydown(get("[data-testid=beta]"), "a");
      expect(active()).toBe(get("[data-testid=alpha]"));
      keydown(get("[data-testid=alpha]"), "a");
      expect(active(), "a repeated character cycles to the next match").toBe(get("[data-testid=alpha]"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("selects an item on click, Enter or Space and closes unless onSelect prevents it", async () => {
    const onSelect = vi.fn();
    const { get, query } = render(h(Example, { onSelect }));
    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    keydown(get("[data-testid=alpha]"), "Enter");
    expect(onSelect).toHaveBeenLastCalledWith("Alpha", expect.any(Event));
    expect(query("[data-testid=content]")).toBeNull();
    await tick();
    expect(active(), "focus returns to the trigger").toBe(get("[data-testid=trigger]"));

    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    keydown(get("[data-testid=alpha]"), " ");
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(query("[data-testid=content]")).toBeNull();

    click(get("[data-testid=trigger]"));
    click(get("[data-testid=gamma]"));
    expect(onSelect).toHaveBeenLastCalledWith("Gamma", expect.any(Event));
    expect(query("[data-testid=content]")).toBeNull();

    const kept = render(h(Example, { onSelect, keepOpen: true }));
    click(kept.get("[data-testid=trigger]"));
    click(kept.get("[data-testid=alpha]"));
    expect(onSelect).toHaveBeenCalledTimes(4);
    expect(kept.query("[data-testid=content]"), "prevented select keeps it open").not.toBeNull();
  });

  it("ignores disabled items", async () => {
    const onSelect = vi.fn();
    const { get, query } = render(h(Example, { onSelect }));
    click(get("[data-testid=trigger]"));
    const bravo = get("[data-testid=bravo]");
    expect(bravo.getAttribute("aria-disabled")).toBe("true");
    expect(bravo.dataset.disabled).toBe("");
    click(bravo);
    expect(onSelect).not.toHaveBeenCalled();
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("focuses items as the mouse moves over them and returns focus to the menu when it leaves", async () => {
    const { get } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    await tick();
    const content = get("[data-testid=content]");
    const beta = get("[data-testid=beta]");
    pointer(beta, "pointermove");
    expect(active()).toBe(beta);
    pointer(beta, "pointerleave");
    expect(active()).toBe(content);
    pointer(get("[data-testid=bravo]"), "pointermove");
    expect(active(), "a disabled item hands focus to the menu").toBe(content);
    pointer(beta, "pointermove", { pointerType: "touch" });
    expect(active(), "touch doesn't move focus").toBe(content);
  });

  it("closes on Escape and outside press, and on Tab does nothing", async () => {
    const { get, query } = render(h("div", null, h(Example, {}), h("button", { "data-testid": "outside" }, "Outside")));
    click(get("[data-testid=trigger]"));
    await tick();
    expect(keydown(get("[data-testid=content]"), "Tab").defaultPrevented).toBe(true);
    expect(query("[data-testid=content]")).not.toBeNull();
    keydown(document, "Escape");
    expect(query("[data-testid=content]")).toBeNull();
    click(get("[data-testid=trigger]"));
    click(get("[data-testid=outside]"));
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("supports controlled open state", () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { open: false, onOpenChange }));
    click(get("[data-testid=trigger]"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(query("[data-testid=content]")).toBeNull();
    render(h(Example, { open: true, onOpenChange }));
    expect(document.querySelector("[data-testid=content]")).not.toBeNull();
  });

  it("renders checkbox and radio items with their states and indicators", () => {
    const onCheckedChange = vi.fn();
    const onValueChange = vi.fn();
    const { get, query } = render(
      h(
        Menu,
        { defaultOpen: true },
        h(Menu.Trigger, null, "Open"),
        h(
          Menu.Content,
          null,
          h(Menu.CheckboxItem, { "data-testid": "check", checked: true, onCheckedChange }, h(Menu.ItemIndicator, { "data-testid": "check-indicator" }), "Show done"),
          h(Menu.CheckboxItem, { "data-testid": "uncheck", checked: false, onCheckedChange }, h(Menu.ItemIndicator, { "data-testid": "uncheck-indicator" }), "Show archived"),
          h(Menu.CheckboxItem, { "data-testid": "mixed", checked: "indeterminate" }, h(Menu.ItemIndicator, { "data-testid": "mixed-indicator" }), "Some"),
          h(
            Menu.RadioGroup,
            { value: "b", onValueChange },
            h(Menu.RadioItem, { "data-testid": "a", value: "a" }, h(Menu.ItemIndicator, { "data-testid": "a-indicator", forceMount: true }), "A"),
            h(Menu.RadioItem, { "data-testid": "b", value: "b" }, h(Menu.ItemIndicator, { "data-testid": "b-indicator" }), "B"),
          ),
        ),
      ),
    );
    const check = get("[data-testid=check]");
    expect(check.getAttribute("role")).toBe("menuitemcheckbox");
    expect(check.getAttribute("aria-checked")).toBe("true");
    expect(check.dataset.state).toBe("checked");
    expect(get("[data-testid=check-indicator]").querySelector("svg")).not.toBeNull();
    expect(get("[data-testid=uncheck]").getAttribute("aria-checked")).toBe("false");
    expect(query("[data-testid=uncheck-indicator]"), "unchecked indicator is not rendered").toBeNull();
    expect(get("[data-testid=mixed]").getAttribute("aria-checked")).toBe("mixed");
    expect(get("[data-testid=mixed-indicator]").dataset.state).toBe("indeterminate");

    const a = get("[data-testid=a]");
    expect(a.getAttribute("role")).toBe("menuitemradio");
    expect(a.getAttribute("aria-checked")).toBe("false");
    expect(get("[data-testid=a-indicator]").dataset.state, "forceMount keeps the slot").toBe("unchecked");
    expect(get("[data-testid=a-indicator]").querySelector("svg")).toBeNull();
    expect(get("[data-testid=b]").getAttribute("aria-checked")).toBe("true");
    expect(get("[data-testid=b-indicator]").querySelector("svg")).not.toBeNull();

    click(check);
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(query("[data-testid=check]"), "selecting closes the menu").toBeNull();
  });

  it("toggles an indeterminate checkbox item to checked and reports radio selections", () => {
    const onCheckedChange = vi.fn();
    const onValueChange = vi.fn();
    const { get } = render(
      h(
        Menu,
        { defaultOpen: true },
        h(Menu.Trigger, null, "Open"),
        h(
          Menu.Content,
          null,
          h(Menu.CheckboxItem, { "data-testid": "mixed", checked: "indeterminate", onCheckedChange, onSelect: (e: Event) => e.preventDefault() }, "Some"),
          h(Menu.RadioGroup, { value: "b", onValueChange }, h(Menu.RadioItem, { "data-testid": "a", value: "a", onSelect: (e: Event) => e.preventDefault() }, "A")),
        ),
      ),
    );
    click(get("[data-testid=mixed]"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    click(get("[data-testid=a]"));
    expect(onValueChange).toHaveBeenLastCalledWith("a");
  });

  it("labels groups with their label and renders separators with the separator role", () => {
    const { get, query } = render(
      h(
        Menu,
        { defaultOpen: true },
        h(Menu.Trigger, null, "Open"),
        h(
          Menu.Content,
          null,
          h(Menu.Group, { "data-testid": "labelled" }, h(Menu.Label, { "data-testid": "label" }, "Sort by"), h(Menu.Item, null, "Name")),
          h(Menu.Separator, { "data-testid": "separator" }),
          h(Menu.Group, { "data-testid": "unlabelled" }, h(Menu.Item, null, "Other")),
        ),
      ),
    );
    const group = get("[data-testid=labelled]");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-labelledby")).toBe(get("[data-testid=label]").id);
    expect(get("[data-testid=unlabelled]").hasAttribute("aria-labelledby")).toBe(false);
    const separator = get("[data-testid=separator]");
    expect(separator.getAttribute("role")).toBe("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
    expect(query("[role=menuitem]")).not.toBeNull();
  });

  it("is styled as an elevated panel whose items highlight on hover and focus", () => {
    const { get } = render(h(Example, { defaultOpen: true }));
    const content = css(get("[data-testid=content]"));
    expect(content).toMatchObject({
      "background-color": "var(--background)",
      "border-width": "1px",
      "border-color": "var(--borderColor)",
      "z-index": "100000",
    });
    const item = get("[data-testid=alpha]");
    expect(css(item)).toMatchObject({ cursor: "pointer", "align-items": "center" });
    expect(css(item, ":hover")["background-color"]).toBe("var(--backgroundHover)");
    expect(css(item, ":focus")["background-color"]).toBe("var(--backgroundFocus)");
    expect(css(get("[data-testid=bravo]")).opacity).toBe("0.5");
  });

  it("uses textValue for typeahead when given", async () => {
    const { get } = render(
      h(Example, {
        items: [
          h(Menu.Item, { "data-testid": "one", textValue: "Zed" }, h("svg", null), "First"),
          h(Menu.Item, { "data-testid": "two" }, "Second"),
        ],
      }),
    );
    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    expect(active()).toBe(get("[data-testid=one]"));
    vi.useFakeTimers();
    try {
      keydown(get("[data-testid=one]"), "s");
      expect(active()).toBe(get("[data-testid=two]"));
      vi.advanceTimersByTime(1001);
      keydown(get("[data-testid=two]"), "z");
      expect(active()).toBe(get("[data-testid=one]"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a space through to typeahead only while a query is in progress", async () => {
    const onSelect = vi.fn();
    const { get } = render(
      h(Example, {
        onSelect,
        items: [h(Menu.Item, { "data-testid": "one", onSelect: () => onSelect("one") }, "New file"), h(Menu.Item, { "data-testid": "two", onSelect: () => onSelect("two") }, "New folder")],
      }),
    );
    press(get("[data-testid=trigger]"), "ArrowDown");
    await tick();
    keydown(get("[data-testid=one]"), "n");
    keydown(get("[data-testid=one]"), "e");
    keydown(get("[data-testid=one]"), "w");
    keydown(get("[data-testid=two]"), " ");
    keydown(get("[data-testid=two]"), "f");
    keydown(get("[data-testid=two]"), "o");
    expect(active()).toBe(get("[data-testid=two]"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a space on the content itself is neither typeahead nor a selection", async () => {
    const onSelect = vi.fn();
    const { get, query } = render(h(Example, { defaultOpen: true, onSelect }));
    await tick();
    const content = get("[data-testid=content]");
    focus(content);
    expect(keydown(content, " ").defaultPrevented).toBe(false);
    expect(active()).toBe(content);
    expect(onSelect).not.toHaveBeenCalled();
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("reports parts rendered outside their owners", () => {
    expect(renderError(h(Menu.Trigger, null, "Open"))).toMatch(/Menu.Trigger must be rendered inside <Menu>/);
    expect(renderError(h(Menu, { defaultOpen: true }, h(Menu.Content, null, h(Menu.RadioItem, { value: "a" }, "A"))))).toMatch(/Menu.RadioItem must be rendered inside <Menu.RadioGroup>/);
    expect(renderError(h(Menu, { defaultOpen: true }, h(Menu.Content, null, h(Menu.Item, null, h(Menu.ItemIndicator, null)))))).toMatch(/Menu.ItemIndicator must be rendered inside/);
  });

  it("renders an arrow pointing at the trigger and labels outside a group", async () => {
    const { get } = render(
      h(
        Menu,
        { defaultOpen: true },
        h(Menu.Trigger, { "data-testid": "trigger" }, "Open"),
        h(Menu.Content, { "data-testid": "content" }, h(Menu.Label, { "data-testid": "label" }, "Loose"), h(Menu.Item, { size: 20, "data-testid": "big" }, "Big"), h(Menu.Arrow, { "data-testid": "arrow" })),
      ),
    );
    await tick();
    expect(get("[data-testid=arrow]").style.transform).toBe("rotate(45deg)");
    expect(get("[data-testid=label]").hasAttribute("id")).toBe(false);
    expect(css(get("[data-testid=big]"))["font-size"]).toBe("20px");
  });

  it("runs caller handlers on the trigger first and stops when they prevent default", () => {
    const onPointerDown = vi.fn((event: PointerEvent) => event.preventDefault());
    const onKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    const { get, query } = render(h(Menu, null, h(Menu.Trigger, { "data-testid": "trigger", onPointerDown, onKeyDown }, "Open"), h(Menu.Content, { "data-testid": "content" }, h(Menu.Item, null, "A"))));
    const trigger = get("[data-testid=trigger]");
    pointer(trigger, "pointerdown", { button: 0 });
    press(trigger, "Enter");
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("runs caller handlers on the content and items before its own", async () => {
    const contentKeyDown = vi.fn();
    const handlers = { onClick: vi.fn(), onPointerDown: vi.fn(), onPointerUp: vi.fn(), onPointerMove: vi.fn(), onPointerLeave: vi.fn(), onKeyDown: vi.fn() };
    const onSelect = vi.fn();
    const { get, query } = render(
      h(
        Menu,
        { defaultOpen: true },
        h(Menu.Trigger, { "data-testid": "trigger" }, "Open"),
        h(Menu.Content, { "data-testid": "content", onKeyDown: contentKeyDown }, h(Menu.Item, { "data-testid": "a", onSelect, ...handlers }, "A"), h(Menu.Item, { "data-testid": "b" }, "B")),
      ),
    );
    await tick();
    const a = get("[data-testid=a]");
    pointer(a, "pointermove");
    expect(handlers.onPointerMove).toHaveBeenCalledTimes(1);
    expect(active()).toBe(a);
    pointer(a, "pointerleave", { pointerType: "touch" });
    expect(handlers.onPointerLeave).toHaveBeenCalledTimes(1);
    expect(active()).toBe(a);
    keydown(a, "ArrowDown");
    expect(contentKeyDown).toHaveBeenCalledTimes(1);
    expect(handlers.onKeyDown).toHaveBeenCalledTimes(1);
    expect(active()).toBe(get("[data-testid=b]"));
    contentKeyDown.mockImplementation((event: KeyboardEvent) => event.preventDefault());
    keydown(get("[data-testid=b]"), "ArrowUp");
    expect(active()).toBe(get("[data-testid=b]"));
    click(a);
    expect(handlers.onPointerDown).toHaveBeenCalledTimes(1);
    expect(handlers.onPointerUp).toHaveBeenCalledTimes(1);
    expect(handlers.onClick).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("moves to the last item on ArrowUp from an item that is not focused, and copes with an empty menu", async () => {
    const { get } = render(h(Example, { defaultOpen: true }));
    await tick();
    focus(get("[data-testid=content]"));
    keydown(get("[data-testid=alpha]"), "ArrowUp");
    expect(active()).toBe(get("[data-testid=gamma]"));
    focus(get("[data-testid=content]"));
    keydown(get("[data-testid=gamma]"), "ArrowDown");
    expect(active()).toBe(get("[data-testid=alpha]"));

    const empty = render(h(Example, { defaultOpen: true, items: [] }));
    await tick();
    focus(empty.get("[data-testid=content]"));
    expect(keydown(empty.get("[data-testid=content]"), "ArrowDown").defaultPrevented).toBe(true);
    expect(active()).toBe(empty.get("[data-testid=content]"));
  });
});
