import { h } from "@jam/core/jsx";
import { XStack, YStack, Checkbox, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const Check = () => <span>✓</span>;

export const CheckboxDemos: ComponentDemos = {
  name: "Checkbox",
  group: "Forms",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.4" alignItems="center">
          {["1", "2", "3", "4", "5"].map((size) => (
            <Checkbox key={size} size={size} checked>
              <Checkbox.Indicator><Check /></Checkbox.Indicator>
            </Checkbox>
          ))}
        </XStack>
      ),
    },
    {
      title: "Controlled with label",
      render: () => {
        const [checked, setChecked] = useDemoState("checkbox.checked", false);
        return (
          <XStack gap="$space.3" alignItems="center">
            <Checkbox id="terms" checked={checked} onCheckedChange={setChecked} data-testid="terms-checkbox">
              <Checkbox.Indicator><Check /></Checkbox.Indicator>
            </Checkbox>
            <Label htmlFor="terms">Accept terms and conditions</Label>
            <Text opacity={0.6} data-testid="terms-state">{checked ? "checked" : "unchecked"}</Text>
          </XStack>
        );
      },
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3">
          <XStack gap="$space.3" alignItems="center">
            <Checkbox checked={false}><Checkbox.Indicator><Check /></Checkbox.Indicator></Checkbox>
            <Text>Unchecked</Text>
          </XStack>
          <XStack gap="$space.3" alignItems="center">
            <Checkbox checked><Checkbox.Indicator><Check /></Checkbox.Indicator></Checkbox>
            <Text>Checked</Text>
          </XStack>
          <XStack gap="$space.3" alignItems="center">
            <Checkbox checked disabled><Checkbox.Indicator><Check /></Checkbox.Indicator></Checkbox>
            <Text>Disabled</Text>
          </XStack>
        </YStack>
      ),
    },
  ],
};
