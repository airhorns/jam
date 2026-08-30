import { h } from "@jam/core/jsx";
import { XStack, YStack, Avatar, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

const photo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="38" r="18" fill="#fff" opacity="0.9"/><ellipse cx="50" cy="85" rx="30" ry="20" fill="#fff" opacity="0.9"/></svg>`,
  );

export const AvatarDemos: ComponentDemos = {
  name: "Avatar",
  group: "Content",
  description: "A fixed-size frame that clips its image. The fallback sits behind, so it shows through whenever the image is missing.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.3" alignItems="center" flexWrap="wrap">
          {["$2", "$3", "$4", "$5", "$6", "$7", "$8"].map((size) => (
            <Avatar key={size} size={size} circular>
              <Avatar.Image src={photo} alt="" />
              <Avatar.Fallback>JD</Avatar.Fallback>
            </Avatar>
          ))}
        </XStack>
      ),
    },
    {
      title: "Shapes",
      render: () => (
        <XStack gap="$space.4" alignItems="center" flexWrap="wrap">
          <Avatar size="$7" circular>
            <Avatar.Image src={photo} alt="" />
          </Avatar>
          <Avatar size="$7" borderRadius="$radius.4">
            <Avatar.Image src={photo} alt="" />
          </Avatar>
          <Avatar size="$7" circular bordered={2}>
            <Avatar.Image src={photo} alt="" />
          </Avatar>
          <Avatar size="$7" borderRadius="$radius.6">
            <Avatar.Image src={photo} alt="" objectFit="contain" />
          </Avatar>
        </XStack>
      ),
    },
    {
      title: "Fallbacks",
      description: "The fallback is what you see while the image loads, and if it never does.",
      render: () => (
        <XStack gap="$space.4" alignItems="center" flexWrap="wrap">
          <Avatar size="$7" circular>
            <Avatar.Fallback backgroundColor="$blue9" color="white">AB</Avatar.Fallback>
          </Avatar>
          <Avatar size="$7" circular>
            <Avatar.Image src="/does-not-exist.png" alt="" />
            <Avatar.Fallback backgroundColor="$green9" color="white" delayMs={300}>404</Avatar.Fallback>
          </Avatar>
          <Avatar size="$7" circular theme="accent">
            <Avatar.Fallback>TH</Avatar.Fallback>
          </Avatar>
          <Avatar size="$7" circular bordered>
            <Avatar.Fallback><Text fontSize="$6">☺</Text></Avatar.Fallback>
          </Avatar>
        </XStack>
      ),
    },
    {
      title: "In a row",
      render: () => (
        <XStack gap="$space.3" alignItems="center">
          <Avatar size="$5" circular>
            <Avatar.Image src={photo} alt="Ada Lovelace" />
            <Avatar.Fallback>AL</Avatar.Fallback>
          </Avatar>
          <YStack>
            <Text fontWeight="600">Ada Lovelace</Text>
            <Text opacity={0.6} fontSize="$2">ada@example.com</Text>
          </YStack>
        </XStack>
      ),
    },
  ],
};
