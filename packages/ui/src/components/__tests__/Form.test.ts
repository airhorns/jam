// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, setupDefaultUI } from "../../testing";
import { Form } from "../Form";
import { Input } from "../Input";
import { Button } from "../Button";

beforeEach(() => {
  setupDefaultUI();
});

describe("Form", () => {
  it("renders a form that stacks its fields", () => {
    const r = render(h(Form, null, h(Input, { name: "email" })));
    expect(r.root.tagName).toBe("FORM");
    expect(r.root.classList.contains("is_Form")).toBe(true);
    expect(css(r.root)).toMatchObject({ display: "flex", "flex-direction": "column", gap: "18px" });
    expect(r.get("input").getAttribute("name")).toBe("email");
  });

  it("onSubmit runs instead of navigating", () => {
    let submitted: Event | null = null;
    const r = render(h(Form, { onSubmit: (event: Event) => (submitted = event) }));
    const event = new Event("submit", { bubbles: true, cancelable: true });
    r.root.dispatchEvent(event);
    expect(submitted).toBe(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reads its values from the submitted form", () => {
    let name = "";
    const r = render(
      h(Form, { onSubmit: (e: Event) => (name = String(new FormData(e.target as HTMLFormElement).get("name"))) }, h(Input, { name: "name", value: "Ada" })),
    );
    r.root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(name).toBe("Ada");
  });

  it("Trigger is a submit button", () => {
    const r = render(h(Form, null, h(Form.Trigger, null, "Save")));
    const trigger = r.get("button");
    expect(trigger.getAttribute("type")).toBe("submit");
    expect(trigger.classList.contains("is_FormTrigger")).toBe(true);
    expect(css(trigger)).toMatchObject({ height: "44px", cursor: "pointer" });
    expect(trigger.className).toContain("t_light_Button");
  });

  it("Trigger keeps a caller className alongside its own", () => {
    const r = render(h(Form, null, h(Form.Trigger, { className: "mine" }, "Save")));
    const trigger = r.get("button");
    expect(trigger.classList.contains("is_FormTrigger")).toBe(true);
    expect(trigger.classList.contains("mine")).toBe(true);
  });

  it("Trigger with asChild submits through its child", () => {
    let submits = 0;
    const r = render(
      h(Form, { onSubmit: () => submits++ }, h(Form.Trigger, { asChild: true }, h(Button, null, "Save"))),
    );
    const buttons = r.all("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("type")).toBe("submit");
    expect(buttons[0].classList.contains("is_Button")).toBe(true);
    expect(buttons[0].classList.contains("is_FormTrigger")).toBe(true);
    // happy-dom does not submit forms from a click, so the submit event stands in.
    r.root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(submits).toBe(1);
  });

  it("passes click handlers through the trigger", () => {
    let clicked = 0;
    const r = render(h(Form, null, h(Form.Trigger, { onClick: () => clicked++ }, "Save")));
    click(r.get("button"));
    expect(clicked).toBe(1);
  });
});
