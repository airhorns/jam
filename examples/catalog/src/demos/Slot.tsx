import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, Slot, Button, Card, Popover, Paragraph, SizableText, Anchor } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SlotDemos: ComponentDemos = {
  name: "Slot",
  demos: [
    {
      title: "asChild on a compound part",
      description: "Popover.Trigger renders no button of its own; the Card carries the trigger's role, aria state and handlers.",
      shot: { click: "slot-card-trigger" },
      render: () => (
        <XStack paddingBottom={140}>
          <Popover placement="bottom-start">
            <Popover.Trigger asChild>
              <Card bordered padding="$3" width={260} cursor="pointer" tabIndex={0} hoverStyle={{ backgroundColor: "$backgroundHover" }} data-testid="slot-card-trigger">
                <SizableText fontWeight="600">Quarterly report</SizableText>
                <Paragraph size="$2" color="$color10">A whole card as the trigger, with no wrapper element.</Paragraph>
              </Card>
            </Popover.Trigger>
            <Popover.Content width={240}>
              <Popover.Arrow />
              <Paragraph size="$2">Opened by the card itself: inspect it to find role, aria-expanded and data-state on the Card's div.</Paragraph>
            </Popover.Content>
          </Popover>
        </XStack>
      ),
    },
    {
      title: "Standalone Slot",
      description: "Slot merges its props onto its single child: classes append, handlers chain (child first), other props fill in.",
      render: () => {
        const [clicks, setClicks] = useDemoState("slot.clicks", 0);
        const [last, setLast] = useDemoState("slot.last", "none");
        return (
          <YStack gap="$3" alignItems="flex-start">
            <XStack gap="$3" alignItems="center">
              <Slot onClick={() => setLast("slot")} aria-label="Count clicks" data-testid="slot-merged">
                <Button size="$3" onClick={() => setClicks(clicks + 1)}>Clicked {clicks} times</Button>
              </Slot>
              <Slot role="link" tabIndex={0} onClick={() => setLast("span")} data-testid="slot-span">
                Plain text child, so Slot renders a span
              </Slot>
            </XStack>
            <Paragraph size="$2" color="$color10" data-testid="slot-last">
              Last handler to run: {last}. The button's own onClick ran first, then the Slot's.
            </Paragraph>
          </YStack>
        );
      },
    },
    {
      title: "Your own asChild prop",
      description: "A component that renders a Slot instead of its Button when asked lets callers swap the element while keeping the behaviour.",
      render: () => {
        const [copied, setCopied] = useDemoState("slot.copied", "");
        function CopyButton({ asChild, text, children }: { asChild?: boolean; text: string; children?: VChild }) {
          const props = { onClick: () => setCopied(text), "aria-label": `Copy ${text}` };
          return asChild ? <Slot {...props}>{children}</Slot> : <Button size="$3" {...props}>{children}</Button>;
        }
        return (
          <YStack gap="$3" alignItems="flex-start">
            <XStack gap="$3" alignItems="center">
              <CopyButton text="npm i @jam/ui">Copy as a Button</CopyButton>
              <CopyButton text="pnpm add @jam/ui" asChild>
                <Anchor href="#" onClick={(e: Event) => e.preventDefault()} data-testid="slot-anchor">Copy as a link</Anchor>
              </CopyButton>
            </XStack>
            <Paragraph size="$2" color="$color10" data-testid="slot-copied">{copied ? `Copied “${copied}”` : "Nothing copied yet"}</Paragraph>
          </YStack>
        );
      },
    },
  ],
};
