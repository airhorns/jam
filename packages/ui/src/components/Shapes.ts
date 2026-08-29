import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { ThemeableStack } from "./Stacks";
import { getSquareSized } from "../variants";

export type ShapeProps = StyledProps & {
  size?: string | number;
  circular?: boolean;
  bordered?: boolean | number;
  elevation?: string | number;
  elevate?: boolean;
};

/**
 * Square: a centred box whose `size` sets both dimensions. Accepts a size
 * token (`$4`, `4`) or a literal number of pixels.
 */
export const Square = styled<ShapeProps>(ThemeableStack, {
  name: "Square",
  defaultProps: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
  },
  variants: {
    size: {
      "...size": getSquareSized,
      ":number": getSquareSized,
    },
  },
});

/** Circle: a Square with a fully rounded border radius. */
export const Circle = styled<ShapeProps>(Square, {
  name: "Circle",
  defaultProps: {
    borderRadius: 100_000,
  },
});
