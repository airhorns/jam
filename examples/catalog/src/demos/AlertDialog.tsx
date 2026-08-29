import { h } from "@jam/core/jsx";
import { XStack, YStack, AlertDialog, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const AlertDialogDemos: ComponentDemos = {
  name: "AlertDialog",
  group: "Overlays",
  description: "A modal that interrupts the user and requires an explicit response; not dismissed by clicking outside.",
  demos: [
    {
      title: "Confirm destructive action",
      shot: { click: "open-alert" },
      render: () => {
        const [result, setResult] = useDemoState("alert.result", "");
        return (
          <YStack gap="$3">
            <AlertDialog>
              <AlertDialog.Trigger asChild>
                <Button data-testid="open-alert">Delete account</Button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay />
                <AlertDialog.Content data-testid="alert-content">
                  <AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
                  <AlertDialog.Description>
                    This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                  </AlertDialog.Description>
                  <XStack gap="$3" justifyContent="flex-end">
                    <AlertDialog.Cancel asChild>
                      <Button variant="outlined" onClick={() => setResult("cancelled")} data-testid="alert-cancel">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <Button theme="red" onClick={() => setResult("deleted")} data-testid="alert-action">Yes, delete</Button>
                    </AlertDialog.Action>
                  </XStack>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog>
            {result ? <Text opacity={0.6} data-testid="alert-result">Result: {result}</Text> : null}
          </YStack>
        );
      },
    },
  ],
};
