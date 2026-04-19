import { styled } from "../styled";

/**
 * Input: single-line text input with theme-aware styling.
 */
export const Input = styled("input", {
  name: "Input",
  defaultProps: {
    display: "flex",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    backgroundColor: "$background",
    color: "$color",
    borderRadius: "$radius.3",
    fontFamily: "inherit",
    width: "100%",
    focusStyle: {
      borderColor: "$borderColorFocus",
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: "$outlineColor",
      outlineOffset: -1,
    },
    disabledStyle: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
  variants: {
    size: {
      "1": { paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, height: 28 },
      "2": { paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, height: 32 },
      "3": { paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, height: 36 },
      "4": { paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, height: 44 },
    },
  },
  defaultVariants: {
    size: "3",
  },
});

/**
 * TextArea: multi-line text input.
 */
export const TextArea = styled("textarea", {
  name: "TextArea",
  defaultProps: {
    display: "flex",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    backgroundColor: "$background",
    color: "$color",
    borderRadius: "$radius.3",
    fontFamily: "inherit",
    width: "100%",
    minHeight: 80,
    focusStyle: {
      borderColor: "$borderColorFocus",
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: "$outlineColor",
      outlineOffset: -1,
    },
    disabledStyle: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
  variants: {
    size: {
      "1": { padding: 6, fontSize: 12 },
      "2": { padding: 8, fontSize: 13 },
      "3": { padding: 12, fontSize: 14 },
      "4": { padding: 16, fontSize: 16 },
    },
  },
  defaultVariants: {
    size: "3",
  },
});
