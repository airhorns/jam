import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, Portal, Button, Card, Paragraph, SizableText } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

function ClippedCard({ children }: { children?: VChild }) {
  return (
    <Card bordered overflow="hidden" width={280} height={120} padding="$3" position="relative">
      <YStack gap="$2">{children}</YStack>
    </Card>
  );
}

export const PortalDemos: ComponentDemos = {
  name: "Portal",
  demos: [
    {
      title: "Escaping a clipped ancestor",
      description: "Both banners are children of the clipped card; only the portalled one is visible in full.",
      shot: { click: "portal-toggle" },
      render: () => {
        const [open, setOpen] = useDemoState("portal.open", false);
        return (
          <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
            <ClippedCard>
              <SizableText fontWeight="600">In place</SizableText>
              <Paragraph size="$2" color="$color10">The card has overflow: hidden, so this banner is cut off.</Paragraph>
              {open ? (
                <YStack position="absolute" top={80} left={16} width={320} padding="$3" borderRadius="$radius.3" backgroundColor="$red9" data-testid="portal-inplace">
                  <SizableText color="white" fontWeight="600">Rendered in place: clipped by the card</SizableText>
                </YStack>
              ) : null}
            </ClippedCard>
            <ClippedCard>
              <SizableText fontWeight="600">Through a Portal</SizableText>
              <Paragraph size="$2" color="$color10">Same card, but the banner renders at the mount root.</Paragraph>
              {open ? (
                <Portal>
                  <YStack position="fixed" right={24} bottom={24} zIndex={100_000} padding="$3" borderRadius="$radius.3" backgroundColor="$green9" role="status" data-testid="portal-banner">
                    <SizableText color="white" fontWeight="600">Rendered through a Portal: escapes the card</SizableText>
                  </YStack>
                </Portal>
              ) : null}
            </ClippedCard>
            <Button size="$3" onClick={() => setOpen(!open)} aria-pressed={open ? "true" : "false"} data-testid="portal-toggle">
              {open ? "Hide banners" : "Show banners"}
            </Button>
          </XStack>
        );
      },
    },
  ],
};
