import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { Stack } from "./Stacks";

export type ScrollViewProps = StyledProps & {
  horizontal?: boolean;
  showsScrollIndicator?: boolean;
  fullscreen?: boolean;
  unstyled?: boolean;
};

/**
 * ScrollView: a scrolling viewport. Vertical by default; `horizontal` scrolls
 * along the other axis and lays children out in a row. Unlike other views it
 * shrinks to fit its container, which is what lets its content scroll.
 */
export const ScrollView = styled<ScrollViewProps>(Stack, {
  name: "ScrollView",
  variants: {
    unstyled: {
      false: {
        flexDirection: "column",
        flexShrink: 1,
        overflowX: "hidden",
        overflowY: "auto",
      },
    },

    horizontal: {
      true: {
        flexDirection: "row",
        overflowX: "auto",
        overflowY: "hidden",
      },
    },

    /** `false` hides the scrollbar without disabling scrolling. */
    showsScrollIndicator: {
      false: { scrollbarWidth: "none" },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});
