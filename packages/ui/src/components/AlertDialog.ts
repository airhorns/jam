import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import {
  DialogClose,
  DialogContent,
  DialogContext,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useDialogRoot,
} from "./Dialog";
import type { DialogProps, DialogTriggerProps } from "./Dialog";

export type AlertDialogProps = Omit<DialogProps, "modal" | "dismissOnOutsidePress">;

function AlertDialogRoot(props: AlertDialogProps): VNode {
  const value = useDialogRoot({ ...props, modal: true, dismissOnOutsidePress: false }, "alertdialog", "alertdialog", {
    initialFocus: "[data-alert-dialog-cancel]",
  });
  return h(DialogContext.Provider, { value }, props.children);
}
AlertDialogRoot.displayName = "AlertDialog";

function AlertDialogCancel(props: DialogTriggerProps): VNode {
  const cancel = { "data-alert-dialog-cancel": "", ...props };
  return h(DialogClose, props.asChild ? cancel : { variant: "outlined", ...cancel });
}
AlertDialogCancel.displayName = "AlertDialogCancel";

function AlertDialogAction(props: DialogTriggerProps): VNode {
  return h(DialogClose, props.asChild ? props : { theme: "accent", ...props });
}
AlertDialogAction.displayName = "AlertDialogAction";

/**
 * AlertDialog: a Dialog that interrupts the user and waits for an explicit
 * choice. It has `role="alertdialog"`, is always modal, ignores presses
 * outside the content, focuses Cancel first, and closes through Cancel or Action.
 *
 *   <AlertDialog>
 *     <AlertDialog.Trigger asChild><Button>Delete</Button></AlertDialog.Trigger>
 *     <AlertDialog.Portal>
 *       <AlertDialog.Overlay />
 *       <AlertDialog.Content>
 *         <AlertDialog.Title>Delete this item?</AlertDialog.Title>
 *         <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
 *         <XStack gap="$3" justifyContent="flex-end">
 *           <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
 *           <AlertDialog.Action onClick={remove}>Delete</AlertDialog.Action>
 *         </XStack>
 *       </AlertDialog.Content>
 *     </AlertDialog.Portal>
 *   </AlertDialog>
 */
export const AlertDialog = Object.assign(AlertDialogRoot, {
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Cancel: AlertDialogCancel,
  Action: AlertDialogAction,
});
