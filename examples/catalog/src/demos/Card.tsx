import { h } from "@jam/core/jsx";
import { XStack, YStack, Card, H4, Paragraph, Button, SizableText } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const CardDemos: ComponentDemos = {
  name: "Card",
  demos: [
    {
      title: "Basic",
      render: () => (
        <Card width={320} size="$4" bordered elevate>
          <Card.Header>
            <H4 margin={0}>Sony A7IV</H4>
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
      description: "One `size` sets the corner radius and the header/footer padding together.",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap" alignItems="flex-start">
          {["$2", "$4", "$6", "$8"].map((size) => (
            <Card key={size} size={size} width={150} bordered elevate>
              <Card.Header>
                <SizableText>Size {size}</SizableText>
              </Card.Header>
            </Card>
          ))}
        </XStack>
      ),
    },
    {
      title: "Variants",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap" alignItems="flex-start">
          <Card width={190} size="$4"><Card.Header><SizableText>Plain</SizableText></Card.Header></Card>
          <Card width={190} size="$4" bordered><Card.Header><SizableText>bordered</SizableText></Card.Header></Card>
          <Card width={190} size="$4" bordered elevate><Card.Header><SizableText>bordered elevate</SizableText></Card.Header></Card>
          <Card width={190} size="$4" bordered elevation="$8"><Card.Header><SizableText>elevation $8</SizableText></Card.Header></Card>
          <Card width={190} size="$4" bordered hoverTheme pressTheme>
            <Card.Header><SizableText>hoverTheme pressTheme</SizableText></Card.Header>
          </Card>
          <Card width={190} size="$4" bordered elevate theme="accent">
            <Card.Header><SizableText>theme accent</SizableText></Card.Header>
          </Card>
        </XStack>
      ),
    },
    {
      title: "Header and footer",
      description: "The header sticks to the top and the footer to the bottom, however tall the card is.",
      render: () => (
        <Card width={320} height={220} size="$5" bordered elevate>
          <Card.Header>
            <H4 margin={0}>Deploy</H4>
            <Paragraph opacity={0.6} margin={0}>3 checks pending</Paragraph>
          </Card.Header>
          <Card.Footer gap="$space.3" justifyContent="flex-end">
            <Button size="2" variant="outlined">Cancel</Button>
            <Button size="2" theme="accent">Ship it</Button>
          </Card.Footer>
        </Card>
      ),
    },
    {
      title: "With a background",
      description: "Card.Background fills the card and inherits its radius.",
      render: () => (
        <Card width={320} height={180} size="$6" bordered elevate>
          <Card.Background>
            <YStack width="100%" height="100%" backgroundColor="$blue9" />
          </Card.Background>
          <Card.Header>
            <H4 color="white" margin={0}>Over a background</H4>
          </Card.Header>
        </Card>
      ),
    },
  ],
};
