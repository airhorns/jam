import { h } from "@jam/core/jsx";
import { XStack, YStack, Separator, Spacer, ScrollView, Square, Circle, Text, VisuallyHidden, Button } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const SeparatorDemos: ComponentDemos = {
  name: "Separator",
  group: "Layout",
  demos: [
    {
      title: "Horizontal and vertical",
      render: () => (
        <YStack gap="$space.3" width={300}>
          <Text>Above</Text>
          <Separator />
          <Text>Below</Text>
          <XStack gap="$space.3" alignItems="center" height={24}>
            <Text>Left</Text>
            <Separator vertical />
            <Text>Right</Text>
          </XStack>
        </YStack>
      ),
    },
  ],
};

export const SpacerDemos: ComponentDemos = {
  name: "Spacer",
  group: "Layout",
  demos: [
    {
      title: "Fixed and flexible",
      render: () => (
        <YStack gap="$space.3" width={320}>
          <XStack backgroundColor="$backgroundHover" padding="$space.2" borderRadius="$radius.3">
            <Square size={32} backgroundColor="$blue9" />
            <Spacer size="$space.6" />
            <Square size={32} backgroundColor="$blue9" />
            <Spacer flex={1} />
            <Square size={32} backgroundColor="$green9" />
          </XStack>
        </YStack>
      ),
    },
  ],
};

export const ScrollViewDemos: ComponentDemos = {
  name: "ScrollView",
  group: "Layout",
  demos: [
    {
      title: "Vertical",
      render: () => (
        <ScrollView height={160} width={280} borderWidth={1} borderColor="$borderColor" borderRadius="$radius.3" padding="$space.3">
          <YStack gap="$space.2">
            {Array.from({ length: 20 }, (_, i) => <Text key={i}>Row {i + 1}</Text>)}
          </YStack>
        </ScrollView>
      ),
    },
    {
      title: "Horizontal",
      render: () => (
        <ScrollView horizontal width={280} borderWidth={1} borderColor="$borderColor" borderRadius="$radius.3" padding="$space.3">
          <XStack gap="$space.2">
            {Array.from({ length: 12 }, (_, i) => <Square key={i} size={56} backgroundColor="$blue9" borderRadius="$radius.2" />)}
          </XStack>
        </ScrollView>
      ),
    },
  ],
};

export const ShapesDemos: ComponentDemos = {
  name: "Shapes",
  group: "Layout",
  description: "Square and Circle are Stacks with a single `size` prop.",
  demos: [
    {
      title: "Square and Circle",
      render: () => (
        <XStack gap="$space.4" alignItems="center">
          <Square size={40} backgroundColor="$blue9" borderRadius="$radius.2" />
          <Square size={64} backgroundColor="$green9" borderRadius="$radius.4" />
          <Circle size={40} backgroundColor="$red9" />
          <Circle size={64} backgroundColor="$yellow9" />
          <Circle size={64} borderWidth={2} borderColor="$borderColor" alignItems="center" justifyContent="center">
            <Text>◎</Text>
          </Circle>
        </XStack>
      ),
    },
  ],
};

export const VisuallyHiddenDemos: ComponentDemos = {
  name: "VisuallyHidden",
  group: "Utilities",
  demos: [
    {
      title: "Icon button with hidden label",
      render: () => (
        <XStack gap="$space.3" alignItems="center">
          <Button circular size="3">
            ✕<VisuallyHidden>Close</VisuallyHidden>
          </Button>
          <Text opacity={0.6}>The word "Close" is in the DOM for screen readers but not visible.</Text>
        </XStack>
      ),
    },
  ],
};
