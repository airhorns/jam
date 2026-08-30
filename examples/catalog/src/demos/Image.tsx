import { h } from "@jam/core/jsx";
import { XStack, YStack, Image, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

const landscape =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#fef3c7"/></linearGradient></defs><rect width="400" height="200" fill="url(#s)"/><circle cx="320" cy="60" r="30" fill="#fde047"/><path d="M0 200 L120 90 L200 160 L280 100 L400 200 Z" fill="#16a34a"/></svg>`,
  );

export const ImageDemos: ComponentDemos = {
  name: "Image",
  group: "Content",
  description: "A styled `img`: every style prop works, plus `object-fit` under its CSS name and the React-Native `resizeMode` spelling.",
  demos: [
    {
      title: "Sized",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap" alignItems="flex-start">
          <Image src={landscape} width={200} height={100} alt="Landscape" />
          <Image src={landscape} width={100} height={100} borderRadius="$radius.4" alt="Square crop" />
          <Image src={landscape} width={100} height={100} borderRadius={1000} alt="Circle crop" />
          <Image src={landscape} width={160} aspectRatio={16 / 9} alt="By aspect ratio" />
        </XStack>
      ),
    },
    {
      title: "objectFit",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap">
          {(["cover", "contain", "fill", "none", "scale-down"] as const).map((fit) => (
            <YStack key={fit} gap="$space.2" alignItems="center">
              <Image src={landscape} width={120} height={120} objectFit={fit} backgroundColor="$backgroundHover" alt="" />
              <Text fontSize="$2" opacity={0.6}>{fit}</Text>
            </YStack>
          ))}
        </XStack>
      ),
    },
    {
      title: "resizeMode",
      description: "The React-Native spelling, mapped onto real object-fit values.",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap">
          {(["cover", "contain", "stretch", "center"] as const).map((mode) => (
            <YStack key={mode} gap="$space.2" alignItems="center">
              <Image src={landscape} width={120} height={120} resizeMode={mode} backgroundColor="$backgroundHover" alt="" />
              <Text fontSize="$2" opacity={0.6}>{mode}</Text>
            </YStack>
          ))}
        </XStack>
      ),
    },
    {
      title: "Styled",
      render: () => (
        <XStack gap="$space.4" flexWrap="wrap" alignItems="flex-start">
          <Image src={landscape} width={140} height={90} borderRadius="$radius.4" bordered alt="" />
          <Image src={landscape} width={140} height={90} borderRadius="$radius.4" opacity={0.5} alt="" />
          <Image src={landscape} width={140} height={90} borderRadius="$radius.4" elevation="$6" alt="" />
        </XStack>
      ),
    },
  ],
};
