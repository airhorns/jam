import { h } from "@jam/core/jsx";
import { XStack, YStack, Sheet, Button, Text, H4 } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SheetDemos: ComponentDemos = {
  name: "Sheet",
  group: "Overlays",
  description: "Bottom sheet with snap points.",
  demos: [
    {
      title: "Modal sheet",
      render: () => {
        const [open, setOpen] = useDemoState("sheet.open", false);
        return (
          <XStack gap="$space.3" alignItems="center">
            <Button onClick={() => setOpen(true)} data-testid="open-sheet">Open sheet</Button>
            <Text opacity={0.6}>open = {String(open)}</Text>
            <Sheet open={open} onOpenChange={setOpen} snapPoints={[85, 50]} modal dismissOnSnapToBottom>
              <Sheet.Overlay />
              <Sheet.Handle />
              <Sheet.Frame padding="$space.5" data-testid="sheet-frame">
                <YStack gap="$space.4" alignItems="center">
                  <H4>Sheet content</H4>
                  <Text opacity={0.7}>Drag the handle, click the overlay, or press Escape to dismiss.</Text>
                  <Button onClick={() => setOpen(false)} data-testid="close-sheet">Close</Button>
                </YStack>
              </Sheet.Frame>
            </Sheet>
          </XStack>
        );
      },
    },
  ],
};
