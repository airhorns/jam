// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction, observable } from "mobx";
import { h } from "@jam/core/jsx";
import { render, click, setupDefaultUI } from "../../testing";
import { useFormReset } from "../../form";
import { Form } from "../../components/Form";
import { Input, TextArea } from "../../components/Input";
import { Checkbox } from "../../components/Checkbox";

beforeEach(() => {
  setupDefaultUI();
});

/** A minimal control that only registers a form-reset callback, like the hidden inputs do. */
function resetProbe(onReset: () => void) {
  return () => h("input", { type: "hidden", name: "probe", ...useFormReset(onReset) });
}

describe("Form conformance", () => {
  describe("element and props", () => {
    // radix form.tsx Form renders `Primitive.form`, so submission, validation
    // and autofill are the browser's.
    it("renders a real form element", () => {
      const r = render(h(Form, null));
      expect(r.root.tagName).toBe("FORM");
    });

    // radix form.tsx spreads `...rootProps` onto Primitive.form ("spreads props
    // it does not consume onto the element it renders").
    it("passes form attributes it does not consume through to the element", () => {
      const r = render(h(Form, { action: "/save", method: "post", noValidate: true, autoComplete: "off" }));
      const form = r.root as HTMLFormElement;
      expect(form.getAttribute("action")).toBe("/save");
      expect(form.getAttribute("method")).toBe("post");
      expect(form.hasAttribute("novalidate")).toBe(true);
      expect(form.getAttribute("autocomplete")).toBe("off");
    });

    // radix form.tsx FormSubmit: `<Primitive.button type="submit" {...submitProps} />`
    it("renders Form.Trigger as a real submit button", () => {
      const r = render(h(Form, null, h(Form.Trigger, null, "Save")));
      const button = r.get("button");
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("submit");
    });

    // radix form.tsx FormSubmit spreads `submitProps` after `type="submit"`, so
    // the caller can downgrade the button to a non-submitting one.
    it("lets a caller override the trigger's type, and then it does not submit", () => {
      const onSubmit = vi.fn();
      const r = render(h(Form, { onSubmit }, h(Form.Trigger, { type: "button" }, "Save")));
      expect(r.get("button").getAttribute("type")).toBe("button");
      click(r.get("button"));
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("submission", () => {
    // radix form.tsx composes the caller's onSubmit with `checkForDefaultPrevented:
    // false`; Form.ts calls preventDefault() first, so the handler always runs
    // on an already-prevented event and the page never reloads.
    it("calls onSubmit with a submit event whose default is already prevented", () => {
      const onSubmit = vi.fn();
      const r = render(h(Form, { onSubmit }));
      const event = new Event("submit", { bubbles: true, cancelable: true });
      r.root.dispatchEvent(event);
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("prevents the default page reload even with no onSubmit handler", () => {
      const r = render(h(Form, { action: "/save" }));
      const event = new Event("submit", { bubbles: true, cancelable: true });
      r.root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    // HTML spec: a button whose type is `submit` and whose form owner is the
    // form submits it when activated.
    it("submits once when the trigger is clicked", () => {
      const onSubmit = vi.fn();
      const r = render(h(Form, { onSubmit }, h(Input, { name: "email" }), h(Form.Trigger, null, "Save")));
      click(r.get("button"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // HTML spec: a disabled button is not activated, so it cannot submit.
    it("does not submit when the trigger is disabled", () => {
      const onSubmit = vi.fn();
      const r = render(h(Form, { onSubmit }, h(Form.Trigger, { disabled: true }, "Save")));
      expect(r.get("button").hasAttribute("disabled")).toBe(true);
      click(r.get("button"));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    // HTML spec form owner: a submit button outside the form is associated by
    // its `form` attribute, so it submits that form.
    it("submits from a trigger outside the form that names it with the form attribute", () => {
      const onSubmit = vi.fn();
      const r = render(h("div", null, h(Form, { id: "settings", onSubmit }), h(Form.Trigger, { form: "settings" }, "Save")));
      click(r.get("button"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // docs/Form.md: "Read the submitted values from new FormData(event.target)".
    it("targets the form itself, so FormData(event.target) sees every named field", () => {
      let data: FormData | null = null;
      const r = render(
        h(
          Form,
          { onSubmit: (event: Event) => (data = new FormData(event.target as HTMLFormElement)) },
          h(Input, { name: "email", defaultValue: "ada@example.com" }),
          h(TextArea, { name: "bio", defaultValue: "Analyst" }),
          h(Form.Trigger, null, "Save"),
        ),
      );
      click(r.get("button"));
      expect(data!.get("email")).toBe("ada@example.com");
      expect(data!.get("bio")).toBe("Analyst");
    });

    // HTML spec: only named, enabled controls are submittable.
    it("leaves disabled and unnamed fields out of the submitted data", () => {
      let data: FormData | null = null;
      const r = render(
        h(
          Form,
          { onSubmit: (event: Event) => (data = new FormData(event.target as HTMLFormElement)) },
          h(Input, { name: "kept", defaultValue: "1" }),
          h(Input, { name: "off", defaultValue: "2", disabled: true }),
          h(Input, { defaultValue: "3" }),
          h(Form.Trigger, null, "Save"),
        ),
      );
      click(r.get("button"));
      expect(Array.from(data!.keys())).toEqual(["kept"]);
    });

    // docs/Form.md: "Form.Trigger is the submit button, so Enter in a text
    // field submits natively".
    it.skip("submits when Enter is pressed in a text field (happy-dom does not implement implicit submission)", () => {});
  });

  describe("constraint validation", () => {
    // HTML spec: an interactive form submission runs the constraint validation
    // steps first; an invalid control fires `invalid` and blocks submission.
    it("blocks submission and fires invalid at the control when a required field is empty", () => {
      const onSubmit = vi.fn();
      const onInvalid = vi.fn();
      const r = render(h(Form, { onSubmit }, h(Input, { name: "email", required: true }), h(Form.Trigger, null, "Save")));
      const input = r.get<HTMLInputElement>("input");
      input.addEventListener("invalid", onInvalid);
      expect(input.validity.valueMissing).toBe(true);
      click(r.get("button"));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onInvalid).toHaveBeenCalledTimes(1);
    });

    it("submits once the invalid field has been filled in", () => {
      const onSubmit = vi.fn();
      const r = render(h(Form, { onSubmit }, h(Input, { name: "email", required: true }), h(Form.Trigger, null, "Save")));
      click(r.get("button"));
      r.get<HTMLInputElement>("input").value = "ada@example.com";
      click(r.get("button"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // HTML spec: `novalidate` on the form skips the constraint validation steps.
    it("submits an invalid form when noValidate is set", () => {
      const onSubmit = vi.fn();
      const r = render(
        h(Form, { onSubmit, noValidate: true }, h(Input, { name: "email", required: true }), h(Form.Trigger, null, "Save")),
      );
      click(r.get("button"));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // HTML spec: a `type="email"` control with an unparseable value reports
    // typeMismatch, which is what the styled aria-invalid hooks key off.
    it("reports the native validity state of a typed field", () => {
      const r = render(h(Form, null, h(Input, { name: "email", type: "email" })));
      const input = r.get<HTMLInputElement>("input");
      input.value = "not-an-email";
      expect(input.validity.typeMismatch).toBe(true);
      expect((r.root as HTMLFormElement).checkValidity()).toBe(false);
    });

    // radix form.tsx onInvalid: focuses the first invalid control and
    // preventDefaults the browser's own validation UI, because Radix renders
    // its own Form.Message for it.
    it.skip("focuses the first invalid control and suppresses the native validation bubble (the library has no Form.Message, so it deliberately leaves the browser's UI in place)", () => {});
  });

  describe("reset", () => {
    // radix form.tsx composes the caller's onReset onto Primitive.form.
    it("passes onReset through to the form element", () => {
      const onReset = vi.fn();
      const r = render(h(Form, { onReset }));
      (r.root as HTMLFormElement).reset();
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    // HTML spec: reset restores each control to its default value; an Input is
    // a real <input>, so nothing in the library is involved.
    it("restores a text field to its defaultValue natively", () => {
      const r = render(h(Form, null, h(Input, { name: "email", defaultValue: "ada@example.com" })));
      const input = r.get<HTMLInputElement>("input");
      input.value = "typed";
      (r.root as HTMLFormElement).reset();
      expect(input.value).toBe("ada@example.com");
    });

    // A textarea's default value is its child text, so reset restores that.
    it("restores a TextArea to its defaultValue natively", () => {
      const r = render(h(Form, null, h(TextArea, { name: "bio", defaultValue: "Analyst" })));
      const textarea = r.get<HTMLTextAreaElement>("textarea");
      textarea.value = "typed";
      (r.root as HTMLFormElement).reset();
      expect(textarea.value).toBe("Analyst");
    });

    // radix checkbox.tsx registers a `reset` listener on control.form to restore
    // its initial state; form.ts does the same job for every mirrored control
    // from one document-level listener.
    it("restores a button-based control through useFormReset", () => {
      const r = render(h(Form, null, h(Checkbox, { name: "terms", defaultChecked: false })));
      click(r.get("button"));
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
      (r.root as HTMLFormElement).reset();
      expect(r.get("button").getAttribute("aria-checked")).toBe("false");
    });

    // form.ts onDocumentReset only calls controls the reset target contains, so
    // a sibling form's reset is none of its business.
    it("ignores a reset of a different form", () => {
      const r = render(
        h("div", null, h(Form, null, h(Checkbox, { name: "terms", defaultChecked: false })), h("form", { id: "other" })),
      );
      click(r.get("button"));
      (r.get("#other") as HTMLFormElement).reset();
      expect(r.get("button").getAttribute("aria-checked")).toBe("true");
    });

    // form.ts listens on document in the capture phase, so it has already run
    // by the time the form's own handler could stop the event.
    it("still resets its controls when the form's own reset handler stops propagation", () => {
      const r = render(
        h(Form, { onReset: (event: Event) => event.stopPropagation() }, h(Checkbox, { name: "terms", defaultChecked: false })),
      );
      click(r.get("button"));
      (r.root as HTMLFormElement).reset();
      expect(r.get("button").getAttribute("aria-checked")).toBe("false");
    });

    // form.ts: "The latest onReset is always the one invoked."
    it("invokes the newest onReset callback a control rendered, not the first", () => {
      const first = vi.fn();
      const second = vi.fn();
      const callback = observable.box(first);
      const Probe = () => resetProbe(callback.get())();
      const r = render(h(Form, null, h(Probe, null)));
      runInAction(() => callback.set(second));
      (r.root as HTMLFormElement).reset();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    // form.ts registers useCleanup(() => controls.delete(id)), so a control
    // that left the tree is not reset alongside the ones that stayed.
    it("stops resetting a control once it unmounts", () => {
      const staying = vi.fn();
      const leaving = vi.fn();
      const show = observable.box(true);
      const Staying = resetProbe(staying);
      const Leaving = resetProbe(leaving);
      const Fields = () => h(Form, null, h(Staying, null), show.get() ? h(Leaving, null) : null);
      const r = render(h(Fields, null));
      runInAction(() => show.set(false));
      (r.root as HTMLFormElement).reset();
      expect(staying).toHaveBeenCalledTimes(1);
      expect(leaving).not.toHaveBeenCalled();
    });
  });

  describe("fields the library does not provide", () => {
    // radix form.tsx FormField/FormLabel/FormControl derive an id and a name
    // from context so a label, control and message wire themselves together.
    it.skip("wires a label, control and message together through Form.Field context (the library has no Form.Field; docs/Form.md pairs a Label htmlFor with the field's id by hand)", () => {});

    // radix form.tsx FormMessage renders for a matching ValidityState key and
    // is added to the control's aria-describedby.
    it.skip("renders a Form.Message for a matching validity key and describes the control with it (the library has no Form.Message)", () => {});

    // radix form.tsx FormMessage supports async custom matchers plus
    // `onClearServerErrors` for server-side validity.
    it.skip("supports custom and server-side validation matchers (the library has no validation layer; use the native constraint attributes)", () => {});
  });
});
