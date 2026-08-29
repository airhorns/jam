import { h } from "@jam/core/jsx";
import { XStack, YStack, Dialog, Button, Input, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const DialogDemos: ComponentDemos = {
  name: "Dialog",
  group: "Overlays",
  description: "Modal dialog rendered in a portal with an overlay, focus trap, and Escape/overlay dismissal.",
  demos: [
    {
      title: "Uncontrolled",
      render: () => (
        <Dialog>
          <Dialog.Trigger asChild>
            <Button data-testid="open-dialog">Edit profile</Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content data-testid="dialog-content">
              <Dialog.Title>Edit profile</Dialog.Title>
              <Dialog.Description>Make changes to your profile here. Click save when you're done.</Dialog.Description>
              <YStack gap="$space.3" marginVertical="$space.4">
                <YStack gap="$space.2">
                  <Label htmlFor="dlg-name">Name</Label>
                  <Input id="dlg-name" defaultValue="Ada Lovelace" />
                </YStack>
                <YStack gap="$space.2">
                  <Label htmlFor="dlg-user">Username</Label>
                  <Input id="dlg-user" defaultValue="@ada" />
                </YStack>
              </YStack>
              <XStack gap="$space.3" justifyContent="flex-end">
                <Dialog.Close asChild>
                  <Button variant="outlined">Cancel</Button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Button theme="accent" data-testid="save-dialog">Save changes</Button>
                </Dialog.Close>
              </XStack>
              <Dialog.Close position="absolute" top="$space.3" right="$space.3" aria-label="Close" data-testid="close-dialog">✕</Dialog.Close>
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
          <XStack gap="$space.3" alignItems="center">
            <Dialog open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild><Button>Open (controlled)</Button></Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content>
                  <Dialog.Title>Controlled dialog</Dialog.Title>
                  <Dialog.Description>State lives in the fact database.</Dialog.Description>
                  <XStack justifyContent="flex-end" marginTop="$space.4">
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
  ],
};
