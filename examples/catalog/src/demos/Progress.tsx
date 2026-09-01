import { h } from "@jam/core/jsx";
import { XStack, YStack, Progress, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ProgressDemos: ComponentDemos = {
  name: "Progress",
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
      title: "Values",
      render: () => (
        <YStack gap="$space.4" width={320}>
          {[0, 25, 50, 75, 100].map((value) => (
            <XStack key={value} gap="$space.3" alignItems="center">
              <Progress value={value} flexGrow={1}><Progress.Indicator /></Progress>
              <Text fontSize="$2" opacity={0.6} width={36}>{value}%</Text>
            </XStack>
          ))}
        </YStack>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.4" width={320}>
          {["$1", "$2", "$3", "$4", "$6"].map((size) => (
            <Progress key={size} size={size} value={60} width="100%" minWidth={0}><Progress.Indicator /></Progress>
          ))}
        </YStack>
      ),
    },
    {
      title: "Indeterminate",
      description: "No value: the indicator narrows and sweeps across the track.",
      render: () => (
        <Progress width={320}><Progress.Indicator /></Progress>
      ),
    },
    {
      title: "Themed",
      description: "A theme on the track recolours both parts; a theme on the indicator recolours only the fill.",
      render: () => (
        <YStack gap="$space.4" width={380}>
          <XStack gap="$space.3" alignItems="center">
            <Progress value={70} flexGrow={1}><Progress.Indicator /></Progress>
            <Text fontSize="$1" opacity={0.6} width={110}>default</Text>
          </XStack>
          <XStack gap="$space.3" alignItems="center">
            <Progress value={70} flexGrow={1}><Progress.Indicator theme="accent" /></Progress>
            <Text fontSize="$1" opacity={0.6} width={110}>accent fill</Text>
          </XStack>
          <XStack gap="$space.3" alignItems="center">
            <Progress value={70} theme="accent" flexGrow={1}><Progress.Indicator /></Progress>
            <Text fontSize="$1" opacity={0.6} width={110}>accent track</Text>
          </XStack>
          <XStack gap="$space.3" alignItems="center">
            <Progress value={70} flexGrow={1}><Progress.Indicator backgroundColor="$green9" /></Progress>
            <Text fontSize="$1" opacity={0.6} width={110}>$green9 fill</Text>
          </XStack>
          <XStack gap="$space.3" alignItems="center">
            <Progress value={70} height={6} borderRadius="$radius.2" flexGrow={1}><Progress.Indicator /></Progress>
            <Text fontSize="$1" opacity={0.6} width={110}>height 6</Text>
          </XStack>
        </YStack>
      ),
    },
  ],
};
