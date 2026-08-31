// @vitest-environment happy-dom
// Every stateful component can be read through describeUI() and operated
// through drive()/press(), controlled or uncontrolled, the way a user would.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { $, describeUI, drive, outlineUI, press, replace, when } from "@jam/core";
import type { Term, UINode } from "@jam/core";
import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import { render, setupDefaultUI } from "../../testing";
import { Accordion } from "../../components/Accordion";
import { AlertDialog } from "../../components/AlertDialog";
import { Checkbox } from "../../components/Checkbox";
import { Dialog } from "../../components/Dialog";
import { Menu } from "../../components/Menu";
import { Popover } from "../../components/Popover";
import { RadioGroup } from "../../components/RadioGroup";
import { Select } from "../../components/Select";
import { Sheet } from "../../components/Sheet";
import { Slider } from "../../components/Slider";
import { Switch } from "../../components/Switch";
import { Tabs } from "../../components/Tabs";
import { Toast, toastController } from "../../components/Toast";
import { ToggleGroup } from "../../components/ToggleGroup";
import { Tooltip } from "../../components/Tooltip";

beforeEach(() => {
  setupDefaultUI();
  toastController.hideAll();
});

type Spec = {
  name: string;
  /** Driver key the state is exposed under. */
  key: string;
  /** Prop names for the uncontrolled default, the controlled value and the change callback. */
  defaultProp: string;
  valueProp: string;
  changeProp: string;
  initial: unknown;
  next: unknown;
  /** How `drive()` is asked for `next` (defaults to `next`); lets a Term stand in for an array. */
  driven?: Term;
  /** How describeUI() reports each value (defaults to the value itself). */
  shown?: (value: unknown) => Term;
  mount: (props: Record<string, unknown>) => VNode;
  /** True when the DOM shows `value`. */
  showing: (value: unknown) => boolean;
  /** Accessible name of the element a user would press to move from `initial` towards `next`, when there is one. */
  pressTarget?: string;
};

const has = (selector: string) => document.querySelector(selector) !== null;
const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name) ?? null;

