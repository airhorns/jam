import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Tooltip: hover-triggered informational popup.
 *
 * Usage:
 *   <Tooltip>
 *     <Tooltip.Trigger>Hover me</Tooltip.Trigger>
 *     <Tooltip.Content>Tooltip text</Tooltip.Content>
 *   </Tooltip>
 */
export function Tooltip(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { children, ...rest } = props;

  return TooltipFrame({
    ...rest,
    children,
  });
}
Tooltip.displayName = "Tooltip";

const TooltipFrame = styled("div", {
  name: "TooltipFrame",
  defaultProps: {
    display: "inline-flex",
    position: "relative",
  },
});

Tooltip.Trigger = styled("span", {
  name: "TooltipTrigger",
  defaultProps: {
    display: "inline-flex",
    cursor: "default",
  },
});

Tooltip.Content = styled("div", {
  name: "TooltipContent",
  defaultProps: {
    position: "absolute",
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "$color",
    color: "$background",
    borderRadius: "$radius.2",
    fontSize: 12,
    fontWeight: "500",
    whiteSpace: "nowrap",
    zIndex: 100,
    pointerEvents: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
});

Tooltip.Arrow = styled("div", {
  name: "TooltipArrow",
  defaultProps: {
    width: 8,
    height: 8,
    backgroundColor: "$color",
    transform: "rotate(45deg)",
    position: "absolute",
    bottom: -4,
    left: "50%",
    marginLeft: -4,
  },
});
