import { h } from "@jam/core/jsx";
import { XStack, YStack, Separator, Spacer, ScrollView, Square, Circle, Text, VisuallyHidden, Button } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const SeparatorDemos: ComponentDemos = {
  name: "Separator",
  group: "Layout",
  description: "A one-pixel divider drawn with a border, so it always lands on the pixel grid.",
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
    {
      title: "Styled",
      render: () => (
        <YStack gap="$space.4" width={300}>
          <Separator />
          <Separator borderColor="$blue9" />
          <Separator borderBottomWidth={2} borderColor="$borderColorHover" />
          <Separator borderStyle="dashed" />
          <Separator width={80} flexGrow={0} alignSelf="center" />
        </YStack>
      ),
    },
  ],
};

export const SpacerDemos: ComponentDemos = {
  name: "Spacer",
  group: "Layout",
  description: "A gap sized from the space scale, or a flexible one that eats the remaining room.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.3" width={320}>
          {["$2", "$4", "$6", "$8"].map((size) => (
            <XStack key={size} alignItems="center" backgroundColor="$backgroundHover" borderRadius="$radius.3" padding="$space.2">
              <Square size={24} backgroundColor="$blue9" borderRadius="$radius.1" />
              <Spacer size={size} direction="horizontal" />
              <Square size={24} backgroundColor="$blue9" borderRadius="$radius.1" />
              <Spacer flex={1} />
              <Text fontSize="$2" opacity={0.6}>{size}</Text>
            </XStack>
          ))}
        </YStack>
      ),
    },
    {
      title: "Flexible",
      render: () => (
        <XStack width={320} backgroundColor="$backgroundHover" padding="$space.2" borderRadius="$radius.3">
          <Square size={32} backgroundColor="$blue9" borderRadius="$radius.1" />
          <Spacer flex={1} />
          <Square size={32} backgroundColor="$green9" borderRadius="$radius.1" />
          <Spacer flex={2} />
          <Square size={32} backgroundColor="$red9" borderRadius="$radius.1" />
        </XStack>
      ),
    },
    {
      title: "Vertical",
      render: () => (
        <YStack width={200} backgroundColor="$backgroundHover" padding="$space.2" borderRadius="$radius.3">
          <Text>Above</Text>
          <Spacer size="$6" direction="vertical" />
          <Text>Below</Text>
        </YStack>
      ),
    },
  ],
};

export const ScrollViewDemos: ComponentDemos = {
  name: "ScrollView",
  group: "Layout",
  description: "A scrolling viewport; `horizontal` scrolls the other way and lays children out in a row.",
  demos: [
    {
      title: "Vertical",
      render: () => (
        <ScrollView height={160} width={280} bordered borderRadius="$radius.3" padding="$space.3">
          <YStack gap="$space.2">
            {Array.from({ length: 20 }, (_, i) => <Text key={i}>Row {i + 1}</Text>)}
          </YStack>
        </ScrollView>
      ),
    },
    {
      title: "Horizontal",
      render: () => (
        <ScrollView horizontal width={280} bordered borderRadius="$radius.3" padding="$space.3" gap="$space.2">
          {Array.from({ length: 12 }, (_, i) => <Square key={i} size={56} backgroundColor="$blue9" borderRadius="$radius.2" />)}
        </ScrollView>
      ),
    },
    {
      title: "Without a scroll indicator",
      render: () => (
        <ScrollView
          horizontal
          showsScrollIndicator={false}
          width={280}
          bordered
          borderRadius="$radius.3"
          padding="$space.3"
          gap="$space.2"
        >
          {Array.from({ length: 12 }, (_, i) => <Circle key={i} size={44} backgroundColor="$green9" />)}
        </ScrollView>
      ),
    },
  ],
};

export const ShapesDemos: ComponentDemos = {
  name: "Shapes",
  group: "Layout",
  description: "Square and Circle are ThemeableStacks whose `size` sets both dimensions.",
  demos: [
    {
      title: "Size scale",
      render: () => (
        <XStack gap="$space.4" alignItems="center" flexWrap="wrap">
          {["$2", "$3", "$4", "$5", "$6"].map((size) => (
            <Square key={size} size={size} backgroundColor="$blue9" borderRadius="$radius.3">
              <Text color="white" fontSize="$1">{size}</Text>
            </Square>
          ))}
        </XStack>
      ),
    },
    {
      title: "Circle",
      render: () => (
        <XStack gap="$space.4" alignItems="center" flexWrap="wrap">
          {["$2", "$3", "$4", "$5", "$6"].map((size) => (
            <Circle key={size} size={size} backgroundColor="$green9" />
          ))}
          <Circle size="$6" bordered backgroundColor="transparent">
            <Text>◎</Text>
          </Circle>
        </XStack>
      ),
    },
    {
      title: "Shape variants",
      render: () => (
        <XStack gap="$space.5" alignItems="flex-start" flexWrap="wrap">
          {(
            [
              ["bordered", { bordered: true, borderRadius: "$radius.4" }],
              ["elevate", { bordered: true, elevate: true, borderRadius: "$radius.4" }],
              ["elevation $8", { bordered: true, elevation: "$8", borderRadius: "$radius.4" }],
              ["circular", { bordered: true, circular: true }],
              ["hoverTheme", { bordered: true, hoverTheme: true, pressTheme: true, borderRadius: "$radius.4" }],
            ] as const
          ).map(([label, props]) => (
            <YStack key={label} gap="$space.2" alignItems="center">
              <Square size="$6" backgroundColor="$background" {...props} />
              <Text fontSize="$2" opacity={0.6}>{label}</Text>
            </YStack>
          ))}
        </XStack>
      ),
    },
  ],
};

export const VisuallyHiddenDemos: ComponentDemos = {
  name: "VisuallyHidden",
  group: "Utilities",
  description: "Content for screen readers: still in the accessibility tree and the tab order, just not on screen.",
  demos: [
    {
      title: "Icon button with a hidden label",
      render: () => (
        <XStack gap="$space.3" alignItems="center">
          <Button circular size="3">
            ✕<VisuallyHidden>Close</VisuallyHidden>
          </Button>
          <Text opacity={0.6}>The word "Close" is in the DOM for screen readers but not visible.</Text>
        </XStack>
      ),
    },
    {
      title: "Variants",
      render: () => (
        <YStack gap="$space.3" width={360}>
          <XStack backgroundColor="$backgroundHover" borderRadius="$radius.3" padding="$space.2">
            <Text>default —</Text>
            <VisuallyHidden>takes no space at all</VisuallyHidden>
            <Text>no gap</Text>
          </XStack>
          <XStack backgroundColor="$backgroundHover" borderRadius="$radius.3" padding="$space.2">
            <Text>preserveDimensions —</Text>
            <VisuallyHidden preserveDimensions>reserves this width</VisuallyHidden>
            <Text>a gap</Text>
          </XStack>
          <XStack backgroundColor="$backgroundHover" borderRadius="$radius.3" padding="$space.2">
            <Text>visible —</Text>
            <VisuallyHidden visible>shown after all</VisuallyHidden>
          </XStack>
        </YStack>
      ),
    },
  ],
};
