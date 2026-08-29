import { h } from "@jam/core/jsx";
import { YStack, YGroup, ListItem, Separator, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const ListItemDemos: ComponentDemos = {
  name: "ListItem",
  group: "Content",
  demos: [
    {
      title: "In a group",
      render: () => (
        <YGroup width={320} bordered separator={<Separator />}>
          <YGroup.Item>
            <ListItem hoverTheme pressTheme title="Star" subTitle="Add to favourites" icon="★" iconAfter="›" />
          </YGroup.Item>
          <YGroup.Item>
            <ListItem hoverTheme pressTheme title="Moon" subTitle="Enable dark mode" icon="☾" iconAfter="›" />
          </YGroup.Item>
          <YGroup.Item>
            <ListItem hoverTheme pressTheme title="Settings" icon="⚙" iconAfter="›" />
          </YGroup.Item>
        </YGroup>
      ),
    },
    {
      title: "Composed children",
      render: () => (
        <YStack width={320} borderWidth={1} borderColor="$borderColor" borderRadius="$radius.4" overflow="hidden">
          <ListItem>
            <ListItem.Icon>✉</ListItem.Icon>
            <ListItem.Text>
              <ListItem.Title>Inbox</ListItem.Title>
              <ListItem.Subtitle>12 unread messages</ListItem.Subtitle>
            </ListItem.Text>
            <Text opacity={0.5}>12</Text>
          </ListItem>
          <Separator />
          <ListItem>
            <ListItem.Icon>✎</ListItem.Icon>
            <ListItem.Text>
              <ListItem.Title>Drafts</ListItem.Title>
            </ListItem.Text>
            <Text opacity={0.5}>3</Text>
          </ListItem>
        </YStack>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <YStack width={320} gap="$space.2">
          {["1", "2", "3", "4", "5"].map((size) => (
            <ListItem key={size} size={size} title={`Size ${size}`} subTitle="Subtitle" bordered borderRadius="$radius.3" />
          ))}
        </YStack>
      ),
    },
  ],
};
