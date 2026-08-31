import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledComponent, StyledProps, VariantFunction } from "../styled";
import { getButtonSized, getFontSized, steppedSpace } from "../variants";

const inputDefaults = {
  size: "$true",
  fontFamily: "$body",
  color: "$color",
  backgroundColor: "$background",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "$borderColor",
  outlineStyle: "none",
  display: "flex",
  // Keeps a flex child from overflowing its container.
  minWidth: 0,
  hoverStyle: {
    borderColor: "$borderColorHover",
  },
  focusStyle: {
    borderColor: "$borderColorFocus",
    outlineColor: "$outlineColor",
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineOffset: -1,
  },
  placeholderStyle: {
    color: "$placeholderColor",
  },
  disabledStyle: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};

const unstyledReset = {
  outlineStyle: "none",
  borderWidth: 0,
  backgroundColor: "transparent",
};

/** Height, radius and padding from a size token; text from the font in effect. */
export const inputSizeVariant: VariantFunction = (value = "$true", extras) => ({
  ...getFontSized(value, extras),
  ...getButtonSized(value, extras),
  paddingHorizontal: steppedSpace(extras.tokens, value, -1),
});

/** Same, plus vertical padding and a height of `rows` lines. */
export const textAreaSizeVariant: VariantFunction = (value = "$true", extras) => {
  const font = getFontSized(value, extras) as { lineHeight?: number };
  const rows = Number(extras.props.rows) || 3;
  return {
    ...getButtonSized(value, extras),
    ...font,
    height: "auto",
    minHeight: font.lineHeight ? rows * font.lineHeight : undefined,
    paddingHorizontal: steppedSpace(extras.tokens, value, -1),
    paddingVertical: steppedSpace(extras.tokens, value, -2),
  };
};

export type InputProps = StyledProps & {
  size?: string | number;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  unstyled?: boolean;
  type?: string;
  onInput?: (event: Event) => void;
  /** Called with the new text on every edit. */
  onChangeText?: (text: string) => void;
};

export const InputFrame = styled<InputProps>("input", {
  name: "Input",
  variants: {
    unstyled: {
      true: unstyledReset,
      false: inputDefaults,
    },

    size: {
      "...size": inputSizeVariant,
      ":number": inputSizeVariant,
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const TextAreaFrame = styled<InputProps & { rows?: number }>(InputFrame, {
  name: "TextArea",
  tag: "textarea",
  defaultProps: {
    rows: 3,
    // Firefox needs this to keep newlines in the value.
    whiteSpace: "pre-wrap",
  },
  variants: {
    unstyled: {
      false: {
        height: "auto",
      },
    },

    size: {
      "...size": textAreaSizeVariant,
      ":number": textAreaSizeVariant,
    },
  },
});

// `onChangeText` is the value-only form of `onInput`, so both fire.
function withChangeText(Frame: StyledComponent<any>, props: InputProps): VNode {
  const { onChangeText, onInput, ...rest } = props;
  if (!onChangeText) return h(Frame, props as Record<string, unknown>);
  return h(Frame, {
    ...(rest as Record<string, unknown>),
    onInput: (event: Event) => {
      onInput?.(event);
      onChangeText((event.target as HTMLInputElement).value);
    },
  });
}

/**
 * Input: a single-line text field. `size` sets its height, radius, padding and
 * font size together; `onChangeText` receives the value directly.
 */
function InputComponent(props: InputProps): VNode {
  return withChangeText(InputFrame, props);
}
InputComponent.displayName = "Input";

/** TextArea: a multi-line Input. `rows` sets the minimum height. */
function TextAreaComponent(props: InputProps & { rows?: number }): VNode {
  return withChangeText(TextAreaFrame, props);
}
TextAreaComponent.displayName = "TextArea";

export const Input = Object.assign(InputComponent, {
  Frame: InputFrame,
  staticConfig: InputFrame.staticConfig,
});

export const TextArea = Object.assign(TextAreaComponent, {
  Frame: TextAreaFrame,
  staticConfig: TextAreaFrame.staticConfig,
});
