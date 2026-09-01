import { h } from "@jam/core/jsx";
import { XStack, YStack, Label, Input, Checkbox, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const LabelDemos: ComponentDemos = {
  name: "Label",
  demos: [
    {
      title: "Sizes",
      description: "The line box is as tall as a control of the same size, so a label lines up beside an Input.",
      render: () => (
        <YStack gap="$space.2">
          {["$1", "$2", "$3", "$4", "$5", "$6"].map((size) => (
            <Label key={size} size={size}>Label size {size}</Label>
          ))}
        </YStack>
      ),
    },
    {
      title: "Associated controls",
      render: () => (
        <YStack gap="$space.4" maxWidth={320}>
          <YStack gap="$space.2">
            <Label htmlFor="lbl-input">Username</Label>
            <Input id="lbl-input" placeholder="Click the label to focus me" />
          </YStack>
          <XStack gap="$space.3" alignItems="center">
            <Checkbox id="lbl-check"><Checkbox.Indicator>✓</Checkbox.Indicator></Checkbox>
            <Label htmlFor="lbl-check">Clicking this label toggles the checkbox</Label>
          </XStack>
        </YStack>
      ),
    },
    {
      title: "Beside a field",
      render: () => (
        <XStack gap="$space.3" alignItems="center" maxWidth={420}>
          <Label htmlFor="lbl-inline" size="$4" width={80}>Port</Label>
          <Input id="lbl-inline" size="$4" flexGrow={1} value="5173" />
        </XStack>
      ),
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3" maxWidth={320}>
          <Label>Default</Label>
          <Label disabled>Disabled</Label>
          <Label fontWeight="600">Bold</Label>
          <XStack theme="accent" backgroundColor="$background" padding="$space.2" borderRadius="$radius.3" alignSelf="flex-start">
            <Label>On an accent surface</Label>
          </XStack>
          <XStack gap="$space.2" alignItems="baseline">
            <Label>Required</Label>
            <Text color="$red9">*</Text>
          </XStack>
        </YStack>
      ),
    },
  ],
};
