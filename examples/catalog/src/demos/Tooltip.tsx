import { h } from "@jam/core/jsx";
import { XStack, Tooltip, Button } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const TooltipDemos: ComponentDemos = {
  name: "Tooltip",
  group: "Overlays",
  description: "Hover/focus-triggered label for a control, styled as an accent chip.",
  demos: [
    {
      title: "Placements",
      shot: { hover: "tooltip-top", wait: 700 },
      render: () => (
        <XStack gap="$3" flexWrap="wrap" paddingVertical={60} justifyContent="center">
          {(["top", "bottom", "left", "right"] as const).map((placement) => (
            <Tooltip key={placement} placement={placement}>
              <Tooltip.Trigger asChild>
                <Button data-testid={`tooltip-${placement}`}>{placement}</Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Tooltip.Arrow />
                Tooltip on {placement}
              </Tooltip.Content>
            </Tooltip>
          ))}
        </XStack>
      ),
    },
    {
      title: "Instant, larger, and on a plain trigger",
      shot: { focus: "tooltip-plain" },
      render: () => (
        <XStack gap="$4" paddingVertical={60} alignItems="center">
          <Tooltip delay={0} placement="bottom">
            <Tooltip.Trigger asChild>
              <Button data-testid="tooltip-instant">Hover me</Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Appears immediately</Tooltip.Content>
          </Tooltip>
          <Tooltip delay={0} placement="bottom">
            <Tooltip.Trigger asChild>
              <Button data-testid="tooltip-large">Large</Button>
            </Tooltip.Trigger>
            <Tooltip.Content size="$5" textProps={{ size: "$4" }}>
              <Tooltip.Arrow size={10} />
              Bigger padding and text
            </Tooltip.Content>
          </Tooltip>
          <Tooltip delay={0} placement="bottom">
            <Tooltip.Trigger data-testid="tooltip-plain" borderBottomWidth={1} borderBottomStyle="dotted" borderColor="$color10">
              Focus this text
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Tooltip.Arrow />
              Plain triggers are focusable spans
            </Tooltip.Content>
          </Tooltip>
        </XStack>
      ),
    },
  ],
};
