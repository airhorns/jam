import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { injectRule } from "../css";
import { themeableVariants } from "../variants";

/** tamagui's `View` reset: a column flexbox that never inherits browser text metrics and, like a React Native view, does not shrink below its content. */
const viewDefaults = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  flexBasis: "auto",
  flexShrink: 0,
  boxSizing: "border-box",
  minWidth: 0,
  minHeight: 0,
};

const stackVariants = {
  fullscreen: themeableVariants.fullscreen,
  elevation: themeableVariants.elevation,
  elevate: themeableVariants.elevate,
  bordered: themeableVariants.bordered,
  transparent: themeableVariants.transparent,
  chromeless: themeableVariants.chromeless,
  circular: themeableVariants.circular,
};

export type StackProps = StyledProps & {
  fullscreen?: boolean;
  elevation?: string | number;
  elevate?: boolean;
  bordered?: boolean | number;
  transparent?: boolean;
  chromeless?: boolean | "all";
  circular?: boolean;
};

/**
 * Base view: a column flexbox with the shape variants every stack shares.
 * `Stack` is to `@jam/ui` what `View` is to tamagui.
 */
export const Stack = styled<StackProps>("div", {
  name: "Stack",
  defaultProps: viewDefaults,
  variants: stackVariants,
});

/** A row flexbox. */
export const XStack = styled<StackProps>(Stack, {
  name: "XStack",
  defaultProps: { flexDirection: "row" },
});

/** A column flexbox. */
export const YStack = styled<StackProps>(Stack, {
  name: "YStack",
  defaultProps: { flexDirection: "column" },
});

/**
 * Stack with the theme-reactive variants used by Card, ListItem, Square and
 * friends: `hoverTheme`/`pressTheme`/`focusTheme` wire the theme's
 * hover/press/focus colours, and the shape variants come from `Stack`.
 */
export const ThemeableStack = styled<
  StackProps & {
    backgrounded?: boolean;
    radiused?: boolean;
    hoverTheme?: boolean;
    pressTheme?: boolean;
    focusTheme?: boolean;
    padded?: boolean;
  }
>(Stack, {
  variants: {
    backgrounded: {
      true: { backgroundColor: "$background" },
    },
    radiused: {
      true: { borderRadius: "$true" },
    },
    hoverTheme: {
      true: {
        hoverStyle: { backgroundColor: "$backgroundHover", borderColor: "$borderColorHover" },
      },
    },
    pressTheme: {
      true: {
        cursor: "pointer",
        pressStyle: { backgroundColor: "$backgroundPress", borderColor: "$borderColorPress" },
      },
    },
    focusTheme: {
      true: {
        focusStyle: { backgroundColor: "$backgroundFocus", borderColor: "$borderColorFocus" },
      },
    },
    padded: {
      true: { padding: "$true" },
    },
  },
});

const ZStackFrame = styled(Stack, {
  name: "ZStack",
  defaultProps: { position: "relative" },
});

/** One layer of a ZStack: fills the frame so its child can position inside it. */
const ZStackFill = styled("div", {
  name: "ZStackFill",
  defaultProps: {
    ...viewDefaults,
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
});

// The fill is transparent to the pointer so lower layers stay clickable; its
// content is not. Doubling the class beats the atomic class specificity.
function injectZStackRules(): void {
  injectRule("jam-ui-zstack", ".is_ZStackFill.is_ZStackFill > * { pointer-events: auto }");
}

const toArray = (children: VChild | VChild[] | undefined): VChild[] =>
  children == null ? [] : Array.isArray(children) ? children : [children];

/**
 * ZStack: children are layered on top of each other, each one absolutely
 * positioned and filling the stack. A child with its own `top`/`left` offsets
 * positions relative to the stack, like tamagui's ZStack.
 */
export function ZStack(props: StackProps): VNode {
  injectZStackRules();
  const { children, ...frameProps } = props;
  const layers = toArray(children)
    .filter((child) => child != null && child !== false)
    .map((child) => h(ZStackFill, {}, child));
  return h(ZStackFrame, frameProps as Record<string, unknown>, ...layers);
}
ZStack.displayName = "ZStack";
