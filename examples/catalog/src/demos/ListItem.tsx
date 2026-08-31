import { h } from "@jam/core/jsx";
import { YStack, YGroup, ListItem, Separator, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const ListItemDemos: ComponentDemos = {
  name: "ListItem",
  demos: [
    {
      title: "In a group",
      render: () => (
        <YGroup width={320} bordered role="list" separator={<Separator />}>
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
      description: "Wrap the title and subtitle in a YStack to stack them; anything else is laid out as a row.",
      render: () => (
        <YStack role="list" width={320} bordered borderRadius="$radius.4" overflow="hidden">
          <ListItem.Frame hoverTheme>
            <ListItem.Icon placement="before">✉</ListItem.Icon>
            <YStack flexGrow={1} flexShrink={1} minWidth={0}>
              <ListItem.Title>Inbox</ListItem.Title>
              <ListItem.Subtitle>12 unread messages</ListItem.Subtitle>
            </YStack>
            <Text opacity={0.5}>12</Text>
          </ListItem.Frame>
          <Separator />
          <ListItem.Frame hoverTheme>
            <ListItem.Icon placement="before">✎</ListItem.Icon>
            <YStack flexGrow={1} flexShrink={1} minWidth={0}>
              <ListItem.Title>Drafts</ListItem.Title>
            </YStack>
            <Text opacity={0.5}>3</Text>
          </ListItem.Frame>
        </YStack>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <YStack role="list" width={320} gap="$space.2">
          {["$2", "$3", "$4", "$5", "$6"].map((size) => (
            <ListItem key={size} size={size} title={`Size ${size}`} subTitle="Subtitle" variant="outlined" borderRadius="$radius.3" />
          ))}
        </YStack>
      ),
    },
    {
      title: "States",
      render: () => (
        <YStack role="list" width={320} gap="$space.2">
          <ListItem title="Default" hoverTheme pressTheme variant="outlined" borderRadius="$radius.3" />
          <ListItem title="Active" subTitle="The selected row" active variant="outlined" borderRadius="$radius.3" />
          <ListItem title="Disabled" disabled variant="outlined" borderRadius="$radius.3" />
          <ListItem title="A very long title that has to be truncated because it does not fit" iconAfter="›" variant="outlined" borderRadius="$radius.3" />
          <ListItem variant="outlined" borderRadius="$radius.3">Plain children</ListItem>
        </YStack>
      ),
    },
  ],
};
