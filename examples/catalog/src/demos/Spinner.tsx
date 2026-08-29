import { h } from "@jam/core/jsx";
import { XStack, YStack, Spinner, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const SpinnerDemos: ComponentDemos = {
  name: "Spinner",
  group: "Feedback",
  description: "An indeterminate loading ring. `size` takes \"small\", \"large\" or a size token; `color` tints the leading arc.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.5" alignItems="center">
          <Spinner size="small" />
          <Spinner size="large" />
          {["$2", "$4", "$6", "$8"].map((size) => (
            <Spinner key={size} size={size} />
          ))}
        </XStack>
      ),
    },
    {
      title: "Colors",
      render: () => (
        <XStack gap="$space.5" alignItems="center">
          <Spinner size="large" />
          <Spinner size="large" color="$blue9" />
          <Spinner size="large" color="$green9" />
          <Spinner size="large" color="$red9" />
          <Spinner size="large" theme="accent" />
        </XStack>
      ),
    },
    {
      title: "In context",
      render: () => (
        <YStack gap="$space.4" alignItems="flex-start">
          <Button disabled>
            <Spinner size="small" />
            Saving…
          </Button>
          <XStack gap="$space.3" alignItems="center">
            <Spinner size="small" />
            <Text opacity={0.6}>Loading messages</Text>
          </XStack>
          <XStack
            width={280}
            height={80}
            alignItems="center"
            justifyContent="center"
            bordered
            borderRadius="$radius.4"
            backgroundColor="$background"
          >
            <Spinner size="large" />
          </XStack>
        </YStack>
      ),
    },
  ],
};
