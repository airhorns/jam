import { styled } from "../styled";

/**
 * Form: styled form element.
 */
export const Form = styled("form", {
  name: "Form",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
}) as ReturnType<typeof styled> & { Trigger: ReturnType<typeof styled> };

/**
 * Form.Trigger: submit button for the form.
 */
(Form as any).Trigger = styled("button", {
  name: "FormTrigger",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: "$radius.3",
    backgroundColor: "$background",
    color: "$color",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: 14,
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});
