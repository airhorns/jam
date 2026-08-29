import { styled } from "../styled";
import type { StyledProps, VariantFunction } from "../styled";
import { getButtonSized, getFontSized } from "../variants";
import { SizableText } from "./Text";

export type LabelProps = StyledProps & {
  size?: string | number;
  /** id of the control this label names; sets the `for` attribute. */
  htmlFor?: string;
  disabled?: boolean;
  unstyled?: boolean;
};

// The line box is as tall as a control of the same size, so a label sitting
// beside an Input lines up with it.
const labelSized: VariantFunction = (value, extras) => {
  const height = (getButtonSized(value, extras) as { height?: number } | null)?.height;
  return { ...getFontSized(value, extras), lineHeight: height };
};

/**
 * Label: text that names a form control. Pass `htmlFor` with the control's
 * `id` and clicking the label focuses the control natively.
 */
export const Label = styled<LabelProps>(SizableText, {
  name: "Label",
  tag: "label",
  variants: {
    unstyled: {
      false: {
        size: "$true",
        color: "$color",
        backgroundColor: "transparent",
        display: "flex",
        alignItems: "center",
        userSelect: "none",
        cursor: "default",
        pressStyle: {
          color: "$colorPress",
        },
      },
    },

    size: {
      "...size": labelSized,
      ":number": labelSized,
    },

    disabled: {
      true: {
        opacity: 0.5,
        cursor: "not-allowed",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});
