import { h } from "@jam/core/jsx";
import { XStack, Toast, Button } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ToastDemos: ComponentDemos = {
  name: "Toast",
  group: "Feedback",
  description: "Transient notifications rendered into a viewport in the corner of the screen.",
  demos: [
    {
      title: "Triggered toast",
      render: () => {
        const [open, setOpen] = useDemoState("toast.open", false);
        const [count, setCount] = useDemoState("toast.count", 0);
        return (
          <XStack gap="$space.3">
            <Button
              data-testid="show-toast"
              onClick={() => {
                setCount(count + 1);
                setOpen(true);
              }}
            >
              Show toast
            </Button>
            <Toast open={open} onOpenChange={setOpen} duration={3000} data-testid="toast">
              <Toast.Title>Saved</Toast.Title>
              <Toast.Description>Your changes have been saved ({count}).</Toast.Description>
              <Toast.Action altText="Undo" onClick={() => setOpen(false)}>Undo</Toast.Action>
              <Toast.Close aria-label="Close">✕</Toast.Close>
            </Toast>
            <Toast.Viewport />
          </XStack>
        );
      },
    },
  ],
};
