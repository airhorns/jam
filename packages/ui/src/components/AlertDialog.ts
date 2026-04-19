import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * AlertDialog: confirmation dialog with required user action.
 *
 * Usage:
 *   <AlertDialog open={isOpen} onOpenChange={setOpen}>
 *     <AlertDialog.Trigger>Delete</AlertDialog.Trigger>
 *     <AlertDialog.Portal>
 *       <AlertDialog.Overlay />
 *       <AlertDialog.Content>
 *         <AlertDialog.Title>Are you sure?</AlertDialog.Title>
 *         <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
 *         <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
 *         <AlertDialog.Action>Confirm</AlertDialog.Action>
 *       </AlertDialog.Content>
 *     </AlertDialog.Portal>
 *   </AlertDialog>
 */
export function AlertDialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { open = false, onOpenChange, children, ...rest } = props;

  return AlertDialogFrame({
    ...rest,
    "data-state": open ? "open" : "closed",
    role: "alertdialog",
    children,
  });
}
AlertDialog.displayName = "AlertDialog";

const AlertDialogFrame = styled("div", {
  name: "AlertDialogFrame",
  defaultProps: {
    display: "contents",
  },
});

AlertDialog.Trigger = styled("button", {
  name: "AlertDialogTrigger",
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

const AlertDialogPortal = function AlertDialogPortal(props: { children?: VChild | VChild[] }): VNode | null {
  return h("div", { "data-alertdialog-portal": "true" }, ...(Array.isArray(props.children) ? props.children : props.children ? [props.children] : []));
};
AlertDialogPortal.displayName = "AlertDialogPortal";
AlertDialog.Portal = AlertDialogPortal;

AlertDialog.Overlay = styled("div", {
  name: "AlertDialogOverlay",
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

AlertDialog.Content = styled("div", {
  name: "AlertDialogContent",
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
    maxWidth: 500,
  },
});

AlertDialog.Title = styled("h2", {
  name: "AlertDialogTitle",
  defaultProps: {
    fontSize: 18,
    fontWeight: "600",
    color: "$color",
    margin: 0,
  },
});

AlertDialog.Description = styled("p", {
  name: "AlertDialogDescription",
  defaultProps: {
    fontSize: 14,
    color: "$color",
    opacity: 0.7,
    margin: 0,
    lineHeight: 1.5,
  },
});

AlertDialog.Cancel = styled("button", {
  name: "AlertDialogCancel",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    backgroundColor: "transparent",
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

AlertDialog.Action = styled("button", {
  name: "AlertDialogAction",
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
    fontWeight: "600",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});
