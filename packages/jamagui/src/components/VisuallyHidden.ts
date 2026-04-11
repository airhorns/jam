import { styled } from "../styled";

/**
 * VisuallyHidden: renders content that is visually hidden but accessible to screen readers.
 */
export const VisuallyHidden = styled("span", {
  name: "VisuallyHidden",
  defaultProps: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
  },
});
