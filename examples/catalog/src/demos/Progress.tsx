import { h } from "@jam/core/jsx";
import { XStack, YStack, Progress, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ProgressDemos: ComponentDemos = {
  name: "Progress",
  group: "Feedback",
  demos: [
    {
      title: "Controlled",
      render: () => {
        const [value, setValue] = useDemoState("progress.value", 35);
        return (
          <YStack gap="$space.3" width={320}>
            <Progress value={value} max={100} data-testid="progress">
              <Progress.Indicator animation="bouncy" />
            </Progress>
            <XStack gap="$space.2" alignItems="center">
              <Button size="2" onClick={() => setValue(Math.max(0, value - 10))}>-10</Button>
              <Button size="2" onClick={() => setValue(Math.min(100, value + 10))} data-testid="progress-inc">+10</Button>
              <Text opacity={0.6} data-testid="progress-value">{value}%</Text>
            </XStack>
          </YStack>
        );
      },
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.4" width={320}>
          {["1", "2", "3", "4"].map((size) => (
            <Progress key={size} size={size} value={60}><Progress.Indicator /></Progress>
          ))}
        </YStack>
      ),
    },
    {
      title: "Indeterminate",
      render: () => (
        <Progress width={320}><Progress.Indicator /></Progress>
      ),
    },
  ],
};
