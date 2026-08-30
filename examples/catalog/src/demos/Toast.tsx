import { h } from "@jam/core/jsx";
import { XStack, YStack, Toast, Button, toastController } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ToastDemos: ComponentDemos = {
  name: "Toast",
  group: "Feedback",
  description: "Brief auto-dismissing notifications; imperative toasts stack in a viewport, declarative ones float at the same corner.",
  demos: [
    {
      title: "Declarative",
      shot: { click: "show-toast" },
      render: () => {
        const [open, setOpen] = useDemoState("toast.open", false);
        const [count, setCount] = useDemoState("toast.count", 0);
        return (
          <XStack gap="$3">
            <Button
              data-testid="show-toast"
              onClick={() => {
                setCount(count + 1);
                setOpen(true);
              }}
            >
              Show toast
            </Button>
            <Toast open={open} onOpenChange={setOpen} duration={4000} data-testid="toast">
              <XStack gap="$3" alignItems="flex-start">
                <YStack flex={1} gap="$1">
                  <Toast.Title>Saved</Toast.Title>
                  <Toast.Description>Your changes have been saved ({count}).</Toast.Description>
                </YStack>
                <Toast.Action altText="Undo the save" onClick={() => setOpen(false)}>Undo</Toast.Action>
                <Toast.Close>✕</Toast.Close>
              </XStack>
            </Toast>
          </XStack>
        );
      },
    },
    {
      title: "Imperative, stacked in a viewport",
      shot: { click: ["toast-success", "toast-error", "toast-info"] },
      render: () => (
        <XStack gap="$3" flexWrap="wrap">
          <Toast.Viewport placement="top-right" />
          <Button data-testid="toast-success" theme="green" onClick={() => toastController.show("Deployed", { message: "v2.4.1 is live in all regions.", theme: "green" })}>
            Success
          </Button>
          <Button
            data-testid="toast-error"
            theme="red"
            onClick={() =>
              toastController.show("Payment failed", {
                message: "The card was declined. Try another method.",
                theme: "red",
                duration: 8000,
                action: { label: "Retry", onPress: () => toastController.show("Retrying…") },
              })
            }
          >
            Error with action
          </Button>
          <Button data-testid="toast-info" onClick={() => toastController.show("Heads up", { message: "Maintenance starts at 02:00 UTC." })}>
            Info
          </Button>
          <Button variant="outlined" onClick={() => toastController.hideAll()}>
            Clear all
          </Button>
        </XStack>
      ),
    },
  ],
};
