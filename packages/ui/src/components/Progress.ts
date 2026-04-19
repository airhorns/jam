import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Progress: progress bar indicator.
 *
 * Usage:
 *   <Progress value={60} max={100}>
 *     <Progress.Indicator />
 *   </Progress>
 */
export function Progress(props: {
  value?: number;
  max?: number;
  size?: string;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { value = 0, max = 100, children, ...rest } = props;
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return ProgressFrame({
    ...rest,
    role: "progressbar",
    "aria-valuemin": "0",
    "aria-valuemax": String(max),
    "aria-valuenow": String(value),
    "data-value": String(value),
    "data-max": String(max),
    children,
  });
}
Progress.displayName = "Progress";

const ProgressFrame = styled("div", {
  name: "ProgressFrame",
  defaultProps: {
    display: "flex",
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: 8,
    borderRadius: 100000,
    backgroundColor: "$borderColor",
  },
  variants: {
    size: {
      "1": { height: 4 },
      "2": { height: 6 },
      "3": { height: 8 },
      "4": { height: 12 },
      "5": { height: 16 },
    },
  },
  defaultVariants: {
    size: "3",
  },
});

Progress.Indicator = styled("div", {
  name: "ProgressIndicator",
  defaultProps: {
    height: "100%",
    backgroundColor: "$color",
    borderRadius: 100000,
    transition: "width 0.3s ease",
  },
});
