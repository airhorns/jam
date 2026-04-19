import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Base flexbox container. Renders a div with display: flex.
 */
export const Stack = styled("div", {
  name: "Stack",
  defaultProps: {
    display: "flex",
  },
});

/**
 * Horizontal stack — flexbox with row direction.
 */
export const XStack = styled("div", {
  name: "XStack",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
  },
});

/**
 * Vertical stack — flexbox with column direction.
 */
export const YStack = styled("div", {
  name: "YStack",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
  },
});

/**
 * Z-axis stack — children are absolutely positioned and overlap.
 * The ZStack itself is position: relative.
 */
export const ZStack = styled("div", {
  name: "ZStack",
  defaultProps: {
    display: "flex",
    position: "relative",
  },
});
