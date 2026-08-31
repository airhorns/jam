import { Portal } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { themeableVariants } from "../variants";
import { useControllableState, useStableId } from "../state";
import { useDismissableLayer } from "../layers";
import type { LayerOptions } from "../layers";
import { Button } from "./Button";
import { Slot } from "./Slot";
import { YStack } from "./Stacks";
import { H2, Paragraph } from "./Text";
import { containsTag } from "./vnode";

export type DialogContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  modal: boolean;
  role: "dialog" | "alertdialog";
  contentId: string;
  titleId: string;
  descriptionId: string;
};

export const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialogContext(part: string): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error(`Dialog.${part} must be rendered inside <Dialog>`);
  return ctx;
}

export const dataState = (open: boolean): "open" | "closed" => (open ? "open" : "closed");

export type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trap focus, lock scroll and mark the content `aria-modal` (default true). */
  modal?: boolean;
  /** Close on Escape (default true). */
  dismissOnEscape?: boolean;
  /** Close when pressing outside the content, e.g. on the overlay (default true). */
  dismissOnOutsidePress?: boolean;
  children?: VChild | VChild[];
};

/**
 * Register the dialog's open state as a dismissable layer and provide the
 * context its parts read. Shared with AlertDialog, which changes the role,
 * locks the dismissal rules and prefers focusing Cancel.
 */
export function useDialogRoot(
  props: DialogProps,
  role: DialogContextValue["role"],
  idPrefix: string,
  layer: Partial<LayerOptions> = {},
): DialogContextValue {
  const modal = props.modal ?? true;
  const id = useStableId(idPrefix);
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const open = openState === true;
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal,
    autoFocus: true,
    restoreFocus: true,
    dismissOnEscape: props.dismissOnEscape,
    dismissOnOutsidePress: props.dismissOnOutsidePress,
    ...layer,
  });
  return {
    id,
    open,
    setOpen,
    modal,
    role,
    contentId: `${id}-content`,
    titleId: `${id}-title`,
    descriptionId: `${id}-description`,
  };
}

function DialogRoot(props: DialogProps): VNode {
  const value = useDialogRoot(props, "dialog", "dialog");
  return h(DialogContext.Provider, { value }, props.children);
}
DialogRoot.displayName = "Dialog";

// ---- Trigger / Close ----

export type DialogTriggerProps = StyledProps & {
  /** Merge the trigger behaviour onto the single child instead of rendering a Button. */
  asChild?: boolean;
  onClick?: (event: MouseEvent) => void;
};

export function DialogTrigger(props: DialogTriggerProps): VNode {
  const ctx = useDialogContext("Trigger");
  const { asChild, onClick, ...rest } = props;
  return h(asChild ? Slot : Button, {
    ...rest,
    "aria-haspopup": "dialog",
    "aria-expanded": ctx.open,
    "aria-controls": ctx.open ? ctx.contentId : undefined,
    "data-state": dataState(ctx.open),
    "data-layer-anchor": ctx.id,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      ctx.setOpen(!ctx.open);
    },
  });
}
DialogTrigger.displayName = "DialogTrigger";

export function DialogClose(props: DialogTriggerProps): VNode {
  const ctx = useDialogContext("Close");
  const { asChild, onClick, ...rest } = props;
  return h(asChild ? Slot : Button, {
    ...rest,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      ctx.setOpen(false);
    },
  });
}
DialogClose.displayName = "DialogClose";

// ---- Portal / Overlay / Content ----

export const DialogPortalFrame = styled(YStack, {
  name: "DialogPortal",
  variants: {
    unstyled: {
      false: {
        position: "fixed",
        inset: 0,
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 100_000,
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type DialogPortalProps = StyledProps & {
  /** Render the portal even while closed. */
  forceMount?: boolean;
};

export function DialogPortal(props: DialogPortalProps): VNode | null {
  const ctx = useDialogContext("Portal");
  const { forceMount, children, ...rest } = props;
  if (!ctx.open && !forceMount) return null;
  return h(Portal, null, h(DialogPortalFrame, { "data-state": dataState(ctx.open), ...rest }, children));
}
DialogPortal.displayName = "DialogPortal";

export const DialogOverlayFrame = styled(YStack, {
  name: "DialogOverlay",
  defaultProps: {
    animation: "medium",
  },
  variants: {
    unstyled: {
      false: {
        position: "fixed",
        inset: 0,
        backgroundColor: "$shadow6",
        pointerEvents: "auto",
        enterStyle: { opacity: 0 },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export function DialogOverlay(props: StyledProps): VNode {
  const ctx = useDialogContext("Overlay");
  return h(DialogOverlayFrame, { "data-state": dataState(ctx.open), "aria-hidden": "true", ...props });
}
DialogOverlay.displayName = "DialogOverlay";

export const DialogContentFrame = styled(YStack, {
  name: "DialogContent",
  defaultProps: {
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        position: "relative",
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        padding: "$true",
        borderRadius: "$true",
        gap: "$4",
        elevate: true,
        zIndex: 2,
        pointerEvents: "auto",
        maxWidth: "min(90vw, 560px)",
        maxHeight: "85vh",
        overflow: "auto",
        outlineWidth: 0,
        enterStyle: { opacity: 0, scale: 0.96, y: 10 },
      },
    },
    elevate: themeableVariants.elevate,
    elevation: themeableVariants.elevation,
    bordered: themeableVariants.bordered,
    fullscreen: themeableVariants.fullscreen,
  },
  defaultVariants: {
    unstyled: false,
  },
});

export function DialogContent(props: StyledProps): VNode {
  const ctx = useDialogContext("Content");
  const { "aria-describedby": describedBy, ...rest } = props as StyledProps & { "aria-describedby"?: string };
  const hasTitle = containsTag(props.children, [DialogTitle]);
  const hasDescription = containsTag(props.children, [DialogDescription]);
  return h(DialogContentFrame, {
    id: ctx.contentId,
    role: ctx.role,
    "aria-modal": ctx.modal ? "true" : undefined,
    "aria-labelledby": hasTitle ? ctx.titleId : undefined,
    "aria-describedby": hasDescription ? [describedBy, ctx.descriptionId].filter(Boolean).join(" ") : describedBy,
    "data-state": dataState(ctx.open),
    "data-layer": ctx.id,
    tabIndex: -1,
    ...rest,
  });
}
DialogContent.displayName = "DialogContent";

// ---- Title / Description ----

export const DialogTitleFrame = styled(H2, { name: "DialogTitle" });

export function DialogTitle(props: StyledProps): VNode {
  const ctx = useDialogContext("Title");
  return h(DialogTitleFrame, { id: ctx.titleId, ...props });
}
DialogTitle.displayName = "DialogTitle";

export const DialogDescriptionFrame = styled(Paragraph, { name: "DialogDescription" });

export function DialogDescription(props: StyledProps): VNode {
  const ctx = useDialogContext("Description");
  return h(DialogDescriptionFrame, { id: ctx.descriptionId, ...props });
}
DialogDescription.displayName = "DialogDescription";

/**
 * Dialog: a modal window layered over the page.
 *
 *   <Dialog>
 *     <Dialog.Trigger asChild><Button>Open</Button></Dialog.Trigger>
 *     <Dialog.Portal>
 *       <Dialog.Overlay />
 *       <Dialog.Content>
 *         <Dialog.Title>Title</Dialog.Title>
 *         <Dialog.Description>Description</Dialog.Description>
 *         <Dialog.Close asChild><Button>Done</Button></Dialog.Close>
 *       </Dialog.Content>
 *     </Dialog.Portal>
 *   </Dialog>
 */
export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
});
