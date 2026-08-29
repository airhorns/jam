import { h } from "@jam/core/jsx";
import { XStack, YStack, Tabs, Text, H5, Paragraph } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const TabsDemos: ComponentDemos = {
  name: "Tabs",
  group: "Navigation",
  demos: [
    {
      title: "Horizontal (controlled)",
      render: () => {
        const [value, setValue] = useDemoState("tabs.value", "tab1");
        return (
          <Tabs value={value} onValueChange={setValue} orientation="horizontal" width={400} data-testid="tabs">
            <Tabs.List aria-label="Manage your account">
              <Tabs.Tab value="tab1"><Text>Profile</Text></Tabs.Tab>
              <Tabs.Tab value="tab2"><Text>Connections</Text></Tabs.Tab>
              <Tabs.Tab value="tab3"><Text>Notifications</Text></Tabs.Tab>
            </Tabs.List>
            <Tabs.Content value="tab1" padding="$space.4">
              <H5>Profile</H5>
              <Paragraph margin={0}>Edit your name, avatar, and bio.</Paragraph>
            </Tabs.Content>
            <Tabs.Content value="tab2" padding="$space.4">
              <H5>Connections</H5>
              <Paragraph margin={0}>Manage linked accounts.</Paragraph>
            </Tabs.Content>
            <Tabs.Content value="tab3" padding="$space.4">
              <H5>Notifications</H5>
              <Paragraph margin={0}>Choose what you get notified about.</Paragraph>
            </Tabs.Content>
          </Tabs>
        );
      },
    },
    {
      title: "Vertical",
      render: () => (
        <Tabs defaultValue="tab1" orientation="vertical" width={400} height={160}>
          <Tabs.List aria-label="Vertical tabs">
            <Tabs.Tab value="tab1"><Text>General</Text></Tabs.Tab>
            <Tabs.Tab value="tab2"><Text>Security</Text></Tabs.Tab>
            <Tabs.Tab value="tab3" disabled><Text>Billing</Text></Tabs.Tab>
          </Tabs.List>
          <Tabs.Content value="tab1" padding="$space.4"><Text>General settings</Text></Tabs.Content>
          <Tabs.Content value="tab2" padding="$space.4"><Text>Security settings</Text></Tabs.Content>
          <Tabs.Content value="tab3" padding="$space.4"><Text>Billing</Text></Tabs.Content>
        </Tabs>
      ),
    },
  ],
};
