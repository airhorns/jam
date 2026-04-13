import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jam/core";
import { clearInjectedStyles } from "../../css";
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
  db.clear();
  clearInjectedStyles();
});

describe("Button", () => {
  it("renders a button element", () => {
    const result = Button({ children: "Click me" }) as any;
    expect(result.tag).toBe("button");
    expect(result.children).toContain("Click me");
  });

  it("applies size variant", () => {
    const sm = Button({ size: "1", children: "Small" }) as any;
    const lg = Button({ size: "5", children: "Large" }) as any;
    expect(sm.props.class).not.toBe(lg.props.class);
  });

  it("applies variant styles", () => {
    const solid = Button({ children: "Solid" }) as any;
    const ghost = Button({ variant: "ghost", children: "Ghost" }) as any;
    expect(solid.props.class).not.toBe(ghost.props.class);
  });

  it("has sub-components", () => {
    expect((Button as any).Text).toBeDefined();
    expect((Button as any).Icon).toBeDefined();
  });

  it("Button.Text renders a span", () => {
    const result = (Button as any).Text({ children: "text" }) as any;
    expect(result.tag).toBe("span");
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
