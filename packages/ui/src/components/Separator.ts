import { styled } from "../styled";

/**
 * Separator: a visual divider line.
 * Horizontal by default (1px height, full width).
 * Pass vertical={true} for a vertical separator.
 */
export const Separator = styled("div", {
  name: "Separator",
  defaultProps: {
    borderColor: "$borderColor",
    borderBottomWidth: 1,
    borderStyle: "solid",
    alignSelf: "stretch",
    flexShrink: 0,
    width: "100%",
    height: 0,
  },
  variants: {
    vertical: {
      true: {
        width: 0,
        height: "auto",
        borderBottomWidth: 0,
        borderRightWidth: 1,
        alignSelf: "stretch",
      },
    },
  },
});
