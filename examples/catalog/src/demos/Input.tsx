import { h } from "@jam/core/jsx";
import { YStack, XStack, Input, TextArea, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const InputDemos: ComponentDemos = {
  name: "Input",
  group: "Forms",
  description: "Single-line Input and multi-line TextArea.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.3" maxWidth={360}>
          <Input size="1" placeholder="Size 1" />
          <Input size="2" placeholder="Size 2" />
          <Input size="3" placeholder="Size 3" />
          <Input size="4" placeholder="Size 4" />
        </YStack>
      ),
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3" maxWidth={360}>
          <Input placeholder="Placeholder text" />
          <Input value="With a value" />
          <Input disabled value="Disabled" />
          <Input type="password" value="secret" />
        </YStack>
      ),
    },
    {
      title: "With label",
      render: () => (
        <YStack gap="$space.2" maxWidth={360}>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
        </YStack>
      ),
    },
    {
      title: "Controlled",
      render: () => {
        const [value, setValue] = useDemoState("input.value", "");
        return (
          <YStack gap="$space.2" maxWidth={360}>
            <Input value={value} placeholder="Type something…" onInput={(e: Event) => setValue((e.target as HTMLInputElement).value)} data-testid="controlled-input" />
            <Text opacity={0.6} data-testid="controlled-value">{value.length} characters</Text>
          </YStack>
        );
      },
    },
    {
      title: "TextArea",
      render: () => (
        <XStack gap="$space.3" flexWrap="wrap">
          <TextArea placeholder="Write a message…" width={280} />
          <TextArea size="1" placeholder="Small" width={200} />
        </XStack>
      ),
    },
  ],
};
