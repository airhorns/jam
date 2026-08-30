import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { getSpacerSized } from "../variants";

export type SpacerProps = StyledProps & {
  size?: string | number;
  direction?: "horizontal" | "vertical" | "both";
  /** Grow to fill the remaining room; the value is the `flex-grow` factor. */
  flex?: number;
};

/**
 * Spacer: a fixed gap sized from the space scale, or a flexible one that eats
 * the remaining room (`flex`). `direction` collapses the unused axis so a
 * spacer in a row only takes width.
 */
export const Spacer = styled<SpacerProps>("span", {
  name: "Spacer",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    pointerEvents: "none",
  },
  variants: {
    size: {
      "...space": getSpacerSized,
      ":number": getSpacerSized,
    },

    direction: {
      horizontal: { height: 0, minHeight: 0 },
      vertical: { width: 0, minWidth: 0 },
      both: {},
    },

    flex: {
      true: { flexGrow: 1 },
      ":number": (value: number) => ({ flexGrow: value, flexShrink: value === 0 ? 0 : 1, flexBasis: 0 }),
    },
  },
  defaultVariants: {
    size: "$true",
  },
});
