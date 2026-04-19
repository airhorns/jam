import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Toast: notification popups.
 *
 * Usage:
 *   <Toast.Provider>
 *     <Toast open={showToast} onOpenChange={setShowToast}>
 *       <Toast.Title>Success</Toast.Title>
 *       <Toast.Description>Item saved.</Toast.Description>
 *       <Toast.Close>×</Toast.Close>
 *     </Toast>
 *     <Toast.Viewport />
 *   </Toast.Provider>
 */
export function Toast(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { open = false, onOpenChange, duration = 5000, children, ...rest } = props;

  if (!open) return null;

  return ToastFrame({
    ...rest,
    role: "status",
    "aria-live": "polite",
    "data-state": "open",
    children,
  });
}
Toast.displayName = "Toast";

const ToastFrame = styled("div", {
  name: "ToastFrame",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "$background",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    minWidth: 200,
  },
});

const ToastProvider = function ToastProvider(props: { children?: VChild | VChild[] }): VNode | null {
  return h("div", { "data-toast-provider": "true" }, ...(Array.isArray(props.children) ? props.children : props.children ? [props.children] : []));
};
ToastProvider.displayName = "ToastProvider";
Toast.Provider = ToastProvider;

Toast.Viewport = styled("div", {
  name: "ToastViewport",
  defaultProps: {
    position: "fixed",
    bottom: 16,
    right: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    zIndex: 100,
    maxWidth: 400,
    pointerEvents: "none",
  },
});

Toast.Title = styled("span", {
  name: "ToastTitle",
  defaultProps: {
    fontWeight: "600",
    color: "$color",
    fontSize: 14,
  },
});

Toast.Description = styled("span", {
  name: "ToastDescription",
  defaultProps: {
    color: "$color",
    opacity: 0.7,
    fontSize: 13,
  },
});

Toast.Action = styled("button", {
  name: "ToastAction",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.2",
    color: "$color",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: "500",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

Toast.Close = styled("button", {
  name: "ToastClose",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: "$color",
    cursor: "pointer",
    padding: 4,
    marginLeft: "auto",
    borderRadius: "$radius.2",
    opacity: 0.5,
    hoverStyle: {
      opacity: 1,
    },
  },
});
