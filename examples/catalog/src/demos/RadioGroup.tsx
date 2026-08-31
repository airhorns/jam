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
  description: "One-of-many selection with native radio keyboard behaviour.",
  demos: [
    {
      title: "Vertical (controlled)",
      description: "Arrow keys move the selection and the focus together.",
      render: () => {
        const [value, setValue] = useDemoState("radio.value", "md");
        return (
          <YStack gap="$space.3">
            <RadioGroup value={value} onValueChange={setValue} data-testid="size-radio">
              {options.map((o) => (
                <XStack key={o.value} gap="$space.3" alignItems="center">
                  <RadioGroup.Item value={o.value} id={`radio-${o.value}`} data-testid={`radio-${o.value}`}>
                    <RadioGroup.Indicator />
                  </RadioGroup.Item>
                  <Label htmlFor={`radio-${o.value}`}>{o.label}</Label>
                </XStack>
              ))}
            </RadioGroup>
            <Text opacity={0.6} data-testid="radio-state">
              Selected: {value}
            </Text>
          </YStack>
        );
      },
      shot: { click: "radio-lg" },
    },
    {
      title: "Horizontal",
      render: () => (
        <RadioGroup defaultValue="sm" orientation="horizontal" gap="$space.5">
          {options.map((o) => (
            <XStack key={o.value} gap="$space.2" alignItems="center">
              <RadioGroup.Item value={o.value} id={`hradio-${o.value}`}>
                <RadioGroup.Indicator />
              </RadioGroup.Item>
              <Label htmlFor={`hradio-${o.value}`}>{o.label}</Label>
            </XStack>
          ))}
        </RadioGroup>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.5" alignItems="center">
          {["$2", "$3", "$4", "$5", "$6"].map((size) => (
            <RadioGroup key={size} defaultValue="on" size={size} orientation="horizontal" aria-label={`Size ${size}`}>
              <RadioGroup.Item value="on" aria-label="On">
                <RadioGroup.Indicator />
              </RadioGroup.Item>
              <RadioGroup.Item value="off" aria-label="Off">
                <RadioGroup.Indicator />
              </RadioGroup.Item>
            </RadioGroup>
          ))}
        </XStack>
      ),
    },
    {
      title: "Disabled",
      description: "A whole group, or one item inside an enabled group.",
      render: () => (
        <YStack gap="$space.4">
          <RadioGroup defaultValue="sm" orientation="horizontal" disabled>
            {options.map((o) => (
              <XStack key={o.value} gap="$space.2" alignItems="center">
                <RadioGroup.Item value={o.value} id={`dradio-${o.value}`}>
                  <RadioGroup.Indicator />
                </RadioGroup.Item>
                <Label htmlFor={`dradio-${o.value}`}>{o.label}</Label>
              </XStack>
            ))}
          </RadioGroup>
          <RadioGroup defaultValue="sm" orientation="horizontal">
            {options.map((o) => (
              <XStack key={o.value} gap="$space.2" alignItems="center">
                <RadioGroup.Item value={o.value} id={`iradio-${o.value}`} disabled={o.value === "lg"}>
                  <RadioGroup.Indicator />
                </RadioGroup.Item>
                <Label htmlFor={`iradio-${o.value}`}>{o.label}</Label>
              </XStack>
            ))}
          </RadioGroup>
        </YStack>
      ),
    },
  ],
};
