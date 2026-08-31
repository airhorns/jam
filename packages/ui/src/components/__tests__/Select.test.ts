// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { $, _, claim, forget, replace, when } from "@jam/core";
import { render, css, setupDefaultUI, click, keydown, tick } from "../../testing";
import { Select } from "../Select";
import { Button } from "../Button";

beforeEach(() => {
  setupDefaultUI();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function rect(el: Element, x: number, y: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON() {} }) as DOMRect;
}

const FRUITS = [
  ["apple", "Apple"],
  ["banana", "Banana"],
  ["blueberry", "Blueberry"],
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
  size?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
};

function Example(props: ExampleProps) {
  const { disabledItems = [], placeholder = "Pick a fruit", ...rest } = props;
  return h(
    Select,
    rest,
    h(Select.Trigger, { "data-testid": "trigger", width: 200 }, h(Select.Value, { placeholder, "data-testid": "value" })),
    h(
      Select.Content,
      { "data-testid": "content" },
      h(
        Select.Viewport,
        { "data-testid": "viewport" },
        h(Select.Group, null, h(Select.Label, { "data-testid": "label" }, "Fruits"), ...FRUITS.map(([value, label]) => h(Select.Item, { value, disabled: disabledItems.includes(value), "data-testid": `item-${value}` }, h(Select.ItemText, null, label), h(Select.ItemIndicator, { "data-testid": `check-${value}` })))),
      ),
    ),
  );
}

