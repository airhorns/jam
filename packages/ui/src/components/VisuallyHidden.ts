import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { Text } from "./Text";

export type VisuallyHiddenProps = StyledProps & {
  /** Keep the element's layout size, hiding only its pixels. */
  preserveDimensions?: boolean;
  /** Show the content after all — for a "skip to content" link on focus. */
  visible?: boolean;
};

/**
 * VisuallyHidden: content for screen readers only. It stays in the
 * accessibility tree and in the tab order, unlike `display: none`.
 */
export const VisuallyHidden = styled<VisuallyHiddenProps>(Text, {
  name: "VisuallyHidden",
  defaultProps: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    borderWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    zIndex: -10000,
    opacity: 0.00000001,
    pointerEvents: "none",
  },
  variants: {
    preserveDimensions: {
      true: {
        position: "relative",
        width: "auto",
        height: "auto",
      },
    },

    visible: {
      true: {
        position: "relative",
        width: "auto",
        height: "auto",
        margin: 0,
        zIndex: 1,
        overflow: "visible",
        whiteSpace: "inherit",
        opacity: 1,
        pointerEvents: "auto",
      },
    },
  },
});
