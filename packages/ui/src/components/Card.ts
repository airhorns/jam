import { createStyledContext, styled } from "../styled";
import type { StyledProps, VariantFunction } from "../styled";
import { getRadiusSized, tokenValue } from "../variants";
import { ThemeableStack, YStack } from "./Stacks";

export type CardProps = StyledProps & {
  size?: string | number;
  padded?: boolean;
  elevate?: boolean;
  elevation?: string | number;
  bordered?: boolean | number;
  hoverTheme?: boolean;
  pressTheme?: boolean;
  unstyled?: boolean;
};

/** Shares `size` with Card.Header and Card.Footer so their padding matches. */
export const CardContext = createStyledContext<{ size?: string | number }>({
  size: undefined,
});

/**
 * Card: a surface that groups related content. `elevate` adds the themed drop
 * shadow, `bordered` the themed outline, and `size` picks the radius token.
 */
export const CardFrame = styled<CardProps>(ThemeableStack, {
  name: "Card",
  context: CardContext,
  variants: {
    unstyled: {
      false: {
        size: "$true",
        backgroundColor: "$background",
        borderRadius: "$true",
        position: "relative",
        overflow: "hidden",
      },
    },

    size: {
      "...size": getRadiusSized,
      ":number": getRadiusSized,
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** Only runs for literal numbers and space tokens that exist, so the lookup always resolves. */
const paddingFromSpace: VariantFunction = (value, { tokens }) => ({ padding: tokenValue(tokens, "space", value) });

/** Card.Header: the top block, padded from the card's size. */
export const CardHeader = styled(YStack, {
  name: "CardHeader",
  context: CardContext,
  variants: {
    unstyled: {
      false: {
        size: "$true",
        zIndex: 10,
        backgroundColor: "transparent",
        marginBottom: "auto",
      },
    },

    size: {
      "...space": paddingFromSpace,
      ":number": paddingFromSpace,
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** Card.Footer: a padded row pinned to the bottom of the card. */
export const CardFooter = styled(CardHeader, {
  name: "CardFooter",
  variants: {
    unstyled: {
      false: {
        zIndex: 5,
        flexDirection: "row",
        alignItems: "center",
        marginTop: "auto",
        marginBottom: 0,
      },
    },
  },
});

/** Card.Background: fills the card behind its content, inheriting its radius. */
export const CardBackground = styled(YStack, {
  name: "CardBackground",
  variants: {
    unstyled: {
      false: {
        position: "absolute",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
        padding: 0,
        borderRadius: "inherit",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const Card = Object.assign(CardFrame, {
  Header: CardHeader,
  Footer: CardFooter,
  Background: CardBackground,
  /** Provide a size to every Card part beneath. */
  Apply: CardContext.Provider,
});
