import { h } from "@jam/core/jsx";
import { YStack, ToggleGroup, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ToggleGroupDemos: ComponentDemos = {
  name: "ToggleGroup",
  group: "Forms",
  demos: [
    {
      title: "Single",
      render: () => {
        const [value, setValue] = useDemoState("toggle.align", "left");
        return (
          <YStack gap="$space.3">
            <ToggleGroup type="single" value={value} onValueChange={(v) => setValue(String(v))} data-testid="align-group">
              <ToggleGroup.Item value="left" aria-label="Align left">Left</ToggleGroup.Item>
              <ToggleGroup.Item value="center" aria-label="Align center">Center</ToggleGroup.Item>
              <ToggleGroup.Item value="right" aria-label="Align right">Right</ToggleGroup.Item>
            </ToggleGroup>
            <Text opacity={0.6} data-testid="align-value">{value}</Text>
          </YStack>
        );
      },
    },
    {
      title: "Multiple",
      render: () => (
        <ToggleGroup type="multiple" defaultValue={["bold"]}>
          <ToggleGroup.Item value="bold"><b>B</b></ToggleGroup.Item>
          <ToggleGroup.Item value="italic"><i>I</i></ToggleGroup.Item>
          <ToggleGroup.Item value="underline"><u>U</u></ToggleGroup.Item>
        </ToggleGroup>
      ),
    },
    {
      title: "Vertical & disabled",
      render: () => (
        <YStack gap="$space.4">
          <ToggleGroup type="single" defaultValue="b" orientation="vertical">
            <ToggleGroup.Item value="a">Option A</ToggleGroup.Item>
            <ToggleGroup.Item value="b">Option B</ToggleGroup.Item>
            <ToggleGroup.Item value="c">Option C</ToggleGroup.Item>
          </ToggleGroup>
          <ToggleGroup type="single" defaultValue="a" disabled>
            <ToggleGroup.Item value="a">A</ToggleGroup.Item>
            <ToggleGroup.Item value="b">B</ToggleGroup.Item>
          </ToggleGroup>
        </YStack>
      ),
    },
  ],
};
