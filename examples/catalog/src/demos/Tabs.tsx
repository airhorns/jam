import { h } from "@jam/core/jsx";
import { XStack, YStack, Tabs, Text, H5, Paragraph } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const panels = [
  { value: "profile", label: "Profile", body: "Edit your name, avatar and bio." },
  { value: "connections", label: "Connections", body: "Manage the accounts linked to yours." },
  { value: "notifications", label: "Notifications", body: "Choose what you get notified about." },
];

export const TabsDemos: ComponentDemos = {
  name: "Tabs",
  group: "Navigation",
  description: "One panel at a time, chosen from a row or column of tabs.",
  demos: [
    {
      title: "Controlled",
      description: "Arrow keys move between the tabs and select as they go.",
      render: () => {
        const [value, setValue] = useDemoState("tabs.value", "profile");
        return (
          <YStack gap="$space.3" width={420}>
            <Tabs value={value} onValueChange={setValue} data-testid="account-tabs">
              <Tabs.List aria-label="Manage your account">
                {panels.map((panel) => (
                  <Tabs.Tab key={panel.value} value={panel.value} data-testid={`tab-${panel.value}`}>
                    {panel.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {panels.map((panel) => (
                <Tabs.Content key={panel.value} value={panel.value} gap="$space.2">
                  <H5 margin={0}>{panel.label}</H5>
                  <Paragraph margin={0}>{panel.body}</Paragraph>
                </Tabs.Content>
              ))}
            </Tabs>
            <Text opacity={0.6} data-testid="tabs-value">
              {value}
            </Text>
          </YStack>
        );
      },
      shot: { click: "tab-connections" },
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.5" width={420}>
          {["$2", "$3", "$5"].map((size) => (
            <Tabs key={size} defaultValue="one" size={size}>
              <Tabs.List>
                <Tabs.Tab value="one">One</Tabs.Tab>
                <Tabs.Tab value="two">Two</Tabs.Tab>
                <Tabs.Tab value="three">Three</Tabs.Tab>
              </Tabs.List>
              <Tabs.Content value="one">
                <Text>Size {size}</Text>
              </Tabs.Content>
              <Tabs.Content value="two">
                <Text>Two</Text>
              </Tabs.Content>
              <Tabs.Content value="three">
                <Text>Three</Text>
              </Tabs.Content>
            </Tabs>
          ))}
        </YStack>
      ),
    },
    {
      title: "Vertical, manual activation and disabled",
      description: "In manual mode the arrows only move focus; Space or Enter selects.",
      render: () => (
        <XStack gap="$space.6" alignItems="flex-start">
          <Tabs defaultValue="general" orientation="vertical" activationMode="manual" width={380} height={150}>
            <Tabs.List aria-label="Settings">
              <Tabs.Tab value="general">General</Tabs.Tab>
              <Tabs.Tab value="security">Security</Tabs.Tab>
              <Tabs.Tab value="billing" disabled>
                Billing
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Content value="general">
              <Text>General settings</Text>
            </Tabs.Content>
            <Tabs.Content value="security">
              <Text>Security settings</Text>
            </Tabs.Content>
            <Tabs.Content value="billing">
              <Text>Billing</Text>
            </Tabs.Content>
          </Tabs>
        </XStack>
      ),
    },
    {
      title: "Themed",
      render: () => (
        <YStack gap="$space.5" width={420}>
          {["blue", "green", "red"].map((theme) => (
            <Tabs key={theme} theme={theme} defaultValue="live" size="$3">
              <Tabs.List>
                <Tabs.Tab value="live">Live</Tabs.Tab>
                <Tabs.Tab value="draft">Draft</Tabs.Tab>
              </Tabs.List>
              <Tabs.Content value="live">
                <Text>{theme}</Text>
              </Tabs.Content>
              <Tabs.Content value="draft">
                <Text>Draft</Text>
              </Tabs.Content>
            </Tabs>
          ))}
        </YStack>
      ),
    },
  ],
};
