import { styled } from "../styled";

/**
 * Square: fixed aspect-ratio square. Set `size` to control both width and height.
 */
export const Square = styled("div", {
  name: "Square",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variants: {
    size: {
      "1": { width: 20, height: 20 },
      "2": { width: 30, height: 30 },
      "3": { width: 40, height: 40 },
      "4": { width: 50, height: 50 },
      "5": { width: 60, height: 60 },
      "6": { width: 80, height: 80 },
      "7": { width: 100, height: 100 },
      "8": { width: 120, height: 120 },
    },
  },
});

/**
 * Circle: a square with borderRadius making it circular.
 */
export const Circle = styled("div", {
  name: "Circle",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100000,
  },
  variants: {
    size: {
      "1": { width: 20, height: 20 },
      "2": { width: 30, height: 30 },
      "3": { width: 40, height: 40 },
      "4": { width: 50, height: 50 },
      "5": { width: 60, height: 60 },
      "6": { width: 80, height: 80 },
      "7": { width: 100, height: 100 },
      "8": { width: 120, height: 120 },
    },
  },
});
