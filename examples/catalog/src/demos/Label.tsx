import { h } from "@jam/core/jsx";
import { XStack, YStack, Label, Input, Checkbox } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const LabelDemos: ComponentDemos = {
  name: "Label",
  group: "Forms",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.2">
          {["1", "2", "3", "4", "5"].map((size) => <Label key={size} size={size}>Label size {size}</Label>)}
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
  ],
};
