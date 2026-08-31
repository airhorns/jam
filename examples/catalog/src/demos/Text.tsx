import { h } from "@jam/core/jsx";
import { YStack, XStack, Text, SizableText, Paragraph, Heading, H1, H2, H3, H4, H5, H6, Anchor } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const TextDemos: ComponentDemos = {
  name: "Text",
  group: "Typography",
  description: "Text, SizableText, Paragraph and the Heading family.",
  demos: [
    {
      title: "Headings",
      render: () => (
        <YStack gap="$space.2">
          <H1>Heading 1</H1>
          <H2>Heading 2</H2>
          <H3>Heading 3</H3>
          <H4>Heading 4</H4>
          <H5>Heading 5</H5>
          <H6>Heading 6</H6>
          <Heading>Heading (generic)</Heading>
        </YStack>
      ),
    },
    {
      title: "SizableText scale",
      render: () => (
        <YStack gap="$space.1">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((size) => (
            <XStack key={size} gap="$space.4" alignItems="baseline">
              <Text width={28} opacity={0.5} fontSize={11}>{size}</Text>
              <SizableText size={size}>The quick brown fox jumps over the lazy dog</SizableText>
            </XStack>
          ))}
        </YStack>
      ),
    },
    {
      title: "Paragraph",
      render: () => (
        <YStack gap="$space.3" maxWidth={520}>
          <Paragraph>
            Paragraph renders a <code>p</code> tag. It inherits the body font and can take any style prop.
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore
            et dolore magna aliqua.
          </Paragraph>
          <Paragraph opacity={0.6} fontSize={13}>
            Muted, smaller paragraph.
          </Paragraph>
        </YStack>
      ),
    },
    {
      title: "Inline styles",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap" alignItems="center">
          <Text fontWeight="700">Bold</Text>
          <Text fontStyle="italic">Italic</Text>
          <Text textDecorationLine="underline">Underline</Text>
          <Text textDecorationLine="line-through">Strike</Text>
          <Text color="$blue9">Colored</Text>
          <Text fontFamily="$mono">Monospace</Text>
          <Text textTransform="uppercase" letterSpacing={1}>Uppercase</Text>
          <Text numberOfLines={1} width={120}>Truncated to one line with ellipsis</Text>
        </XStack>
      ),
    },
    {
      title: "Anchor",
      description: "SizableText rendered as a link: the theme colour with the browser underline, unless styled away.",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap" alignItems="baseline">
          <Anchor href="#anchor">Default link</Anchor>
          <Anchor href="#anchor" size="$2" color="$color10">Small, muted</Anchor>
          <Anchor href="#anchor" textDecorationLine="none" color="$blue10" fontWeight="600">No underline</Anchor>
          <Anchor href="https://example.com" target="_blank" rel="noreferrer">Opens in a new tab ↗</Anchor>
        </XStack>
      ),
    },
  ],
};
