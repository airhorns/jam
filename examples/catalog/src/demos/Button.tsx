import { h } from "@jam/core/jsx";
import { XStack, YStack, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const ButtonDemos: ComponentDemos = {
  name: "Button",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.3" alignItems="center" flexWrap="wrap">
          <Button size="1">Size 1</Button>
          <Button size="2">Size 2</Button>
          <Button size="3">Size 3</Button>
          <Button size="4">Size 4</Button>
          <Button size="5">Size 5</Button>
        </XStack>
      ),
    },
    {
      title: "Variants",
      render: () => (
        <XStack gap="$space.3" alignItems="center" flexWrap="wrap">
          <Button>Default</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="ghost">Ghost</Button>
          <Button theme="accent">Accent</Button>
          <Button disabled>Disabled</Button>
        </XStack>
      ),
    },
    {
      title: "With icon and text",
      render: () => (
        <XStack gap="$space.3" alignItems="center" flexWrap="wrap">
          <Button>
            <Button.Icon>★</Button.Icon>
            <Button.Text>Starred</Button.Text>
          </Button>
          <Button iconAfter="→">Next</Button>
          <Button circular size="4">+</Button>
        </XStack>
      ),
    },
    {
      title: "Click handling",
      render: () => {
        const [count, setCount] = useDemoState("button.count", 0);
        return (
          <XStack gap="$space.3" alignItems="center">
            <Button onClick={() => setCount(count + 1)} data-testid="counter-button">Clicked {count} times</Button>
            <Button variant="outlined" onClick={() => setCount(0)}>Reset</Button>
            <Text opacity={0.6} data-testid="counter-value">{count}</Text>
          </XStack>
        );
      },
    },
  ],
};
