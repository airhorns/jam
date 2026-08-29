import { h } from "@jam/core/jsx";
import { XStack, YStack, RadioGroup, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const options = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

export const RadioGroupDemos: ComponentDemos = {
  name: "RadioGroup",
  group: "Forms",
  demos: [
    {
      title: "Vertical (controlled)",
      render: () => {
        const [value, setValue] = useDemoState("radio.value", "md");
        return (
          <YStack gap="$space.3">
            <RadioGroup value={value} onValueChange={setValue} data-testid="size-radio">
              {options.map((o) => (
                <XStack key={o.value} gap="$space.3" alignItems="center">
                  <RadioGroup.Item value={o.value} id={`radio-${o.value}`}>
                    <RadioGroup.Indicator />
                  </RadioGroup.Item>
                  <Label htmlFor={`radio-${o.value}`}>{o.label}</Label>
                </XStack>
              ))}
            </RadioGroup>
            <Text opacity={0.6} data-testid="radio-state">Selected: {value}</Text>
          </YStack>
        );
      },
    },
    {
      title: "Horizontal",
      render: () => (
        <RadioGroup defaultValue="sm" orientation="horizontal">
          {options.map((o) => (
            <XStack key={o.value} gap="$space.2" alignItems="center">
              <RadioGroup.Item value={o.value} id={`hradio-${o.value}`}><RadioGroup.Indicator /></RadioGroup.Item>
              <Label htmlFor={`hradio-${o.value}`}>{o.label}</Label>
            </XStack>
          ))}
        </RadioGroup>
      ),
    },
    {
      title: "Disabled",
      render: () => (
        <RadioGroup defaultValue="sm" disabled>
          {options.map((o) => (
            <XStack key={o.value} gap="$space.2" alignItems="center">
              <RadioGroup.Item value={o.value}><RadioGroup.Indicator /></RadioGroup.Item>
              <Label>{o.label}</Label>
            </XStack>
          ))}
        </RadioGroup>
      ),
    },
  ],
};
