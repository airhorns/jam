import { h } from "@jam/core/jsx";
import { XStack, Avatar } from "@jam/ui";
import type { ComponentDemos } from "../types";

const photo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="38" r="18" fill="#fff" opacity="0.9"/><ellipse cx="50" cy="85" rx="30" ry="20" fill="#fff" opacity="0.9"/></svg>`,
  );

export const AvatarDemos: ComponentDemos = {
  name: "Avatar",
  group: "Content",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.3" alignItems="center">
          {["1", "2", "3", "4", "5", "6", "7", "8"].map((size) => (
            <Avatar key={size} size={size} circular>
              <Avatar.Image src={photo} alt="" />
              <Avatar.Fallback>JD</Avatar.Fallback>
            </Avatar>
          ))}
        </XStack>
      ),
    },
    {
      title: "Fallback and shapes",
      render: () => (
        <XStack gap="$space.3" alignItems="center">
          <Avatar size="6" circular>
            <Avatar.Fallback backgroundColor="$blue9" color="white">AB</Avatar.Fallback>
          </Avatar>
          <Avatar size="6">
            <Avatar.Image src={photo} alt="" />
            <Avatar.Fallback>SQ</Avatar.Fallback>
          </Avatar>
          <Avatar size="6" circular>
            <Avatar.Image src="/does-not-exist.png" alt="" />
            <Avatar.Fallback delayMs={300}>404</Avatar.Fallback>
          </Avatar>
        </XStack>
      ),
    },
  ],
};
