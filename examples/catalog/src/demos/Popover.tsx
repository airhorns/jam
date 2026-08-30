import { h } from "@jam/core/jsx";
import { XStack, YStack, Popover, Button, Input, Label, Paragraph, SizableText } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const PopoverDemos: ComponentDemos = {
  name: "Popover",
  group: "Overlays",
  description: "Non-modal floating content anchored to a trigger, with an arrow and viewport-aware placement.",
  demos: [
    {
      title: "Placements",
      shot: { click: "popover-bottom" },
      render: () => (
        <XStack gap="$3" flexWrap="wrap" paddingVertical={90} justifyContent="center">
          {(["top", "bottom", "left", "right"] as const).map((placement) => (
            <Popover key={placement} placement={placement}>
              <Popover.Trigger asChild>
                <Button data-testid={`popover-${placement}`}>{placement}</Button>
              </Popover.Trigger>
              <Popover.Content>
                <Popover.Arrow />
                <YStack gap="$2">
                  <SizableText fontWeight="600">Popover ({placement})</SizableText>
                  <Paragraph size="$2" color="$color10">Click outside or press Escape to close.</Paragraph>
                </YStack>
              </Popover.Content>
            </Popover>
          ))}
        </XStack>
      ),
    },
    {
      title: "With form content",
      shot: { click: "popover-form" },
      render: () => (
        <XStack paddingBottom={200}>
          <Popover placement="bottom-start">
            <Popover.Trigger asChild>
              <Button data-testid="popover-form">Dimensions</Button>
            </Popover.Trigger>
            <Popover.Content width={260}>
              <Popover.Arrow />
              <YStack gap="$3">
                <XStack gap="$3" alignItems="center">
                  <Label htmlFor="pop-w" width={60}>Width</Label>
                  <Input id="pop-w" size="$3" flex={1} defaultValue="100%" />
                </XStack>
                <XStack gap="$3" alignItems="center">
                  <Label htmlFor="pop-h" width={60}>Height</Label>
                  <Input id="pop-h" size="$3" flex={1} defaultValue="25px" />
                </XStack>
                <XStack justifyContent="flex-end">
                  <Popover.Close asChild>
                    <Button size="$3" theme="accent">Done</Button>
                  </Popover.Close>
                </XStack>
              </YStack>
            </Popover.Content>
          </Popover>
        </XStack>
      ),
    },
    {
      title: "Anchored to a wider element",
      shot: { click: "popover-anchored" },
      render: () => (
        <YStack paddingBottom={140} width={360}>
          <Popover placement="bottom">
            <Popover.Anchor asChild>
              <XStack alignItems="center" justifyContent="space-between" padding="$3" borderWidth={1} borderStyle="solid" borderColor="$borderColor" borderRadius="$4">
                <SizableText>Notifications</SizableText>
                <Popover.Trigger size="$2" data-testid="popover-anchored">
                  Configure
                </Popover.Trigger>
              </XStack>
            </Popover.Anchor>
            <Popover.Content size="$3">
              <Popover.Arrow />
              <Paragraph size="$2">The arrow points at the anchor's centre, not the trigger.</Paragraph>
            </Popover.Content>
          </Popover>
        </YStack>
      ),
    },
  ],
};
