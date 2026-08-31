import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps } from "../styled";
import { getButtonSized, getFontSized, themeableVariants, tokenValue } from "../variants";
import { SizableText, wrapChildrenInText } from "./Text";
import type { TextParentProps } from "./Text";

export type ButtonVariant = "outlined" | "ghost";

/**
 * Shared between Button.Frame, Button.Text and Button.Icon so size and text
 * styling set on the button flow to its parts.
 */
export const ButtonContext = createStyledContext<{
  size?: string | number;
  variant?: ButtonVariant;
  color?: unknown;
  fontFamily?: unknown;
  fontSize?: unknown;
  fontWeight?: unknown;
  fontStyle?: unknown;
  letterSpacing?: unknown;
  textAlign?: unknown;
  ellipsis?: boolean;
}>({
  size: undefined,
  variant: undefined,
  color: undefined,
  fontFamily: undefined,
  fontSize: undefined,
  fontWeight: undefined,
  fontStyle: undefined,
  letterSpacing: undefined,
  textAlign: undefined,
  ellipsis: undefined,
});

export const ButtonFrame = styled("button", {
  name: "Button",
  context: ButtonContext,
  defaultProps: {
    type: "button",
  },
  variants: {
    unstyled: {
      true: {
        outlineStyle: "none",
        borderWidth: 0,
        backgroundColor: "transparent",
      },
      false: {
        size: "$true",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "nowrap",
        flexDirection: "row",
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "transparent",
        color: "$color",
        fontFamily: "$body",
        cursor: "pointer",
        userSelect: "none",
        hoverStyle: {
          backgroundColor: "$backgroundHover",
          borderColor: "$borderColorHover",
        },
        pressStyle: {
          backgroundColor: "$backgroundPress",
          borderColor: "$borderColorHover",
        },
        focusVisibleStyle: {
          outlineColor: "$outlineColor",
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineOffset: 2,
        },
        disabledStyle: {
          opacity: 0.5,
          cursor: "not-allowed",
        },
      },
    },

    variant: {
      outlined: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "$borderColor",
        hoverStyle: {
          backgroundColor: "transparent",
          borderColor: "$borderColorHover",
        },
        pressStyle: {
          backgroundColor: "transparent",
          borderColor: "$borderColorPress",
        },
      },
      ghost: {
        backgroundColor: "transparent",
        borderColor: "transparent",
        hoverStyle: {
          backgroundColor: "$backgroundHover",
          borderColor: "transparent",
        },
        pressStyle: {
          backgroundColor: "$backgroundPress",
          borderColor: "transparent",
        },
      },
    },

    size: {
      "...size": (value, extras) => ({
        ...getButtonSized(value, extras),
        gap: tokenValue(extras.tokens, "space", value),
      }),
      ":number": (value: number, extras) => ({
        ...getButtonSized(value, extras),
        gap: value * 0.4,
      }),
    },

    elevation: themeableVariants.elevation,
    circular: themeableVariants.circular,
    chromeless: themeableVariants.chromeless,

    disabled: {
      true: {
        pointerEvents: "none",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const ButtonText = styled(SizableText, {
  name: "ButtonText",
  context: ButtonContext,
  variants: {
    unstyled: {
      false: {
        userSelect: "none",
        flexGrow: 0,
        flexShrink: 1,
        ellipsis: true,
        color: "$color",
        cursor: "pointer",
      },
    },
  },
});

export const ButtonIcon = styled("span", {
  name: "ButtonIcon",
  context: ButtonContext,
  defaultProps: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    lineHeight: 1,
  },
  variants: {
    size: (value, extras) => {
      const fontSize = typeof value === "number" ? value * 0.5 : getFontSized(value, extras)?.fontSize;
      return fontSize === undefined ? null : { fontSize, width: fontSize, height: fontSize };
    },
  },
});

export type ButtonProps = StyledProps &
  TextParentProps & {
    size?: string | number;
    variant?: ButtonVariant;
    circular?: boolean;
    chromeless?: boolean | "all";
    elevation?: string | number;
    disabled?: boolean;
    unstyled?: boolean;
    icon?: VChild;
    iconAfter?: VChild;
    type?: "button" | "submit" | "reset";
    onClick?: (event: MouseEvent) => void;
  };

/**
 * Button: a themed, sized button. String children are wrapped in Button.Text
 * so the button's size and text props apply; `icon`/`iconAfter` render in
 * Button.Icon before and after the label.
 */
function ButtonComponent(props: ButtonProps): VNode {
  const { children, icon, iconAfter, noTextWrap, textProps, ...frameProps } = props;
  const size = props.size ?? (props.unstyled ? undefined : "$true");
  if (props.circular && props.size == null) frameProps.size = size;

  const label = wrapChildrenInText(ButtonText, children, { noTextWrap, textProps, ...props }, {});
  const parts: VChild[] = [];
  if (icon != null) parts.push(h(ButtonIcon, {}, icon));
  parts.push(...label);
  if (iconAfter != null) parts.push(h(ButtonIcon, {}, iconAfter));

  return h(ButtonFrame, frameProps as Record<string, unknown>, ...parts);
}
ButtonComponent.displayName = "Button";

export const Button = Object.assign(ButtonComponent, {
  Frame: ButtonFrame,
  Text: ButtonText,
  Icon: ButtonIcon,
  /** Provide size/variant/text defaults to every Button beneath. */
  Apply: ButtonContext.Provider,
});
