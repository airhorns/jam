import { h } from "@jam/core/jsx";
import { Stack, ThemeableStack, XStack, YStack, ZStack, Square, SizableText, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

const Box = ({ label, color }: { label: string; color: string }) => (
  <Square size={56} backgroundColor={color} borderRadius="$radius.3">
    <Text color="white" fontWeight="600">{label}</Text>
  </Square>
);

export const StacksDemos: ComponentDemos = {
  name: "Stacks",
  group: "Layout",
  description:
    "Stack is a flexbox reset; XStack and YStack pin the direction, ZStack layers its children, and ThemeableStack adds the theme-reactive variants everything else extends.",
  demos: [
    {
      title: "XStack",
      render: () => (
        <XStack gap="$space.4">
          <Box label="1" color="$blue9" />
          <Box label="2" color="$green9" />
          <Box label="3" color="$red9" />
        </XStack>
      ),
    },
    {
      title: "YStack",
      render: () => (
        <YStack gap="$space.4">
          <Box label="1" color="$blue9" />
          <Box label="2" color="$green9" />
          <Box label="3" color="$red9" />
        </YStack>
      ),
    },
    {
      title: "ZStack",
      description: "Each child fills the stack, so it positions against the stack's box.",
      render: () => (
        <ZStack width={140} height={140}>
          <Square position="absolute" top={0} left={0} size={90} backgroundColor="$blue9" borderRadius="$radius.4" />
          <Square position="absolute" top={25} left={25} size={90} backgroundColor="$green9" borderRadius="$radius.4" opacity={0.9} />
          <Square position="absolute" top={50} left={50} size={90} backgroundColor="$red9" borderRadius="$radius.4" opacity={0.8} />
        </ZStack>
      ),
    },
    {
      title: "Alignment & wrapping",
      render: () => (
        <YStack gap="$space.4">
          <XStack gap="$space.2" justifyContent="space-between" backgroundColor="$backgroundHover" padding="$space.3" borderRadius="$radius.3">
            <Box label="a" color="$blue9" />
            <Box label="b" color="$blue9" />
            <Box label="c" color="$blue9" />
          </XStack>
          <XStack gap="$space.2" flexWrap="wrap" width={200} backgroundColor="$backgroundHover" padding="$space.3" borderRadius="$radius.3">
            {Array.from({ length: 6 }, (_, i) => <Box label={String(i + 1)} color="$green9" />)}
          </XStack>
          <Stack alignItems="center" justifyContent="center" height={100} backgroundColor="$backgroundHover" borderRadius="$radius.3">
            <Text>centered in a plain Stack</Text>
          </Stack>
        </YStack>
      ),
    },
    {
      title: "Shape variants",
      description: "Shared by every stack: bordered, elevate, elevation, circular, transparent, chromeless.",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap">
          <YStack bordered padding="$space.4" borderRadius="$radius.4"><Text>bordered</Text></YStack>
          <YStack bordered elevate padding="$space.4" borderRadius="$radius.4" backgroundColor="$background"><Text>elevate</Text></YStack>
          <YStack bordered elevation="$6" padding="$space.4" borderRadius="$radius.4" backgroundColor="$background"><Text>elevation $6</Text></YStack>
          <YStack bordered={2} padding="$space.4" borderRadius="$radius.4"><Text>bordered 2px</Text></YStack>
        </XStack>
      ),
    },
    {
      title: "ThemeableStack",
      description: "backgrounded, radiused, padded and the hover/press/focus theme variants.",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap">
          <ThemeableStack backgrounded radiused padded bordered><SizableText>backgrounded radiused padded</SizableText></ThemeableStack>
          <ThemeableStack backgrounded radiused padded bordered hoverTheme pressTheme><SizableText>hoverTheme pressTheme</SizableText></ThemeableStack>
          <ThemeableStack backgrounded radiused padded bordered theme="accent"><SizableText>theme accent</SizableText></ThemeableStack>
        </XStack>
      ),
    },
  ],
};
