import { styled } from "../styled";

/**
 * Spacer: fills available space in a flex container (flex: 1 by default),
 * or renders a fixed-size gap if `size` is provided.
 */
export const Spacer = styled("div", {
  name: "Spacer",
  defaultProps: {
    flex: 1,
    alignSelf: "stretch",
  },
  variants: {
    size: {
      "1": { flex: 0, width: 5, height: 5 },
      "2": { flex: 0, width: 10, height: 10 },
      "3": { flex: 0, width: 15, height: 15 },
      "4": { flex: 0, width: 20, height: 20 },
      "5": { flex: 0, width: 25, height: 25 },
      "6": { flex: 0, width: 30, height: 30 },
      "7": { flex: 0, width: 35, height: 35 },
      "8": { flex: 0, width: 40, height: 40 },
    },
  },
});
