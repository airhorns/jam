import { h } from "@jam/core/jsx";
import { XStack, YStack, Switch, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SwitchDemos: ComponentDemos = {
  name: "Switch",
  group: "Forms",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.4" alignItems="center">
          {["1", "2", "3", "4", "5"].map((size) => (
            <Switch key={size} size={size} checked><Switch.Thumb /></Switch>
          ))}
        </XStack>
      ),
    },
    {
      title: "Controlled with label",
      render: () => {
        const [on, setOn] = useDemoState("switch.on", false);
        return (
          <XStack gap="$space.3" alignItems="center">
            <Switch id="airplane" checked={on} onCheckedChange={setOn} data-testid="airplane-switch"><Switch.Thumb /></Switch>
            <Label htmlFor="airplane">Airplane mode</Label>
            <Text opacity={0.6} data-testid="airplane-state">{on ? "on" : "off"}</Text>
          </XStack>
        );
      },
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3">
          <XStack gap="$space.3" alignItems="center"><Switch checked={false}><Switch.Thumb /></Switch><Text>Off</Text></XStack>
          <XStack gap="$space.3" alignItems="center"><Switch checked><Switch.Thumb /></Switch><Text>On</Text></XStack>
          <XStack gap="$space.3" alignItems="center"><Switch checked disabled><Switch.Thumb /></Switch><Text>Disabled</Text></XStack>
        </YStack>
      ),
    },
  ],
};
