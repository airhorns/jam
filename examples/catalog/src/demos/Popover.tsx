import { h } from "@jam/core/jsx";
import { XStack, YStack, Popover, Button, Input, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const PopoverDemos: ComponentDemos = {
  name: "Popover",
  group: "Overlays",
  description: "Non-modal floating content anchored to a trigger.",
  demos: [
    {
      title: "Placements",
      render: () => (
        <XStack gap="$space.3" flexWrap="wrap" paddingVertical={80} justifyContent="center">
          {(["top", "bottom", "left", "right"] as const).map((placement) => (
            <Popover key={placement} placement={placement}>
              <Popover.Trigger asChild>
                <Button data-testid={`popover-${placement}`}>{placement}</Button>
              </Popover.Trigger>
              <Popover.Content>
                <Popover.Arrow />
                <YStack gap="$space.2">
                  <Text fontWeight="600">Popover ({placement})</Text>
                  <Text fontSize={13} opacity={0.7}>Click outside or press Escape to close.</Text>
                </YStack>
              </Popover.Content>
            </Popover>
          ))}
        </XStack>
      ),
    },
    {
      title: "With form content",
      render: () => (
        <XStack paddingBottom={160}>
          <Popover placement="bottom">
            <Popover.Trigger asChild><Button>Dimensions</Button></Popover.Trigger>
            <Popover.Content width={240}>
              <Popover.Arrow />
              <YStack gap="$space.3">
                <XStack gap="$space.3" alignItems="center">
                  <Label htmlFor="pop-w" width={60}>Width</Label>
                  <Input id="pop-w" size="2" defaultValue="100%" />
                </XStack>
                <XStack gap="$space.3" alignItems="center">
                  <Label htmlFor="pop-h" width={60}>Height</Label>
                  <Input id="pop-h" size="2" defaultValue="25px" />
                </XStack>
                <XStack justifyContent="flex-end">
                  <Popover.Close asChild><Button size="2">Done</Button></Popover.Close>
                </XStack>
              </YStack>
            </Popover.Content>
          </Popover>
        </XStack>
      ),
    },
  ],
};
