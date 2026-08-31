// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, click, css, setupDefaultUI } from "../../testing";
import { Label } from "../../components/Label";
import { Input } from "../../components/Input";
import { Checkbox } from "../../components/Checkbox";

beforeEach(() => {
  setupDefaultUI();
});

const mousedown = (el: Element, detail: number): MouseEvent => {
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail });
  el.dispatchEvent(event);
  return event;
};

describe("Label conformance", () => {
  describe("the element it renders", () => {
    // radix label.tsx renders Primitive.label, so the native label semantics
    // (accessible name, click forwarding) are the browser's.
    it("renders a real label element with no role of its own", () => {
      const r = render(h(Label, null, "Email"));
      expect(r.root.tagName).toBe("LABEL");
      expect(r.root.hasAttribute("role")).toBe(false);
    });

    // radix label.test.tsx "spreads props it does not consume onto the element
    // it renders".
    it("spreads props it does not consume onto the element, including onClick", () => {
      const onClick = vi.fn();
      const r = render(h(Label, { id: "email-label", className: "custom-class", "data-testid": "label", onClick }, "Email"));
      expect(r.root.getAttribute("id")).toBe("email-label");
      expect(r.root.classList.contains("custom-class")).toBe(true);
      expect(r.root.getAttribute("data-testid")).toBe("label");
      click(r.root);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    // radix label.test.tsx "forwards props to the child element when `asChild`
    // is set".
    it("renders its child instead of a label when asChild is set", () => {
      const r = render(h(Label, { asChild: true, "data-testid": "label" }, h("span", null, "Email")));
      expect(r.root.tagName).toBe("SPAN");
      expect(r.root.getAttribute("data-testid")).toBe("label");
      expect(r.root.classList.contains("is_Label")).toBe(true);
    });

    // React's htmlFor is the `for` content attribute; the camelCase name must
    // not survive into the DOM.
    it("renders htmlFor as the for attribute and nothing else", () => {
      const r = render(h(Label, { htmlFor: "email" }, "Email"));
      expect(r.root.getAttribute("for")).toBe("email");
      expect(r.root.hasAttribute("htmlfor")).toBe(false);
    });
  });

  describe("control association", () => {
    // HTML spec: a label's `for` names its labeled control, which gets the
    // label's text as its accessible name.
    it("names the control its htmlFor points at", () => {
      const r = render(h("div", null, h(Label, { htmlFor: "email" }, "Email"), h(Input, { id: "email" })));
      const label = r.get<HTMLLabelElement>("label");
      expect(label.control).toBe(r.get("input"));
      expect(r.get<HTMLInputElement>("input").labels?.[0]).toBe(label);
    });

    // HTML spec: with no `for`, the labeled control is the first labelable
    // descendant. docs/Label.md: "Wrapping the control in the label works too".
    it("names the first labelable control it wraps when it has no htmlFor", () => {
      const r = render(h(Label, null, "Email", h(Input, { id: "email" })));
      expect((r.root as HTMLLabelElement).control).toBe(r.get("input"));
    });

    // HTML spec: only labelable elements (button, input, select, textarea,
    // meter, output, progress) can be a labeled control.
    it("has no labeled control when htmlFor points at something unlabelable", () => {
      const r = render(h("div", null, h(Label, { htmlFor: "box" }, "Email"), h("div", { id: "box" })));
      expect(r.get<HTMLLabelElement>("label").control).toBeNull();
    });

    // HTML spec: a label's activation behaviour runs the labeled control's,
    // which happy-dom implements by dispatching a click at the control.
    it("forwards a click on the label to its control", () => {
      const r = render(h("div", null, h(Label, { htmlFor: "email" }, "Email"), h(Input, { id: "email" })));
      const onClick = vi.fn();
      r.get("input").addEventListener("click", onClick);
      click(r.get("label"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    // docs/Label.md: htmlFor "is more robust with the button-based controls
    // (Checkbox, Switch) where the real focus target is not an input".
    it("activates a button-based control through the forwarded click", () => {
      const r = render(h("div", null, h(Checkbox, { id: "terms" }), h(Label, { htmlFor: "terms" }, "Accept")));
      click(r.get("label"));
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    });

    // A label activates its control, so a click on the label text must not
    // toggle a checkbox twice.
    it("activates the control exactly once per click", () => {
      const onCheckedChange = vi.fn();
      const r = render(h("div", null, h(Checkbox, { id: "terms", onCheckedChange }), h(Label, { htmlFor: "terms" }, "Accept")));
      click(r.get("label"));
      expect(onCheckedChange).toHaveBeenCalledTimes(1);
    });

    it.skip("moves focus to its control when clicked (happy-dom forwards the click but runs no focusing default action)", () => {});

    // HTML spec: a label whose labeled control is disabled has no activation
    // behaviour.
    it.skip("does not activate a disabled control (happy-dom forwards the click to a disabled control anyway)", () => {});
  });

  describe("text selection on press", () => {
    // radix label.tsx onMouseDown: "prevent text selection when double clicking
    // label" - it calls preventDefault when event.detail > 1. Label.ts reaches
    // the same end by styling the label `user-select: none`, which also covers
    // a click-and-drag selection that a detail check would miss.
    it("makes the label text unselectable so a double click cannot select it", () => {
      const r = render(h(Label, null, "Email"));
      expect(css(r.root)["user-select"]).toBe("none");
    });

    it.skip("preventDefaults a mousedown whose detail is greater than 1 (the library styles the label user-select: none instead of handling mousedown)", () => {});

    // radix label.tsx onMouseDown bails out when the target is inside a
    // `button, input, select, textarea`, so a press meant for a control inside
    // the label keeps its default behaviour (caret placement, selection).
    it("leaves a mousedown that lands on an interactive child alone", () => {
      const r = render(h(Label, null, "Email", h(Input, { id: "email" })));
      const event = mousedown(r.get("input"), 2);
      expect(event.defaultPrevented).toBe(false);
    });

    it("leaves a single-click mousedown on the label itself alone", () => {
      const r = render(h(Label, null, "Email"));
      expect(mousedown(r.root, 1).defaultPrevented).toBe(false);
    });

    // radix label.tsx returns *before* calling props.onMouseDown when the press
    // lands on an interactive child, so the caller's handler is skipped there.
    it.skip("skips the caller's onMouseDown for a press on an interactive child (the library adds no mousedown handler, so a caller's handler always runs)", () => {});

    it("calls a caller's onMouseDown for a press on the label itself", () => {
      const onMouseDown = vi.fn();
      const r = render(h(Label, { onMouseDown }, "Email"));
      mousedown(r.root, 1);
      expect(onMouseDown).toHaveBeenCalledTimes(1);
    });
  });

  describe("disabled", () => {
    // docs/Label.md: "disabled on the label does not disable anything - set
    // disabled on the control as well." Radix's Label has no disabled prop.
    it("is styling only: it sets no aria-disabled and does not disable the control", () => {
      const r = render(h(Label, { disabled: true, htmlFor: "email" }, "Email"));
      expect(r.root.hasAttribute("aria-disabled")).toBe(false);
      expect(css(r.root).opacity).toBe("0.5");
    });

    it.skip("leaves no meaningless disabled attribute on the <label> (styled.ts passes `disabled` to the DOM for every component, which is outside this component's file)", () => {});

    it("still forwards clicks to its control when the label is marked disabled", () => {
      const r = render(h("div", null, h(Checkbox, { id: "terms" }), h(Label, { htmlFor: "terms", disabled: true }, "Accept")));
      click(r.get("label"));
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    });
  });
});
