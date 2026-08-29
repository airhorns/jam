import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import { injectRule } from "../css";
import { styled } from "../styled";
import type { StyledProps, VariantFunction } from "../styled";
import { tokenValue } from "../variants";

const SPIN = "jamagui-spin";

// The keyframes and the animation shorthand can't come from style props, so
// they are one injected rule; the doubled class beats the atomic classes.
function injectSpinnerRules(): void {
  injectRule(`@keyframes ${SPIN}`, `@keyframes ${SPIN} { to { transform: rotate(360deg) } }`);
  injectRule("jamagui-spinner", `.is_Spinner.is_Spinner { animation: ${SPIN} 0.85s linear infinite }`);
}

const ringSized = (diameter: number) => ({
  width: diameter,
  height: diameter,
  borderWidth: Math.max(2, Math.round(diameter / 12)),
});

const spinnerSized: VariantFunction = (value, { tokens }) => {
  const diameter = tokenValue(tokens, "size", value);
  return diameter === undefined ? null : ringSized(diameter);
};

export type SpinnerProps = StyledProps & {
  size?: "small" | "large" | string | number;
  /** Colour of the leading arc; defaults to the theme's `$color`. */
  color?: string;
};

export const SpinnerFrame = styled<SpinnerProps>("div", {
  name: "Spinner",
  defaultProps: {
    display: "inline-block",
    boxSizing: "border-box",
    flexShrink: 0,
    borderStyle: "solid",
    borderRadius: 100_000,
    // All four longhands: a `border-color` shorthand beside `border-top-color`
    // would win or lose by stylesheet order rather than by specificity.
    borderTopColor: "$color",
    borderRightColor: "$borderColor",
    borderBottomColor: "$borderColor",
    borderLeftColor: "$borderColor",
    role: "progressbar",
    "aria-label": "Loading",
    "aria-busy": "true",
  },
  variants: {
    size: {
      small: ringSized(20),
      large: ringSized(36),
      "...size": spinnerSized,
      ":number": spinnerSized,
    },

    color: {
      ":string": (value: string) => ({ borderTopColor: value }),
    },
  },
  defaultVariants: {
    size: "small",
  },
});

/**
 * Spinner: an indeterminate loading ring. `size` takes `"small"`, `"large"` or
 * a size token; `color` tints the leading arc.
 */
function SpinnerComponent(props: SpinnerProps): VNode {
  injectSpinnerRules();
  return h(SpinnerFrame, props as Record<string, unknown>);
}
SpinnerComponent.displayName = "Spinner";

export const Spinner = Object.assign(SpinnerComponent, {
  Frame: SpinnerFrame,
  staticConfig: SpinnerFrame.staticConfig,
});