describe("Select", () => {
  it("renders a combobox trigger showing the placeholder until a value is chosen", () => {
    const { get } = render(h(Example, { defaultValue: undefined }));
    const trigger = get("[data-testid=trigger]");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.dataset.state).toBe("closed");
    expect(trigger.querySelector("svg")!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    const value = get("[data-testid=value]");
    expect(value.textContent).toBe("Pick a fruit");
    expect(value.hasAttribute("data-placeholder")).toBe(true);
    expect(css(value)).toMatchObject({ color: "var(--placeholderColor)", "text-overflow": "ellipsis", "text-align": "left" });
    expect(get("[data-testid=content]").hidden).toBe(true);
  });

  it("opens a listbox from the trigger sized to it and selects on click", async () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { defaultValue: "banana", onValueChange, onOpenChange }));
    const trigger = get("[data-testid=trigger]");
    expect(get("[data-testid=value]").textContent).toBe("Banana");
    expect(get("[data-testid=value]").hasAttribute("data-placeholder")).toBe(false);
    rect(trigger, 100, 50, 200, 36);
    trigger.focus();
    click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    const content = get("[data-testid=content]");
    expect(content.getAttribute("role")).toBe("listbox");
    expect(content.getAttribute("aria-labelledby")).toBe(trigger.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(content.id);
    expect(trigger.hasAttribute("aria-activedescendant")).toBe(false);
    expect(content.dataset.layer).toBe(trigger.dataset.layerTrigger);
    rect(content, 0, 0, 240, 160);
    await tick();
    expect(content.style.minWidth).toBe("200px");
    expect(content.style.top).toBe("90px");
    expect(content.style.left).toBe("100px");
    expect(content.dataset.placement).toBe("bottom-start");

    const banana = get("[data-testid=item-banana]");
    expect(banana.getAttribute("aria-selected")).toBe("true");
    expect(banana.dataset.state).toBe("checked");
    expect(query("[data-testid=check-banana]")).not.toBeNull();
    expect(query("[data-testid=check-apple]")).toBeNull();
    expect(document.activeElement).toBe(banana);

    click(get("[data-testid=item-cherry]"));
    expect(onValueChange).toHaveBeenCalledWith("cherry");
    expect(get("[data-testid=content]").hidden).toBe(true);
    expect(get("[data-testid=value]").textContent).toBe("Cherry");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await tick();
    expect(document.activeElement).toBe(trigger);
  });

  it("styles the content as an elevated card with padded, rounded items", () => {
    const { get } = render(h(Example, { defaultOpen: true, defaultValue: "apple" }));
    const content = css(get("[data-testid=content]"));
    expect(content).toMatchObject({
      "background-color": "var(--background)",
      "border-radius": "9px",
      "border-width": "1px",
      "border-color": "var(--borderColor)",
      overflow: "hidden",
      "user-select": "none",
    });
    expect(content["box-shadow"]).toContain("var(--shadowColor)");
    expect(content.animation).toMatch(/^enter_/);
    expect(css(get("[data-testid=viewport]"))).toMatchObject({ padding: "2px", overflow: "auto" });
    expect(css(get("[data-testid=label]"))).toMatchObject({ "font-weight": "600", color: "var(--color10)", "font-size": "13px" });
    const item = css(get("[data-testid=item-apple]"));
    expect(item).toMatchObject({
      "align-items": "center",
      "padding-left": "13px",
      "padding-right": "13px",
      "padding-top": "7px",
      "padding-bottom": "7px",
      "border-radius": "7px",
      cursor: "pointer",
      "background-color": "transparent",
    });
    expect(css(get("[data-testid=check-apple]"))).toMatchObject({ display: "inline-flex", width: "16px" });
    expect(css(get("[data-testid=item-apple] span"))).toMatchObject({ "font-size": "15px", color: "var(--color)" });
    expect(css(get("[data-testid=value]"))).toMatchObject({ "font-size": "15px" });
  });

  it("sizes the trigger, value and item text together", () => {
    const { get } = render(h(Example, { size: "$2", defaultOpen: true, defaultValue: "apple" }));
    expect(css(get("[data-testid=trigger]"))).toMatchObject({ height: "28px" });
    expect(css(get("[data-testid=value]"))).toMatchObject({ "font-size": "13px" });
    expect(css(get("[data-testid=item-apple] span"))).toMatchObject({ "font-size": "13px" });
  });

  it("opens from the keyboard and moves focus through enabled options", async () => {
    const { get } = render(h(Example, { disabledItems: ["blueberry"] }));
    const trigger = get("[data-testid=trigger]");
    trigger.focus();
    expect(keydown(trigger, "ArrowDown").defaultPrevented).toBe(true);
    const content = get("[data-testid=content]");
    await tick();
    expect(document.activeElement).toBe(content);

    keydown(content, "ArrowDown");
    expect(document.activeElement).toBe(get("[data-testid=item-apple]"));
    keydown(content, "ArrowDown");
    expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
    keydown(content, "ArrowDown");
    expect(document.activeElement).toBe(get("[data-testid=item-cherry]"));
    keydown(content, "ArrowDown");
    expect(document.activeElement).toBe(get("[data-testid=item-cherry]"));
    keydown(content, "Home");
    expect(document.activeElement).toBe(get("[data-testid=item-apple]"));
    keydown(content, "End");
    expect(document.activeElement).toBe(get("[data-testid=item-cherry]"));
    keydown(content, "ArrowUp");
    expect(document.activeElement).toBe(get("[data-testid=item-banana]"));

    const blueberry = get("[data-testid=item-blueberry]");
    expect(blueberry.getAttribute("aria-disabled")).toBe("true");
    expect(css(blueberry)).toMatchObject({ opacity: "0.5", "pointer-events": "none", cursor: "not-allowed" });

    keydown(document.activeElement!, "Enter");
    expect(get("[data-testid=content]").hidden).toBe(true);
    expect(get("[data-testid=value]").textContent).toBe("Banana");
    await tick();
    expect(document.activeElement).toBe(trigger);

    keydown(trigger, " ");
    await tick();
    expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
    keydown(document.activeElement!, "Escape");
    expect(get("[data-testid=content]").hidden).toBe(true);
    expect(get("[data-testid=value]").textContent).toBe("Banana");
  });

  it("supports typeahead both closed and open", async () => {
    const onValueChange = vi.fn();
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { get } = render(h(Example, { onValueChange }));
    const trigger = get("[data-testid=trigger]");
    keydown(trigger, "b");
    expect(onValueChange).toHaveBeenLastCalledWith("banana");
    keydown(trigger, "l");
    expect(onValueChange).toHaveBeenLastCalledWith("blueberry");
    now += 600;
    keydown(trigger, "b");
    expect(onValueChange).toHaveBeenLastCalledWith("banana");
    now += 600;
    keydown(trigger, "b");
    expect(onValueChange).toHaveBeenLastCalledWith("blueberry");
    now += 600;
    keydown(trigger, "b");
    expect(onValueChange).toHaveBeenLastCalledWith("banana");
    now += 600;

    keydown(trigger, "Enter");
    const content = get("[data-testid=content]");
    await tick();
    expect(document.activeElement).toBe(get("[data-testid=item-banana]"));
    keydown(content, "c");
    expect(document.activeElement).toBe(get("[data-testid=item-cherry]"));
    now += 600;
    keydown(content, "a");
    expect(document.activeElement).toBe(get("[data-testid=item-apple]"));
    expect(get("[data-testid=value]").textContent).toBe("Banana");
  });

  it("closes on Tab and on outside press without changing the value", () => {
    const { get } = render(h("div", null, h(Example, { defaultValue: "apple" }), h("button", { "data-testid": "outside" }, "Outside")));
    const trigger = get("[data-testid=trigger]");
    click(trigger);
    keydown(get("[data-testid=content]"), "Tab");
    expect(get("[data-testid=content]").hidden).toBe(true);
    click(trigger);
    expect(get("[data-testid=content]").hidden).toBe(false);
    click(get("[data-testid=outside]"));
    expect(get("[data-testid=content]").hidden).toBe(true);
    expect(get("[data-testid=value]").textContent).toBe("Apple");
  });

  it("submits its value through a hidden input and respects disabled", () => {
    const { get, container } = render(h(Example, { name: "fruit", defaultValue: "cherry", disabled: true }));
    const input = container.querySelector<HTMLInputElement>("input[name=fruit]")!;
    expect(input.type).toBe("hidden");
    expect(input.value).toBe("cherry");
    const trigger = get("[data-testid=trigger]");
    expect(trigger.hasAttribute("disabled")).toBe(true);
    click(trigger);
    keydown(trigger, "ArrowDown");
    expect(get("[data-testid=content]").hidden).toBe(true);
  });

  it("supports controlled value and open state", () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    const { get } = render(h(Example, { value: "apple", open: true, onValueChange, onOpenChange }));
    expect(get("[data-testid=value]").textContent).toBe("Apple");
    click(get("[data-testid=item-cherry]"));
    expect(onValueChange).toHaveBeenCalledWith("cherry");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(get("[data-testid=value]").textContent).toBe("Apple");
    expect(get("[data-testid=content]").hidden).toBe(false);
  });

  it("uses explicit item labels and custom Value children", () => {
    const { get } = render(
      h(
        Select,
        { defaultValue: "ca" },
        h(Select.Trigger, { "data-testid": "trigger" }, h(Select.Value, { "data-testid": "value" }, "Country: ", h("b", null, "CA"))),
        h(Select.Content, null, h(Select.Item, { value: "ca", label: "Canada", "data-testid": "item" }, h("span", null, "🇨🇦"), h(Select.ItemText, null, "Canada"))),
      ),
    );
    expect(get("[data-testid=value]").textContent).toBe("Country: CA");
    expect(get("[data-testid=value]").hasAttribute("data-placeholder")).toBe(false);
    const trigger = get("[data-testid=trigger]");
    keydown(trigger, "c");
    click(trigger);
    expect(get("[data-testid=item]").getAttribute("aria-selected")).toBe("true");
  });

  it("discovers items rendered by other components and follows them as they change", async () => {
    function FruitItem(props: { value: string; label: string }) {
      return h(Select.Item, { value: props.value, "data-testid": `item-${props.value}` }, h(Select.ItemText, null, props.label));
    }
    function Fruits() {
      return when(["fruits", "name", $.name]).map((row) => h(FruitItem, { key: row.name as string, value: (row.name as string).toLowerCase(), label: row.name as string }));
    }
    replace("fruits", "name", "Banana");
    const onValueChange = vi.fn();
    const { get, all, unmount } = render(
      h(
        Select,
        { defaultValue: "banana", onValueChange },
        h(Select.Trigger, { "data-testid": "trigger" }, h(Select.Value, { placeholder: "Pick", "data-testid": "value" })),
        h(Select.Content, { "data-testid": "content" }, h(Fruits, null)),
      ),
    );
    await tick();
    expect(get("[data-testid=value]").textContent).toBe("Banana");
    expect(get("[data-testid=content]").hidden).toBe(true);

    claim("fruits", "name", "Cherry");
    await tick();
    const trigger = get("[data-testid=trigger]");
    keydown(trigger, "c");
    expect(onValueChange).toHaveBeenLastCalledWith("cherry");
    expect(get("[data-testid=value]").textContent).toBe("Cherry");

    keydown(trigger, "Enter");
    await tick();
    expect(all("[role=option]").map((el) => el.textContent)).toEqual(["Banana", "Cherry"]);
    expect(document.activeElement).toBe(get("[data-testid=item-cherry]"));
    unmount();
    expect(when([$.id, "options", $.json])).toEqual([]);
    forget("fruits", _, _);
  });

  it("merges the trigger onto a custom element with asChild", () => {
    const { get } = render(
      h(
        Select,
        { defaultValue: "apple" },
        h(Select.Trigger, { asChild: true }, h(Button, { "data-testid": "trigger", variant: "outlined", size: "$5" }, h(Select.Value, null))),
        h(Select.Content, { "data-testid": "content" }, h(Select.Item, { value: "apple" }, h(Select.ItemText, null, "Apple"))),
      ),
    );
    const trigger = get("[data-testid=trigger]");
    expect(trigger.className).toContain("is_Button");
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(css(trigger)).toMatchObject({ height: "52px" });
    expect(trigger.querySelector("svg")).toBeNull();
    click(trigger);
    expect(get("[data-testid=content]").getAttribute("aria-labelledby")).toBe(trigger.id);
  });

  it("labels Select.Group with Select.Label via aria-labelledby", () => {
    const { get } = render(h(Example, { defaultOpen: true }));
    const group = get("[data-testid=viewport]").querySelector('[role="group"]')!;
    const label = get("[data-testid=label]");
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
  });

  it("marks the trigger aria-required and the hidden input required", () => {
    const { get, container } = render(h(Example, { name: "fruit", required: true }));
    expect(get("[data-testid=trigger]").getAttribute("aria-required")).toBe("true");
    const input = container.querySelector<HTMLInputElement>("input[name=fruit]")!;
    expect(input.required).toBe(true);
  });

  it("reverts its displayed value to defaultValue when the surrounding form resets", () => {
    const { get, container } = render(
      h("form", null, h(Example, { name: "fruit", defaultValue: "apple" }), h("button", { type: "reset" }, "Reset")),
    );
    click(get("[data-testid=trigger]"));
    click(get("[data-testid=item-cherry]"));
    expect(get("[data-testid=value]").textContent).toBe("Cherry");
    container.querySelector("form")!.reset();
    expect(get("[data-testid=value]").textContent).toBe("Apple");
  });
});
