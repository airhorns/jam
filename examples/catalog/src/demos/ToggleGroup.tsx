import { h } from "@jam/core/jsx";
import { XStack, YStack, ToggleGroup, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ToggleGroupDemos: ComponentDemos = {
  name: "ToggleGroup",
  group: "Forms",
  description: "Joined toggle buttons that read as one segmented control.",
  demos: [
    {
      title: "Single",
      description: "Pressing the active item again clears the selection.",
      render: () => {
        const [value, setValue] = useDemoState("toggle.align", "left");
        return (
          <YStack gap="$space.3">
            <ToggleGroup type="single" value={value} onValueChange={setValue} data-testid="align-group">
              <ToggleGroup.Item value="left" aria-label="Align left" data-testid="align-left">
                Left
              </ToggleGroup.Item>
              <ToggleGroup.Item value="center" aria-label="Align center" data-testid="align-center">
                Center
              </ToggleGroup.Item>
              <ToggleGroup.Item value="right" aria-label="Align right" data-testid="align-right">
                Right
              </ToggleGroup.Item>
            </ToggleGroup>
            <Text opacity={0.6} data-testid="align-value">
              {value || "none"}
            </Text>
          </YStack>
        );
      },
      shot: { click: "align-center" },
    },
    {
      title: "Multiple",
      render: () => (
        <ToggleGroup type="multiple" defaultValue={["bold"]} size="$3">
          <ToggleGroup.Item value="bold" aria-label="Bold" fontWeight="700">
            B
          </ToggleGroup.Item>
          <ToggleGroup.Item value="italic" aria-label="Italic" fontStyle="italic">
            I
          </ToggleGroup.Item>
          <ToggleGroup.Item value="underline" aria-label="Underline" textDecorationLine="underline">
            U
          </ToggleGroup.Item>
        </ToggleGroup>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.4" alignItems="flex-start">
          {["$2", "$3", "$4", "$5"].map((size) => (
            <ToggleGroup key={size} type="single" defaultValue="day" size={size}>
              <ToggleGroup.Item value="day">Day</ToggleGroup.Item>
              <ToggleGroup.Item value="week">Week</ToggleGroup.Item>
              <ToggleGroup.Item value="month">Month</ToggleGroup.Item>
            </ToggleGroup>
          ))}
        </YStack>
      ),
    },
    {
      title: "Vertical, themed and disabled",
      render: () => (
        <XStack gap="$space.6" alignItems="flex-start">
          <ToggleGroup type="single" defaultValue="b" orientation="vertical" size="$3">
            <ToggleGroup.Item value="a">Option A</ToggleGroup.Item>
            <ToggleGroup.Item value="b">Option B</ToggleGroup.Item>
            <ToggleGroup.Item value="c">Option C</ToggleGroup.Item>
          </ToggleGroup>
          <YStack gap="$space.4">
            <ToggleGroup type="single" defaultValue="a" size="$3" theme="blue">
              <ToggleGroup.Item value="a">Blue</ToggleGroup.Item>
              <ToggleGroup.Item value="b">Theme</ToggleGroup.Item>
            </ToggleGroup>
            <ToggleGroup type="single" defaultValue="a" size="$3" disabled>
              <ToggleGroup.Item value="a">Disabled</ToggleGroup.Item>
              <ToggleGroup.Item value="b">Group</ToggleGroup.Item>
            </ToggleGroup>
            <ToggleGroup type="single" defaultValue="a" size="$3">
              <ToggleGroup.Item value="a">One</ToggleGroup.Item>
              <ToggleGroup.Item value="b" disabled>
                Item
              </ToggleGroup.Item>
            </ToggleGroup>
          </YStack>
        </XStack>
      ),
    },
  ],
};
