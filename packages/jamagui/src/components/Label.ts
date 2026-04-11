import { styled } from "../styled";

/**
 * Label: form field label.
 */
export const Label = styled("label", {
  name: "Label",
  defaultProps: {
    color: "$color",
    fontSize: 14,
    fontWeight: "500",
    cursor: "default",
    userSelect: "none",
  },
  variants: {
    size: {
      "1": { fontSize: 11 },
      "2": { fontSize: 12 },
      "3": { fontSize: 14 },
      "4": { fontSize: 16 },
      "5": { fontSize: 18 },
    },
  },
  defaultVariants: {
    size: "3",
  },
});
