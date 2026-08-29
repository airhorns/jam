import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { Stack } from "./Stacks";

export type FormProps = StyledProps & {
  /** Called with the submit event; the default page reload is already prevented. */
  onSubmit?: (event: Event) => void;
};

export const FormFrame = styled<FormProps>(Stack, {
  name: "Form",
  tag: "form",
  defaultProps: {
    gap: "$4",
  },
});

/**
 * Form.Trigger: a submit Button. Use `asChild` to submit from any button-like
 * child; it must live inside the Form so the browser submits natively.
 */
function FormTrigger(props: ButtonProps): VNode {
  const { className, ...rest } = props;
  return h(Button, {
    type: "submit",
    ...rest,
    className: className ? `is_FormTrigger ${className}` : "is_FormTrigger",
  });
}
FormTrigger.displayName = "FormTrigger";

/**
 * Form: a `form` whose `onSubmit` runs instead of a page reload. Read the
 * submitted values from `new FormData(event.target)`.
 */
function FormComponent(props: FormProps): VNode {
  const { onSubmit, ...rest } = props;
  return h(FormFrame, {
    ...(rest as Record<string, unknown>),
    onSubmit: (event: Event) => {
      event.preventDefault();
      onSubmit?.(event);
    },
  });
}
FormComponent.displayName = "Form";

export const Form = Object.assign(FormComponent, {
  Trigger: FormTrigger,
  Frame: FormFrame,
  staticConfig: FormFrame.staticConfig,
});