const specs: Spec[] = [
  {
    name: "Dialog",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) =>
      h(Dialog, props, h(Dialog.Trigger, null, "Open dialog"), h(Dialog.Portal, null, h(Dialog.Content, null, h(Dialog.Title, null, "Dialog"), h(Dialog.Close, null, "Close")))),
    showing: (open) => has("[role=dialog]") === open,
    pressTarget: "Open dialog",
  },
  {
    name: "AlertDialog",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) =>
      h(AlertDialog, props, h(AlertDialog.Trigger, null, "Delete"), h(AlertDialog.Portal, null, h(AlertDialog.Content, null, h(AlertDialog.Title, null, "Delete?"), h(AlertDialog.Cancel, null, "Cancel")))),
    showing: (open) => has("[role=alertdialog]") === open,
    pressTarget: "Delete",
  },
  {
    name: "Sheet",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) => h(Sheet, { ...props, "aria-label": "Details" }, h(Sheet.Overlay, null), h(Sheet.Frame, null, h("p", null, "More info"))),
    showing: (open) => (attr(".is_SheetPositioner", "data-state") ?? "closed") === (open ? "open" : "closed"),
  },
  {
    name: "Sheet position",
    key: "position", defaultProp: "defaultPosition", valueProp: "position", changeProp: "onPositionChange", initial: 0, next: 1,
    mount: (props) => h(Sheet, { ...props, defaultOpen: true, snapPoints: [90, 50], "aria-label": "Details" }, h(Sheet.Frame, null, h("p", null, "More info"))),
    showing: (position) => attr(".is_SheetPositioner", "data-position") === String(position),
  },
  {
    name: "Popover",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) => h(Popover, props, h(Popover.Trigger, null, "Open popover"), h(Popover.Content, null, h("p", null, "Hello"))),
    showing: (open) => has(".is_PopoverContent") === open,
    pressTarget: "Open popover",
  },
  {
    name: "Menu",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) => h(Menu, props, h(Menu.Trigger, null, "Actions"), h(Menu.Content, null, h(Menu.Item, null, "One"), h(Menu.Item, null, "Two"))),
    showing: (open) => has("[role=menu]") === open,
    pressTarget: "Actions",
  },
  {
    name: "Tooltip",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) => h(Tooltip, { delay: 0, ...props }, h(Tooltip.Trigger, null, "Hover me"), h(Tooltip.Content, null, "Helpful hint")),
    showing: (open) => has("[role=tooltip]") === open,
  },
  {
    name: "Toast",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: true, next: false,
    mount: (props) => h(Toast, { duration: Infinity, ...props }, h(Toast.Title, null, "Saved"), h(Toast.Close, { "aria-label": "Dismiss" }, "×")),
    showing: (open) => has("[role=status]") === open,
    pressTarget: "Dismiss",
  },
  {
    name: "Select value",
    key: "value", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: "apple", next: "cherry",
    mount: (props) =>
      h(Select, { ...props, "aria-label": "Fruit" },
        h(Select.Trigger, { "aria-label": "Fruit" }, h(Select.Value, { placeholder: "Pick a fruit" })),
        h(Select.Content, null, h(Select.Viewport, null,
          h(Select.Item, { value: "apple" }, h(Select.ItemText, null, "Apple")),
          h(Select.Item, { value: "banana", disabled: true }, h(Select.ItemText, null, "Banana")),
          h(Select.Item, { value: "cherry" }, h(Select.ItemText, null, "Cherry"))))),
    showing: (value) => document.querySelector(".is_SelectValue")?.textContent === { apple: "Apple", cherry: "Cherry" }[String(value)],
  },
  {
    name: "Select open",
    key: "open", defaultProp: "defaultOpen", valueProp: "open", changeProp: "onOpenChange", initial: false, next: true,
    mount: (props) =>
      h(Select, props, h(Select.Trigger, { "aria-label": "Fruit" }, h(Select.Value, { placeholder: "Pick a fruit" })),
        h(Select.Content, null, h(Select.Viewport, null, h(Select.Item, { value: "apple" }, h(Select.ItemText, null, "Apple"))))),
    showing: (open) => attr("[role=listbox]", "data-state") === (open ? "open" : "closed"),
    pressTarget: "Fruit",
  },
  {
    name: "Tabs",
    key: "value", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: "a", next: "b",
    mount: (props) =>
      h(Tabs, { ...props, "aria-label": "Sections" }, h(Tabs.List, { "aria-label": "Sections" }, h(Tabs.Tab, { value: "a" }, "First"), h(Tabs.Tab, { value: "b" }, "Second")),
        h(Tabs.Content, { value: "a" }, "Body A"), h(Tabs.Content, { value: "b" }, "Body B")),
    showing: (value) => document.querySelector("[role=tab][aria-selected=true]")?.textContent === { a: "First", b: "Second" }[String(value)],
    pressTarget: "Second",
  },
  {
    name: "Accordion single",
    key: "value", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: "a", next: "b",
    mount: (props) =>
      h(Accordion, { type: "single", ...props }, ...["a", "b"].map((v) => h(Accordion.Item, { value: v }, h(Accordion.Header, null, h(Accordion.Trigger, null, `Item ${v}`)), h(Accordion.Content, null, `Body ${v}`)))),
    showing: (value) => document.querySelector("button[aria-expanded=true]")?.textContent === `Item ${value}`,
    pressTarget: "Item b",
  },
  {
    name: "Accordion multiple",
    key: "values", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: ["a"], next: ["a", "b"],
    driven: JSON.stringify(["a", "b"]),
    shown: (value) => JSON.stringify(value),
    mount: (props) =>
      h(Accordion, { type: "multiple", ...props }, ...["a", "b"].map((v) => h(Accordion.Item, { value: v }, h(Accordion.Header, null, h(Accordion.Trigger, null, `Item ${v}`)), h(Accordion.Content, null, `Body ${v}`)))),
    showing: (value) => JSON.stringify(Array.from(document.querySelectorAll("button[aria-expanded=true]")).map((b) => b.textContent?.slice(-1))) === JSON.stringify(value),
    pressTarget: "Item b",
  },
  {
    name: "Checkbox",
    key: "checked", defaultProp: "defaultChecked", valueProp: "checked", changeProp: "onCheckedChange", initial: false, next: true,
    mount: (props) => h(Checkbox, { ...props, "aria-label": "Agree" }),
    showing: (checked) => attr("[role=checkbox]", "aria-checked") === String(checked),
    pressTarget: "Agree",
  },
  {
    name: "Switch",
    key: "checked", defaultProp: "defaultChecked", valueProp: "checked", changeProp: "onCheckedChange", initial: false, next: true,
    mount: (props) => h(Switch, { ...props, "aria-label": "Notifications" }),
    showing: (checked) => attr("[role=switch]", "aria-checked") === String(checked),
    pressTarget: "Notifications",
  },
  {
    name: "RadioGroup",
    key: "value", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: "a", next: "b",
    mount: (props) => h(RadioGroup, { ...props, "aria-label": "Size" }, h(RadioGroup.Item, { value: "a", "aria-label": "Small" }), h(RadioGroup.Item, { value: "b", "aria-label": "Large" })),
    showing: (value) => attr("[role=radio][aria-checked=true]", "aria-label") === { a: "Small", b: "Large" }[String(value)],
    pressTarget: "Large",
  },
  {
    name: "ToggleGroup single",
    key: "value", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: "left", next: "right",
    mount: (props) => h(ToggleGroup, { type: "single", ...props, "aria-label": "Align" }, h(ToggleGroup.Item, { value: "left" }, "Left"), h(ToggleGroup.Item, { value: "right" }, "Right")),
    showing: (value) => document.querySelector("[aria-pressed=true]")?.textContent?.toLowerCase() === value,
    pressTarget: "Right",
  },
  {
    name: "ToggleGroup multiple",
    key: "values", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: ["bold"], next: ["bold", "italic"],
    driven: JSON.stringify(["bold", "italic"]),
    shown: (value) => JSON.stringify(value),
    mount: (props) => h(ToggleGroup, { type: "multiple", ...props, "aria-label": "Style" }, h(ToggleGroup.Item, { value: "bold" }, "bold"), h(ToggleGroup.Item, { value: "italic" }, "italic")),
    showing: (value) => JSON.stringify(Array.from(document.querySelectorAll("[aria-pressed=true]")).map((b) => b.textContent)) === JSON.stringify(value),
    pressTarget: "italic",
  },
  {
    name: "Slider",
    key: "value", defaultProp: "defaultValue", valueProp: "value", changeProp: "onValueChange", initial: 20, next: 60,
    mount: (props) => h(Slider, { min: 0, max: 100, step: 10, ...props }, h(Slider.Track, null, h(Slider.TrackActive, null)), h(Slider.Thumb, { "aria-label": "Volume" })),
    showing: (value) => attr("[role=slider]", "aria-valuenow") === String(value),
  },
];

