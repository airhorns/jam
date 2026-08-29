import { h } from "@jam/core/jsx";
import { XStack, YStack, Card, H4, Paragraph, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const CardDemos: ComponentDemos = {
  name: "Card",
  group: "Content",
  demos: [
    {
      title: "Basic",
      render: () => (
        <Card width={320} elevate>
          <Card.Header>
            <H4>Sony A7IV</H4>
            <Paragraph opacity={0.6} margin={0}>Now available</Paragraph>
          </Card.Header>
          <Card.Footer>
            <Button size="2">Purchase</Button>
          </Card.Footer>
        </Card>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap">
          {["1", "2", "3", "4", "5"].map((size) => (
            <Card key={size} size={size} width={140}>
              <Text>Size {size}</Text>
            </Card>
          ))}
        </XStack>
      ),
    },
    {
      title: "Variants",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap">
          <Card width={200} padding="$space.4"><Text>Default</Text></Card>
          <Card width={200} padding="$space.4" bordered={false}><Text>Not bordered</Text></Card>
          <Card width={200} padding="$space.4" elevate><Text>Elevated</Text></Card>
          <Card width={200} padding="$space.4" hoverStyle={{ borderColor: "$borderColorHover" }} pressStyle={{ backgroundColor: "$backgroundPress" }} cursor="pointer">
            <Text>Interactive</Text>
          </Card>
        </XStack>
      ),
    },
    {
      title: "With background",
      render: () => (
        <Card width={320} height={180} overflow="hidden">
          <Card.Background>
            <YStack width="100%" height="100%" backgroundColor="$blue9" />
          </Card.Background>
          <Card.Header zIndex={1}>
            <H4 color="white">Over a background</H4>
          </Card.Header>
        </Card>
      ),
    },
  ],
};
