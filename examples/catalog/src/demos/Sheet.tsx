import { h } from "@jam/core/jsx";
import { XStack, YStack, Sheet, Button, Paragraph, H4, SizableText, Separator } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SheetDemos: ComponentDemos = {
  name: "Sheet",
  demos: [
    {
      title: "Modal with snap points",
      shot: { click: "open-sheet" },
      render: () => {
        const [open, setOpen] = useDemoState("sheet.open", false);
        const [position, setPosition] = useDemoState("sheet.position", 0);
        return (
          <XStack gap="$3" alignItems="center">
            <Button onClick={() => setOpen(true)} data-testid="open-sheet">Open sheet</Button>
            <SizableText size="$2" color="$color10">open = {String(open)}, position = {position}</SizableText>
            <Sheet open={open} onOpenChange={setOpen} snapPoints={[85, 50]} position={position} onPositionChange={setPosition}>
              <Sheet.Overlay />
              <Sheet.Handle />
              <Sheet.Frame padding="$5" data-testid="sheet-frame">
                <YStack gap="$4" alignItems="center">
                  <H4>Sheet content</H4>
                  <Paragraph textAlign="center" color="$color10">Drag the handle to snap between 85% and 50%, drag it down to dismiss, or press Escape.</Paragraph>
                  <XStack gap="$3">
                    <Button size="$3" variant="outlined" onClick={() => setPosition(position === 0 ? 1 : 0)}>Toggle snap point</Button>
                    <Button size="$3" theme="accent" onClick={() => setOpen(false)} data-testid="close-sheet">Close</Button>
                  </XStack>
                </YStack>
              </Sheet.Frame>
            </Sheet>
          </XStack>
        );
      },
    },
    {
      title: "Scrolling content",
      shot: { click: "open-sheet-scroll" },
      render: () => {
        const [open, setOpen] = useDemoState("sheet.scroll.open", false);
        return (
          <XStack gap="$3" alignItems="center">
            <Button onClick={() => setOpen(true)} data-testid="open-sheet-scroll">Open list</Button>
            <Sheet open={open} onOpenChange={setOpen} snapPoints={[60]}>
              <Sheet.Overlay />
              <Sheet.Handle />
              <Sheet.Frame>
                <YStack padding="$4" paddingBottom="$2">
                  <H4>Pick a city</H4>
                </YStack>
                <Separator />
                <Sheet.ScrollView>
                  {["Amsterdam", "Berlin", "Copenhagen", "Dublin", "Edinburgh", "Florence", "Geneva", "Helsinki", "Istanbul", "Jakarta", "Kyoto", "Lisbon", "Madrid", "Nairobi", "Oslo", "Paris"].map((city) => (
                    <XStack key={city} paddingHorizontal="$4" paddingVertical="$3" hoverStyle={{ backgroundColor: "$backgroundHover" }} cursor="pointer" onClick={() => setOpen(false)}>
                      <SizableText>{city}</SizableText>
                    </XStack>
                  ))}
                </Sheet.ScrollView>
              </Sheet.Frame>
            </Sheet>
          </XStack>
        );
      },
    },
  ],
};
