import { styled } from "../styled";

/**
 * Image: styled img element.
 */
export const Image = styled("img", {
  name: "Image",
  defaultProps: {
    display: "block",
    maxWidth: "100%",
  },
  variants: {
    objectFit: {
      cover: {},
      contain: {},
      fill: {},
      none: {},
      "scale-down": {},
    },
  },
});
