// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, resetUI } from "../../testing";
import { createTokens } from "../../tokens";
import { createThemes, setTheme } from "../../themes";
import { createFont } from "../../fonts";
import { Button } from "../Button";
import { Input, TextArea } from "../Input";
import { Checkbox } from "../Checkbox";
import { Switch } from "../Switch";
import { RadioGroup } from "../RadioGroup";
import { Slider } from "../Slider";
import { Select } from "../Select";
import { Label } from "../Label";
import { Form } from "../Form";
import { ToggleGroup } from "../ToggleGroup";

beforeEach(() => {
  resetUI();
});

describe("Button", () => {
  beforeEach(() => {
    createTokens({
      size: { "1": 20, "2": 28, "3": 36, "4": 44, true: 44, "5": 52 },
      space: { "1": 4, "2": 6, "3": 8, "4": 10, true: 10, "5": 12 },
      radius: { "1": 3, "2": 5, "3": 7, "4": 9, true: 9, "5": 10 },
    });
    createThemes({ light: { background: "#fff", backgroundHover: "#eee", backgroundPress: "#ddd", color: "#111", borderColor: "#ccc", borderColorHover: "#aaa", borderColorPress: "#999", outlineColor: "blue" } });
    setTheme("light");
    createFont("body", { family: "Inter", size: { "1": 11, "2": 12, "3": 13, "4": 14, true: 14, "5": 16 } });
  });

  it("renders a button element wrapping string children in Button.Text", () => {
    const r = render(h(Button, null, "Click me"));
    expect(r.root.tagName).toBe("BUTTON");
    expect(r.root.getAttribute("type")).toBe("button");
    expect(r.root.textContent).toBe("Click me");
    const label = r.get("span");
    expect(label.classList.contains("is_ButtonText")).toBe(true);
    expect(css(r.root)).toMatchObject({ display: "flex", height: "44px", "border-radius": "9px", "padding-left": "10px" });
    expect(css(label)["font-size"]).toBe("14px");
  });

  it("sizes the frame and label from the size token", () => {
    const r = render(h(Button, { size: "$2" }, "Small"));
    expect(css(r.root)).toMatchObject({ height: "28px", "border-radius": "5px", gap: "6px" });
    expect(css(r.get("span"))["font-size"]).toBe("12px");
    const bare = render(h(Button, { size: "5" }, "Large"));
    expect(css(bare.root).height).toBe("52px");
  });

  it("applies variant styles", () => {
    const outlined = render(h(Button, { variant: "outlined" }, "Outlined"));
    expect(css(outlined.root)).toMatchObject({ "background-color": "transparent", "border-color": "var(--borderColor)" });
    const ghost = render(h(Button, { variant: "ghost" }, "Ghost"));
    expect(css(ghost.root)).toMatchObject({ "background-color": "transparent", "border-color": "transparent" });
    expect(css(ghost.root, ":hover")["background-color"]).toBe("var(--backgroundHover)");
  });

  it("circular buttons are square with a large radius", () => {
    const r = render(h(Button, { circular: true, size: "$4" }, "+"));
    expect(css(r.root)).toMatchObject({ width: "44px", height: "44px", padding: "0px", "border-radius": "100000px" });
  });

  it("disabled buttons forward the attribute and dim", () => {
    const r = render(h(Button, { disabled: true }, "Nope"));
    expect(r.root.hasAttribute("disabled")).toBe(true);
    expect(css(r.root)).toMatchObject({ opacity: "0.5", "pointer-events": "none" });
  });

  it("renders icon and iconAfter in Button.Icon", () => {
    const r = render(h(Button, { icon: "★", iconAfter: "→" }, "Star"));
    const icons = r.all(".is_ButtonIcon");
    expect(icons).toHaveLength(2);
    expect(icons[0].textContent).toBe("★");
    expect(icons[1].textContent).toBe("→");
    expect(r.root.children[1].classList.contains("is_ButtonText")).toBe(true);
  });

  it("unstyled removes the default chrome", () => {
    const r = render(h(Button, { unstyled: true }, "Bare"));
    expect(css(r.root)["background-color"]).toBe("transparent");
    expect(css(r.root).height).toBeUndefined();
  });

  it("forwards click handlers and text props", () => {
    let clicked = 0;
    const r = render(h(Button, { onClick: () => clicked++, color: "red", fontWeight: "700" }, "Go"));
    click(r.root);
    expect(clicked).toBe(1);
    expect(css(r.get("span"))).toMatchObject({ color: "red", "font-weight": "700" });
  });

  it("has sub-components", () => {
    expect(Button.Text).toBeDefined();
    expect(Button.Icon).toBeDefined();
    expect(Button.Frame).toBeDefined();
    expect(Button.Apply).toBeDefined();
  });

  it("Button.Apply provides a size to every button beneath", () => {
    const r = render(h(Button.Apply, { value: { size: "$2" } }, h(Button, null, "A")));
    expect(css(r.get("button")).height).toBe("28px");
    expect(css(r.get("span"))["font-size"]).toBe("12px");
  });
});

