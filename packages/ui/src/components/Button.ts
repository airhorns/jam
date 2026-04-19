import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { styled } from "../styled";
import type { AllStyleProps } from "../types";

/**
 * Button: interactive button with size variants and theme-aware styles.
 */
export const Button = styled("button", {
  name: "Button",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    cursor: "pointer",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    backgroundColor: "$background",
    color: "$color",
    borderRadius: "$radius.3",
    fontWeight: "600",
    userSelect: "none",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
    pressStyle: {
      backgroundColor: "$backgroundPress",
    },
    focusVisibleStyle: {
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: "$outlineColor",
      outlineOffset: 2,
    },
    disabledStyle: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
  variants: {
    size: {
      "1": { paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, height: 28 },
      "2": { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, height: 32 },
      "3": { paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, height: 36 },
      "4": { paddingHorizontal: 20, paddingVertical: 10, fontSize: 16, height: 44 },
      "5": { paddingHorizontal: 24, paddingVertical: 12, fontSize: 18, height: 52 },
    },
    variant: {
      outlined: {
        backgroundColor: "transparent",
        borderWidth: 1,
        hoverStyle: { backgroundColor: "$backgroundHover" },
      },
      ghost: {
        backgroundColor: "transparent",
        borderWidth: 0,
        hoverStyle: { backgroundColor: "$backgroundHover" },
      },
    },
  },
  defaultVariants: {
    size: "3",
  },
});

/**
 * Button.Text: styled text inside a button.
 */
(Button as any).Text = styled("span", {
  name: "ButtonText",
  defaultProps: {
    color: "$color",
  },
});

/**
 * Button.Icon: wrapper for icon content in a button.
 */
(Button as any).Icon = styled("span", {
  name: "ButtonIcon",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});