const flatten = (nodes: UINode[]): UINode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
const driveNodeFor = (key: string): UINode => {
  const node = flatten(describeUI()).find((n) => n.drive && key in n.drive.keys);
  if (!node) throw new Error(`No node drives "${key}" in:\n${outlineUI()}`);
  return node;
};
const byName = (name: string): UINode => {
  const node = flatten(describeUI()).find((n) => n.name === name && n.role !== "text" && n.role !== "heading");
  if (!node) throw new Error(`No node named "${name}" in:\n${outlineUI()}`);
  return node;
};
const changeArg = (spec: Spec) => (spec.key === "values" ? [spec.next] : spec.key === "value" && spec.name === "Slider" ? [[spec.next]] : [spec.next]);

describe("drive conformance", () => {
  for (const spec of specs) {
    const show = spec.shown ?? ((v) => v as Term);
    describe(spec.name, () => {
      it("is described with its current state and driven through its onChange when uncontrolled", () => {
        const onChange = vi.fn();
        render(spec.mount({ [spec.defaultProp]: spec.initial, [spec.changeProp]: onChange }));
        expect(spec.showing(spec.initial)).toBe(true);
        const node = driveNodeFor(spec.key);
        expect(node.drive!.keys[spec.key]).toEqual(show(spec.initial));

        drive(node.drive!.id, spec.key, spec.driven ?? (spec.next as Term));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0]).toEqual(changeArg(spec));
        expect(spec.showing(spec.next)).toBe(true);
        expect(driveNodeFor(spec.key).drive!.keys[spec.key]).toEqual(show(spec.next));
      });

      it("asks the owner when controlled, and follows the owner's answer", () => {
        const store = (value: unknown) => replace("owner", spec.key, JSON.stringify(value));
        store(spec.initial);
        const Owner = () => {
          const stored = when(["owner", spec.key, $.json])[0]?.json as string;
          return spec.mount({ [spec.valueProp]: JSON.parse(stored), [spec.changeProp]: store });
        };
        render(h(Owner, null));
        expect(spec.showing(spec.initial)).toBe(true);

        const node = driveNodeFor(spec.key);
        drive(node.drive!.id, spec.key, spec.driven ?? (spec.next as Term));
        expect(spec.showing(spec.next)).toBe(true);
        expect(driveNodeFor(spec.key).drive!.keys[spec.key]).toEqual(show(spec.next));
      });

      it("does nothing when a controlled owner declines the change", () => {
        const onChange = vi.fn();
        render(spec.mount({ [spec.valueProp]: spec.initial, [spec.changeProp]: onChange }));
        drive(driveNodeFor(spec.key).drive!.id, spec.key, spec.driven ?? (spec.next as Term));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(spec.showing(spec.initial)).toBe(true);
      });

      it("can be driven from any element inside the component, not just its component id", () => {
        render(spec.mount({ [spec.defaultProp]: spec.initial }));
        const elements = flatten(describeUI()).filter((n) => n.id && n.role !== "text");
        const deepest = elements[elements.length - 1];
        expect(deepest, outlineUI()).toBeDefined();
        drive(deepest.id!, spec.key, spec.driven ?? (spec.next as Term));
        expect(spec.showing(spec.next)).toBe(true);
      });

      if (spec.pressTarget !== undefined) {
        it(`moves towards the next state when "${spec.pressTarget}" is pressed`, () => {
          const onChange = vi.fn();
          render(spec.mount({ [spec.defaultProp]: spec.initial, [spec.changeProp]: onChange }));
          press(byName(spec.pressTarget!).id!);
          expect(onChange).toHaveBeenCalledTimes(1);
          expect(spec.showing(spec.next)).toBe(true);
        });
      }

      it("names every interactive node it renders", () => {
        render(spec.mount({ [spec.defaultProp]: spec.next }));
        const unnamed = flatten(describeUI({ interactive: true })).filter((n) => n.role !== "text" && n.name === undefined && !["generic", "hidden", "list", "listitem", "group", "presentation"].includes(n.role));
        expect(unnamed.map((n) => `${n.role} #${n.id}`), outlineUI({ interactive: true })).toEqual([]);
      });
    });
  }

  it("Select tells describeUI() which values it accepts", () => {
    render(specs.find((s) => s.name === "Select value")!.mount({ defaultValue: "apple" }));
    expect(driveNodeFor("value").drive!.keys).toEqual({ value: "apple", open: false, options: JSON.stringify(["apple", "cherry"]) });
    expect(() => drive(driveNodeFor("value").drive!.id, "options", "x")).toThrow(/Nothing drives "options"/);
  });

  it("Slider accepts a JSON array for several thumbs and reports them the same way", () => {
    const onValueChange = vi.fn();
    render(h(Slider, { min: 0, max: 100, step: 5, defaultValue: [10, 90], minStepsBetweenThumbs: 1, onValueChange }, h(Slider.Track, null, h(Slider.TrackActive, null)), h(Slider.Thumb, { index: 0, "aria-label": "Low" }), h(Slider.Thumb, { index: 1, "aria-label": "High" })));
    const node = driveNodeFor("value");
    expect(node.drive!.keys.value).toBe("[10,90]");
    drive(node.drive!.id, "value", "[33, 20]");
    expect(onValueChange).toHaveBeenCalledWith([35, 40]);
    expect(() => drive(node.drive!.id, "value", "[1,2,3]")).toThrow(/2 thumbs/);
  });

  it("coerces string booleans and numbers to the state's type", () => {
    const onCheckedChange = vi.fn();
    render(h(Switch, { "aria-label": "Wifi", onCheckedChange }));
    drive(driveNodeFor("checked").drive!.id, "checked", "true");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(attr("[role=switch]", "aria-checked")).toBe("true");
  });
});
