import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Sheet: bottom sheet / drawer overlay.
 *
 * Usage:
 *   <Sheet open={isOpen} onOpenChange={setOpen}>
 *     <Sheet.Overlay />
 *     <Sheet.Frame>
 *       <Sheet.Handle />
 *       Content here
 *     </Sheet.Frame>
 *   </Sheet>
 */
export function Sheet(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  snapPoints?: number[];
  position?: number;
  onPositionChange?: (position: number) => void;
  dismissOnSnapToBottom?: boolean;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const {
    open = false,
    onOpenChange,
    modal,
    snapPoints,
    position,
    onPositionChange,
    dismissOnSnapToBottom,
    children,
    ...rest
  } = props;

  if (!open) return null;

  return SheetFrame({
    ...rest,
    "data-state": open ? "open" : "closed",
    children,
  });
}
Sheet.displayName = "Sheet";

const SheetFrame = styled("div", {
  name: "SheetFrame",
  defaultProps: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
});

Sheet.Overlay = styled("div", {
  name: "SheetOverlay",
  defaultProps: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 50,
  },
});

Sheet.Frame = styled("div", {
  name: "SheetFrameContent",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    position: "relative",
    backgroundColor: "$background",
    borderTopLeftRadius: "$radius.5",
    borderTopRightRadius: "$radius.5",
    zIndex: 51,
    maxHeight: "85vh",
    overflow: "auto",
    padding: 16,
    boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
  },
});

Sheet.Handle = styled("div", {
  name: "SheetHandle",
  defaultProps: {
    width: 40,
    height: 4,
    borderRadius: 100000,
    backgroundColor: "$borderColor",
    alignSelf: "center",
    marginBottom: 8,
    opacity: 0.5,
  },
});

Sheet.ScrollView = styled("div", {
  name: "SheetScrollView",
  defaultProps: {
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },
});
