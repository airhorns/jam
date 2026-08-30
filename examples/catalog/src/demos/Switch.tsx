import { h } from "@jam/core/jsx";
import { XStack, YStack, Switch, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SwitchDemos: ComponentDemos = {
  name: "Switch",
  group: "Forms",
  description: "A role=switch button whose thumb slides one track height when on.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.4">
          <XStack gap="$space.4" alignItems="center">
            {["$1", "$2", "$3", "$4", "$5", "$6"].map((size) => (
              <Switch key={size} size={size}>
                <Switch.Thumb />
              </Switch>
            ))}
          </XStack>
          <XStack gap="$space.4" alignItems="center">
            {["$1", "$2", "$3", "$4", "$5", "$6"].map((size) => (
              <Switch key={size} size={size} checked>
                <Switch.Thumb />
              </Switch>
            ))}
          </XStack>
        </YStack>
      ),
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3">
          {[
            { label: "Off", checked: false },
            { label: "On", checked: true },
            { label: "Disabled off", checked: false, disabled: true },
            { label: "Disabled on", checked: true, disabled: true },
          ].map(({ label, checked, disabled }) => (
            <XStack key={label} gap="$space.3" alignItems="center">
              <Switch checked={checked} disabled={disabled}>
                <Switch.Thumb />
              </Switch>
              <Text>{label}</Text>
            </XStack>
          ))}
        </YStack>
      ),
    },
    {
      title: "Themed",
      description: "theme recolours the track and thumb together.",
      render: () => (
        <XStack gap="$space.4" alignItems="center">
          {["blue", "green", "orange", "red", "purple"].map((theme) => (
            <Switch key={theme} theme={theme} checked>
              <Switch.Thumb />
            </Switch>
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
            <Switch id="airplane" checked={on} onCheckedChange={setOn} data-testid="airplane-switch">
              <Switch.Thumb />
            </Switch>
            <Label htmlFor="airplane">Airplane mode</Label>
            <Text opacity={0.6} data-testid="airplane-state">
              {on ? "on" : "off"}
            </Text>
          </XStack>
        );
      },
      shot: { click: "airplane-switch" },
    },
  ],
};
