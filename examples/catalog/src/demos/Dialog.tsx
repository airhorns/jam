import { h } from "@jam/core/jsx";
import { XStack, YStack, Dialog, Button, Input, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const DialogDemos: ComponentDemos = {
  name: "Dialog",
  demos: [
    {
      title: "Uncontrolled",
      shot: { click: "open-dialog" },
      render: () => (
        <Dialog>
          <Dialog.Trigger asChild>
            <Button data-testid="open-dialog">Edit profile</Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content data-testid="dialog-content" width={420}>
              <Dialog.Title>Edit profile</Dialog.Title>
              <Dialog.Description>Make changes to your profile here. Click save when you're done.</Dialog.Description>
              <YStack gap="$3">
                <YStack gap="$2">
                  <Label htmlFor="dlg-name">Name</Label>
                  <Input id="dlg-name" defaultValue="Ada Lovelace" />
                </YStack>
                <YStack gap="$2">
                  <Label htmlFor="dlg-user">Username</Label>
                  <Input id="dlg-user" defaultValue="@ada" />
                </YStack>
              </YStack>
              <XStack gap="$3" justifyContent="flex-end">
                <Dialog.Close asChild>
                  <Button variant="outlined">Cancel</Button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Button theme="accent" data-testid="save-dialog">Save changes</Button>
                </Dialog.Close>
              </XStack>
              <Dialog.Close asChild>
                <Button position="absolute" top="$3" right="$3" size="$2" circular chromeless aria-label="Close" data-testid="close-dialog">✕</Button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ),
    },
    {
      title: "Controlled",
      render: () => {
        const [open, setOpen] = useDemoState("dialog.open", false);
        return (
          <XStack gap="$3" alignItems="center">
            <Dialog open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild><Button>Open (controlled)</Button></Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content>
                  <Dialog.Title>Controlled dialog</Dialog.Title>
                  <Dialog.Description>State lives in the fact database.</Dialog.Description>
                  <XStack justifyContent="flex-end">
                    <Button onClick={() => setOpen(false)}>Done</Button>
                  </XStack>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog>
            <Text opacity={0.6}>open = {String(open)}</Text>
          </XStack>
        );
      },
    },
    {
      title: "Plain trigger and non-modal",
      description: "Without asChild the trigger and close render as Buttons. Non-modal dialogs don't trap focus or lock scroll.",
      shot: { click: "open-plain" },
      render: () => (
        <Dialog modal={false}>
          <Dialog.Trigger data-testid="open-plain" size="$3">Show notice</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Content>
              <Dialog.Title>Heads up</Dialog.Title>
              <Dialog.Description>You can still interact with the page behind this dialog.</Dialog.Description>
              <XStack justifyContent="flex-end">
                <Dialog.Close size="$3">Got it</Dialog.Close>
              </XStack>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ),
    },
  ],
};
