import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Dialog: modal dialog overlay.
 *
 * Usage:
 *   <Dialog open={isOpen} onOpenChange={setOpen}>
 *     <Dialog.Trigger>Open</Dialog.Trigger>
 *     <Dialog.Portal>
 *       <Dialog.Overlay />
 *       <Dialog.Content>
 *         <Dialog.Title>Dialog Title</Dialog.Title>
 *         <Dialog.Description>Some description</Dialog.Description>
 *         <Dialog.Close>Close</Dialog.Close>
 *       </Dialog.Content>
 *     </Dialog.Portal>
 *   </Dialog>
 */
export function Dialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { open = false, onOpenChange, modal = true, children, ...rest } = props;

  return DialogFrame({
    ...rest,
    "data-state": open ? "open" : "closed",
    children,
  });
}
Dialog.displayName = "Dialog";

const DialogFrame = styled("div", {
  name: "DialogFrame",
  defaultProps: {
    display: "contents",
  },
});

Dialog.Trigger = styled("button", {
  name: "DialogTrigger",
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "500",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

const DialogPortal = function DialogPortal(props: { children?: VChild | VChild[] }): VNode | null {
  return h("div", { "data-dialog-portal": "true" }, ...(Array.isArray(props.children) ? props.children : props.children ? [props.children] : []));
};
DialogPortal.displayName = "DialogPortal";
Dialog.Portal = DialogPortal;

Dialog.Overlay = styled("div", {
  name: "DialogOverlay",
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

Dialog.Content = styled("div", {
  name: "DialogContent",
  defaultProps: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 24,
    backgroundColor: "$background",
    borderRadius: "$radius.4",
    boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
    zIndex: 51,
    maxWidth: "90vw",
    maxHeight: "85vh",
    overflow: "auto",
  },
});

Dialog.Title = styled("h2", {
  name: "DialogTitle",
  defaultProps: {
    fontSize: 18,
    fontWeight: "600",
    color: "$color",
    margin: 0,
  },
});

Dialog.Description = styled("p", {
  name: "DialogDescription",
  defaultProps: {
    fontSize: 14,
    color: "$color",
    opacity: 0.7,
    margin: 0,
    lineHeight: 1.5,
  },
});

Dialog.Close = styled("button", {
  name: "DialogClose",
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
