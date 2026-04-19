import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Popover: floating content positioned relative to a trigger.
 *
 * Usage:
 *   <Popover open={isOpen} onOpenChange={setOpen}>
 *     <Popover.Trigger>Click me</Popover.Trigger>
 *     <Popover.Content>
 *       <Popover.Arrow />
 *       Popover content
 *     </Popover.Content>
 *   </Popover>
 */
export function Popover(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: "top" | "bottom" | "left" | "right";
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { open = false, onOpenChange, placement = "bottom", children, ...rest } = props;

  return PopoverFrame({
    ...rest,
    "data-state": open ? "open" : "closed",
    "data-placement": placement,
    children,
  });
}
Popover.displayName = "Popover";

const PopoverFrame = styled("div", {
  name: "PopoverFrame",
  defaultProps: {
    display: "inline-flex",
    position: "relative",
  },
});

Popover.Trigger = styled("button", {
  name: "PopoverTrigger",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    backgroundColor: "$background",
    color: "$color",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

Popover.Content = styled("div", {
  name: "PopoverContent",
  defaultProps: {
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    padding: 12,
    backgroundColor: "$background",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 50,
    minWidth: 200,
  },
});

Popover.Arrow = styled("div", {
  name: "PopoverArrow",
  defaultProps: {
    width: 10,
    height: 10,
    backgroundColor: "$background",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderBottomWidth: 0,
    borderRightWidth: 0,
    transform: "rotate(45deg)",
    position: "absolute",
    top: -6,
    left: "50%",
    marginLeft: -5,
  },
});

Popover.Anchor = styled("div", {
  name: "PopoverAnchor",
  defaultProps: {
    display: "inline-flex",
  },
});

Popover.Close = styled("button", {
  name: "PopoverClose",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: "$color",
    padding: 4,
    borderRadius: "$radius.2",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});
