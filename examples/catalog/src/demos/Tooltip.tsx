import { h } from "@jam/core/jsx";
import { XStack, Tooltip, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const TooltipDemos: ComponentDemos = {
  name: "Tooltip",
  group: "Overlays",
  description: "Hover/focus-triggered label for a control.",
  demos: [
    {
      title: "Placements",
      render: () => (
        <XStack gap="$space.3" flexWrap="wrap" paddingVertical={60} justifyContent="center">
          {(["top", "bottom", "left", "right"] as const).map((placement) => (
            <Tooltip key={placement} placement={placement}>
              <Tooltip.Trigger asChild>
                <Button data-testid={`tooltip-${placement}`}>{placement}</Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Tooltip.Arrow />
                <Text>Tooltip on {placement}</Text>
              </Tooltip.Content>
            </Tooltip>
          ))}
        </XStack>
      ),
    },
    {
      title: "Instant (no delay)",
      render: () => (
        <Tooltip delay={0}>
          <Tooltip.Trigger asChild><Button>Hover me</Button></Tooltip.Trigger>
          <Tooltip.Content><Text>Appears immediately</Text></Tooltip.Content>
        </Tooltip>
      ),
    },
  ],
};
