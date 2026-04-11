import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Avatar: user avatar with image and fallback.
 *
 * Usage:
 *   <Avatar size="4">
 *     <Avatar.Image src="https://..." />
 *     <Avatar.Fallback>AB</Avatar.Fallback>
 *   </Avatar>
 */
export const Avatar = styled("div", {
  name: "Avatar",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 100000,
    backgroundColor: "$borderColor",
    userSelect: "none",
  },
  variants: {
    size: {
      "1": { width: 20, height: 20 },
      "2": { width: 28, height: 28 },
      "3": { width: 36, height: 36 },
      "4": { width: 44, height: 44 },
      "5": { width: 52, height: 52 },
      "6": { width: 64, height: 64 },
      "7": { width: 80, height: 80 },
      "8": { width: 100, height: 100 },
    },
  },
  defaultVariants: {
    size: "4",
  },
}) as ReturnType<typeof styled> & {
  Image: ReturnType<typeof styled>;
  Fallback: ReturnType<typeof styled>;
};

(Avatar as any).Image = styled("img", {
  name: "AvatarImage",
  defaultProps: {
    width: "100%",
    height: "100%",
  },
});

(Avatar as any).Fallback = styled("span", {
  name: "AvatarFallback",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    color: "$color",
    fontSize: 14,
    fontWeight: "500",
  },
});
