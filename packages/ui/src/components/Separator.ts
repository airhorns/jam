import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { Stack } from "./Stacks";

export type SeparatorProps = StyledProps & {
  vertical?: boolean;
  unstyled?: boolean;
};

/**
 * Separator: a one-pixel divider drawn with a border so it lands on the
 * device pixel grid. Horizontal by default; `vertical` turns it into a rule
 * that stretches to the height of its row.
 */
export const Separator = styled<SeparatorProps>(Stack, {
  name: "Separator",
  variants: {
    unstyled: {
      false: {
        borderColor: "$borderColor",
        borderStyle: "solid",
        borderWidth: 0,
        borderBottomWidth: 1,
        flexShrink: 0,
        flexGrow: 1,
        alignSelf: "stretch",
        height: 0,
        maxHeight: 0,
        margin: 0,
      },
    },

    vertical: {
      true: {
        height: "initial",
        maxHeight: "initial",
        width: 0,
        maxWidth: 0,
        borderBottomWidth: 0,
        borderRightWidth: 1,
        alignSelf: "stretch",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});
