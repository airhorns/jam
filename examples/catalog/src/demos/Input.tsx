import { h } from "@jam/core/jsx";
import { YStack, XStack, Input, TextArea, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const InputDemos: ComponentDemos = {
  name: "Input",
  group: "Forms",
  description: "Single-line Input and multi-line TextArea. One `size` sets height, radius, padding and font size together.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.3" maxWidth={360}>
          {["$1", "$2", "$3", "$4", "$5", "$6"].map((size) => (
            <Input key={size} size={size} placeholder={`Size ${size}`} />
          ))}
        </YStack>
      ),
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3" maxWidth={360}>
          <Input placeholder="Placeholder text" />
          <Input value="With a value" aria-label="With a value" />
          <Input disabled value="Disabled" aria-label="Disabled" />
          <Input readOnly value="Read only" aria-label="Read only" />
          <Input type="password" value="secret" aria-label="Password" />
          <Input unstyled placeholder="unstyled" paddingHorizontal="$space.3" height={44} />
        </YStack>
      ),
    },
    {
      title: "With a label",
      render: () => (
        <YStack gap="$space.2" maxWidth={360}>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
        </YStack>
      ),
    },
    {
      title: "onChangeText",
      render: () => {
        const [value, setValue] = useDemoState("input.value", "");
        return (
          <YStack gap="$space.2" maxWidth={360}>
            <Input value={value} placeholder="Type something…" onChangeText={setValue} data-testid="controlled-input" />
            <Text opacity={0.6} data-testid="controlled-value">{value.length} characters</Text>
          </YStack>
        );
      },
    },
    {
      title: "TextArea",
      description: "`rows` sets the minimum height; the field still grows with its content.",
      render: () => (
        <XStack gap="$space.3" flexWrap="wrap" alignItems="flex-start">
          <TextArea placeholder="Write a message…" width={280} />
          <TextArea size="$2" placeholder="Small, 2 rows" rows={2} width={200} />
          <TextArea rows={6} placeholder="Six rows" width={200} />
        </XStack>
      ),
    },
  ],
};
