import { h } from "@jam/core/jsx";
import { XStack, YStack, XGroup, YGroup, Button, Input, Separator, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const GroupDemos: ComponentDemos = {
  name: "Group",
  group: "Layout",
  description: "XGroup and YGroup join children into one control, squaring off the interior corners and collapsing adjacent borders. Wrap each child in Group.Item.",
  demos: [
    {
      title: "XGroup of buttons",
      render: () => (
        <XGroup bordered separator={<Separator vertical />}>
          <XGroup.Item><Button variant="ghost">First</Button></XGroup.Item>
          <XGroup.Item><Button variant="ghost">Second</Button></XGroup.Item>
          <XGroup.Item><Button variant="ghost">Third</Button></XGroup.Item>
        </XGroup>
      ),
    },
    {
      title: "YGroup with separators",
      render: () => (
        <YGroup width={240} bordered separator={<Separator />}>
          <YGroup.Item><Button variant="ghost" justifyContent="flex-start">Profile</Button></YGroup.Item>
          <YGroup.Item><Button variant="ghost" justifyContent="flex-start">Settings</Button></YGroup.Item>
          <YGroup.Item><Button variant="ghost" justifyContent="flex-start">Sign out</Button></YGroup.Item>
        </YGroup>
      ),
    },
    {
      title: "Sizes",
      description: "The group's `size` picks the radius its outer corners pass to the first and last item.",
      render: () => (
        <YStack gap="$space.3" alignItems="flex-start">
          {["$1", "$2", "$4", "$6"].map((size) => (
            <XGroup key={size} size={size} bordered>
              <XGroup.Item><Button size={size}>A</Button></XGroup.Item>
              <XGroup.Item><Button size={size}>B</Button></XGroup.Item>
              <XGroup.Item><Button size={size}>C</Button></XGroup.Item>
            </XGroup>
          ))}
        </YStack>
      ),
    },
    {
      title: "Mixed controls",
      render: () => (
        <XGroup bordered size="$4" width={360}>
          <XGroup.Item><Button variant="ghost">https://</Button></XGroup.Item>
          <XGroup.Item flexGrow={1}><Input placeholder="example.com" unstyled paddingHorizontal="$space.3" /></XGroup.Item>
          <XGroup.Item><Button theme="accent">Go</Button></XGroup.Item>
        </XGroup>
      ),
    },
    {
      title: "disablePassBorderRadius",
      description: "Each item keeps its own radius instead of inheriting the group's.",
      render: () => (
        <YStack gap="$space.4" alignItems="flex-start">
          <XGroup size="$6" bordered>
            <XGroup.Item><Button>Passed</Button></XGroup.Item>
            <XGroup.Item><Button>radius</Button></XGroup.Item>
          </XGroup>
          <XGroup size="$6" bordered disablePassBorderRadius>
            <XGroup.Item><Button>Own</Button></XGroup.Item>
            <XGroup.Item><Button>radius</Button></XGroup.Item>
          </XGroup>
          <Text fontSize="$2" opacity={0.6}>The lower group's buttons keep their own corners.</Text>
        </YStack>
      ),
    },
  ],
};
