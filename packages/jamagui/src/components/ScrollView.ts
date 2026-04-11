import { styled } from "../styled";

/**
 * ScrollView: a scrollable container.
 */
export const ScrollView = styled("div", {
  name: "ScrollView",
  defaultProps: {
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  },
  variants: {
    horizontal: {
      true: {
        flexDirection: "row",
        overflowX: "auto",
        overflowY: "hidden",
      },
    },
  },
});