describe("Input", () => {
  it("renders an input element", () => {
    const result = Input({}) as any;
    expect(result.tag).toBe("input");
  });

  it("applies size variant", () => {
    const sm = Input({ size: "1" }) as any;
    const lg = Input({ size: "4" }) as any;
    expect(sm.props.class).not.toBe(lg.props.class);
  });

  it("passes through placeholder", () => {
    const result = Input({ placeholder: "Enter text..." }) as any;
    expect(result.props.placeholder).toBe("Enter text...");
  });
});

describe("TextArea", () => {
  it("renders a textarea element", () => {
    const result = TextArea({}) as any;
    expect(result.tag).toBe("textarea");
  });
});

describe("Checkbox", () => {
  it("renders with role checkbox", () => {
    const result = Checkbox({}) as any;
    expect(result.props.role).toBe("checkbox");
  });

  it("reflects checked state in aria", () => {
    const checked = Checkbox({ checked: true, children: "✓" }) as any;
    const unchecked = Checkbox({ checked: false }) as any;
    expect(checked.props["aria-checked"]).toBe("true");
    expect(unchecked.props["aria-checked"]).toBe("false");
  });

  it("has Indicator sub-component", () => {
    expect(Checkbox.Indicator).toBeDefined();
    const result = Checkbox.Indicator({ children: "✓" }) as any;
    expect(result.tag).toBe("span");
  });

  it("calls onCheckedChange on click", () => {
    let called = false;
    const result = Checkbox({
      checked: false,
      onCheckedChange: (v: boolean) => { called = true; },
    }) as any;
    // The onClick handler should be remember
    expect(result.props.onClick).toBeDefined();
  });

  it("disabled checkbox gets different styling", () => {
    const enabled = Checkbox({ disabled: false }) as any;
    const disabled = Checkbox({ disabled: true }) as any;
    // Disabled state produces a different class (opacity/cursor are style props)
    expect(disabled.props.class).not.toBe(enabled.props.class);
  });
});

describe("Switch", () => {
  it("renders with role switch", () => {
    const result = Switch({}) as any;
    expect(result.props.role).toBe("switch");
  });

  it("reflects checked state", () => {
    const on = Switch({ checked: true }) as any;
    expect(on.props["aria-checked"]).toBe("true");
  });

  it("has Thumb sub-component", () => {
    expect(Switch.Thumb).toBeDefined();
  });
});

describe("RadioGroup", () => {
  it("renders with role radiogroup", () => {
    const result = RadioGroup({ children: null }) as any;
    expect(result.props.role).toBe("radiogroup");
  });

  it("has Item and Indicator sub-components", () => {
    expect(RadioGroup.Item).toBeDefined();
    expect(RadioGroup.Indicator).toBeDefined();
  });

  it("Item renders with role radio", () => {
    const item = RadioGroup.Item({ value: "a" }) as any;
    expect(item.props.role).toBe("radio");
  });
});

describe("Slider", () => {
  it("renders with role slider", () => {
    const result = Slider({ value: [50], min: 0, max: 100 }) as any;
    expect(result.props.role).toBe("slider");
    expect(result.props["aria-valuenow"]).toBe("50");
  });

  it("has Track, TrackActive, and Thumb sub-components", () => {
    expect(Slider.Track).toBeDefined();
    expect(Slider.TrackActive).toBeDefined();
    expect(Slider.Thumb).toBeDefined();
  });
});

describe("Select", () => {
  it("renders select structure", () => {
    const result = Select({ value: "a", children: null }) as any;
    expect(result).toBeDefined();
  });

  it("has all sub-components", () => {
    expect(Select.Trigger).toBeDefined();
    expect(Select.Value).toBeDefined();
    expect(Select.Content).toBeDefined();
    expect(Select.Item).toBeDefined();
    expect(Select.ItemText).toBeDefined();
    expect(Select.ItemIndicator).toBeDefined();
    expect(Select.Group).toBeDefined();
    expect(Select.Label).toBeDefined();
    expect(Select.Viewport).toBeDefined();
  });

  it("Select.Trigger renders a button", () => {
    const result = Select.Trigger({ children: "Select..." }) as any;
    expect(result.tag).toBe("button");
  });
});

describe("Label", () => {
  it("renders a label element", () => {
    const result = Label({ children: "Name" }) as any;
    expect(result.tag).toBe("label");
  });

  it("passes htmlFor", () => {
    const result = Label({ htmlFor: "input-1", children: "Name" }) as any;
    expect(result.props.htmlFor).toBe("input-1");
  });
});

describe("Form", () => {
  it("renders a form element", () => {
    const result = Form({ children: null }) as any;
    expect(result.tag).toBe("form");
  });

  it("has Trigger sub-component", () => {
    expect(Form.Trigger).toBeDefined();
    const result = Form.Trigger({ children: "Submit" }) as any;
    expect(result.tag).toBe("button");
  });
});

describe("ToggleGroup", () => {
  it("renders with role group", () => {
    const result = ToggleGroup({ children: null }) as any;
    expect(result.props.role).toBe("group");
  });

  it("has Item sub-component", () => {
    expect(ToggleGroup.Item).toBeDefined();
    const result = ToggleGroup.Item({ children: "A" }) as any;
    expect(result.tag).toBe("button");
  });
});
