// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction, observable } from "mobx";
import { h } from "@jam/core/jsx";
import { render, click, type, focus, setupDefaultUI } from "../../testing";
import { Input, TextArea } from "../../components/Input";
import { Label } from "../../components/Label";

beforeEach(() => {
  setupDefaultUI();
});

describe("Input / TextArea conformance", () => {
  describe("the element it renders", () => {
    // docs/AUTHORING.md: "Interactive elements render real <button>/<input>
    // elements so keyboard and focus work for free."
    it("renders a real input, and TextArea a real textarea", () => {
      expect(render(h(Input, null)).root.tagName).toBe("INPUT");
      expect(render(h(TextArea, null)).root.tagName).toBe("TEXTAREA");
    });

    // HTML spec: an input with no type attribute behaves as type=text.
    it("leaves the type off unless asked, so the field is a text field", () => {
      const r = render(h(Input, null));
      expect(r.root.hasAttribute("type")).toBe(false);
      expect((r.root as HTMLInputElement).type).toBe("text");
    });

    it("passes type through for the specialised text fields", () => {
      for (const inputType of ["email", "password", "search", "url", "tel"]) {
        const r = render(h(Input, { type: inputType }));
        expect((r.root as HTMLInputElement).type).toBe(inputType);
      }
    });

    // HTML spec: placeholder is a hint shown while the value is empty; it is
    // an attribute on the control, not its label.
    it("renders placeholder as the real attribute", () => {
      const r = render(h(Input, { placeholder: "ada@example.com" }));
      expect(r.root.getAttribute("placeholder")).toBe("ada@example.com");
    });

    // radix form.tsx FormControl spreads `controlProps` onto Primitive.input,
    // so every native constraint and a11y attribute reaches the element.
    it("passes the native constraint and a11y attributes through", () => {
      const r = render(
        h(Input, { name: "email", required: true, maxLength: 32, "aria-invalid": "true", "aria-label": "Email" }),
      );
      const input = r.root as HTMLInputElement;
      expect(input.name).toBe("email");
      expect(input.required).toBe(true);
      expect(input.maxLength).toBe(32);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-label")).toBe("Email");
    });

    // docs/Input.md: rows sets how many lines of minimum height, and it stays
    // the real textarea attribute so a non-CSS renderer still honours it.
    it("renders TextArea's rows attribute, defaulting to 3", () => {
      expect(render(h(TextArea, null)).root.getAttribute("rows")).toBe("3");
      expect(render(h(TextArea, { rows: 6 })).root.getAttribute("rows")).toBe("6");
    });
  });

  describe("value semantics", () => {
    // docs/Input.md: "value: set as a DOM property, so a controlled field
    // works" - React's controlled-input contract, not a value attribute.
    it("sets a controlled value as a property and leaves the value attribute alone", () => {
      const r = render(h(Input, { value: "hello" }));
      const input = r.root as HTMLInputElement;
      expect(input.value).toBe("hello");
      expect(input.hasAttribute("value")).toBe(false);
    });

    // React's controlled-input contract: the DOM value is whatever the last
    // render said, so an edit the owner does not accept is undone.
    it("restores a controlled value on the next render after the user types over it", () => {
      const tick = observable.box(0);
      const Field = () => h(Input, { value: "fixed", "data-tick": tick.get() });
      const r = render(h(Field, null));
      const input = r.root as HTMLInputElement;
      type(input, "typed");
      runInAction(() => tick.set(1));
      expect(input.value).toBe("fixed");
    });

    // HTML spec: defaultValue reflects the value content attribute, and the
    // dirty value flag keeps a typed value separate from it.
    it("uses defaultValue as the value attribute and keeps it while the user types", () => {
      const r = render(h(Input, { defaultValue: "ada@example.com" }));
      const input = r.root as HTMLInputElement;
      expect(input.value).toBe("ada@example.com");
      expect(input.defaultValue).toBe("ada@example.com");
      type(input, "typed");
      expect(input.value).toBe("typed");
      expect(input.defaultValue).toBe("ada@example.com");
    });

    // HTML spec: a textarea's default value is its child text, not a value
    // attribute, so Input.ts renders defaultValue as the textarea's content.
    it("uses defaultValue as a TextArea's text content", () => {
      const r = render(h(TextArea, { defaultValue: "first\nsecond" }));
      const textarea = r.root as HTMLTextAreaElement;
      expect(textarea.value).toBe("first\nsecond");
      expect(textarea.defaultValue).toBe("first\nsecond");
    });

    // Input.ts withChangeText: "onChangeText is the value-only form of
    // onInput, so both fire."
    it("calls onChangeText with the new value and still calls onInput with the event", () => {
      const onChangeText = vi.fn();
      const onInput = vi.fn();
      const r = render(h(Input, { onChangeText, onInput }));
      type(r.root as HTMLInputElement, "abc");
      expect(onChangeText).toHaveBeenCalledExactlyOnceWith("abc");
      expect(onInput).toHaveBeenCalledTimes(1);
      expect(onInput.mock.calls[0][0].target).toBe(r.root);
    });

    it("calls onChangeText for a TextArea too", () => {
      const onChangeText = vi.fn();
      const r = render(h(TextArea, { onChangeText }));
      type(r.root as HTMLTextAreaElement, "line one\nline two");
      expect(onChangeText).toHaveBeenCalledExactlyOnceWith("line one\nline two");
    });

    // HTML spec: assigning to `value` from script does not fire input events,
    // so a programmatic change never looks like a user edit.
    it("does not call onChangeText when the value is assigned without an input event", () => {
      const onChangeText = vi.fn();
      const r = render(h(Input, { onChangeText }));
      (r.root as HTMLInputElement).value = "silent";
      expect(onChangeText).not.toHaveBeenCalled();
    });
  });

  describe("disabled and readOnly", () => {
    // HTML spec: a disabled control is not focusable, not submittable and does
    // not fire input events. docs/Input.md: "disabled sets the real attribute".
    it("sets the real disabled attribute", () => {
      const r = render(h(Input, { disabled: true }));
      expect((r.root as HTMLInputElement).disabled).toBe(true);
      expect(r.root.hasAttribute("disabled")).toBe(true);
    });

    // HTML spec: a disabled control is barred from constraint validation and
    // is not a submittable element.
    it("keeps a disabled field out of the submitted data even when it is required", () => {
      const r = render(h("form", null, h(Input, { name: "email", required: true, disabled: true, defaultValue: "x" })));
      const form = r.root as HTMLFormElement;
      expect(new FormData(form).has("email")).toBe(false);
      expect(form.checkValidity()).toBe(true);
    });

    // HTML spec: readonly keeps the control focusable, copyable and
    // submittable; only editing is blocked.
    it("keeps a readOnly field focusable and submittable", () => {
      const r = render(h("form", null, h(Input, { name: "email", readOnly: true, defaultValue: "ada@example.com" })));
      const input = r.get<HTMLInputElement>("input");
      expect(input.readOnly).toBe(true);
      expect(input.hasAttribute("readonly")).toBe(true);
      focus(input);
      expect(document.activeElement).toBe(input);
      expect(new FormData(r.root as HTMLFormElement).get("email")).toBe("ada@example.com");
    });

    // HTML spec: readonly bars the control from constraint validation, so an
    // empty required readonly field does not block submission.
    it.skip("does not validate a readOnly field (happy-dom reports valueMissing for a readonly control, which the spec bars from validation)", () => {});
  });

  describe("form integration", () => {
    // HTML spec: form reset restores every control to its default value.
    it("returns to its defaultValue when the owning form is reset", () => {
      const r = render(h("form", null, h(Input, { name: "email", defaultValue: "ada@example.com" })));
      const input = r.get<HTMLInputElement>("input");
      type(input, "typed");
      (r.root as HTMLFormElement).reset();
      expect(input.value).toBe("ada@example.com");
    });

    it("returns a TextArea to its defaultValue when the owning form is reset", () => {
      const r = render(h("form", null, h(TextArea, { name: "bio", defaultValue: "first\nsecond" })));
      const textarea = r.get<HTMLTextAreaElement>("textarea");
      type(textarea, "typed");
      (r.root as HTMLFormElement).reset();
      expect(textarea.value).toBe("first\nsecond");
    });

    // HTML spec: a control with no name is not submittable.
    it("submits under its name, and not at all without one", () => {
      const r = render(
        h("form", null, h(Input, { name: "email", defaultValue: "ada@example.com" }), h(Input, { defaultValue: "ignored" })),
      );
      const data = new FormData(r.root as HTMLFormElement);
      expect(Array.from(data.entries())).toEqual([["email", "ada@example.com"]]);
    });

    // HTML spec: a textarea's API value keeps its line breaks, and they are
    // normalised to CRLF on submission.
    it("submits a TextArea's newlines", () => {
      const r = render(h("form", null, h(TextArea, { name: "bio" })));
      const textarea = r.get<HTMLTextAreaElement>("textarea");
      type(textarea, "first\nsecond");
      expect(String(new FormData(r.root as HTMLFormElement).get("bio"))).toContain("second");
      expect(textarea.value.split("\n")).toHaveLength(2);
    });
  });

  describe("label association and focus", () => {
    // HTML spec: a label whose `for` matches the control's id is that
    // control's label, and its hit area is part of the control's.
    it("is the labelled control of a Label whose htmlFor matches its id", () => {
      const r = render(h("div", null, h(Label, { htmlFor: "email" }, "Email"), h(Input, { id: "email" })));
      const label = r.get<HTMLLabelElement>("label");
      expect(label.control).toBe(r.get("input"));
      expect(r.get<HTMLInputElement>("input").labels?.[0]).toBe(label);
    });

    // HTML spec: a label with no `for` labels the first labelable descendant.
    it("is the labelled control of a Label that wraps it", () => {
      const r = render(h(Label, null, "Email", h(Input, { id: "email" })));
      expect((r.root as HTMLLabelElement).control).toBe(r.get("input"));
    });

    // HTML spec: activating a label runs the control's activation behaviour,
    // which happy-dom implements by dispatching a click at the control.
    it("receives the click that lands on its label", () => {
      const r = render(h("div", null, h(Label, { htmlFor: "email" }, "Email"), h(Input, { id: "email" })));
      const onClick = vi.fn();
      r.get("input").addEventListener("click", onClick);
      click(r.get("label"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it.skip("takes focus when its label is clicked (happy-dom forwards the click but runs no focusing default action)", () => {});

    // HTML spec: the autofocus attribute focuses the control when it is
    // inserted into the document.
    it("takes focus on mount when autoFocus is set", () => {
      const r = render(h(Input, { autoFocus: true }));
      expect(document.activeElement).toBe(r.root);
    });

    it("does not take focus on mount otherwise", () => {
      render(h(Input, null));
      expect(document.activeElement).toBe(document.body);
    });
  });
});
