import { h } from "@jam/core/jsx";
import { XStack, YStack, XGroup, YGroup, Button, Separator, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const GroupDemos: ComponentDemos = {
  name: "Group",
  group: "Layout",
  description: "XGroup and YGroup join children into one segmented control, collapsing inner borders and radii.",
  demos: [
    {
      title: "XGroup of buttons",
      render: () => (
        <XGroup>
          <XGroup.Item><Button>First</Button></XGroup.Item>
          <XGroup.Item><Button>Second</Button></XGroup.Item>
          <XGroup.Item><Button>Third</Button></XGroup.Item>
        </XGroup>
      ),
    },
    {
      title: "YGroup with separators",
      render: () => (
        <YGroup width={240} bordered separator={<Separator />}>
          <YGroup.Item><Button variant="ghost" justifyContent="flex-start" borderRadius={0}>Profile</Button></YGroup.Item>
          <YGroup.Item><Button variant="ghost" justifyContent="flex-start" borderRadius={0}>Settings</Button></YGroup.Item>
          <YGroup.Item><Button variant="ghost" justifyContent="flex-start" borderRadius={0}>Sign out</Button></YGroup.Item>
        </YGroup>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.3" alignItems="flex-start">
          {["1", "2", "3", "4"].map((size) => (
            <XGroup key={size} size={size}>
              <XGroup.Item><Button size={size}>A</Button></XGroup.Item>
              <XGroup.Item><Button size={size}>B</Button></XGroup.Item>
              <XGroup.Item><Button size={size}>C</Button></XGroup.Item>
            </XGroup>
          ))}
        </YStack>
      ),
    },
  ],
};
