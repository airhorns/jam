import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import { useControllableState } from "../state";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { Square } from "./Shapes";
import { Stack } from "./Stacks";

export type AvatarProps = StyledProps & {
  size?: string | number;
  circular?: boolean;
  unstyled?: boolean;
};

/**
 * Avatar: a fixed-size frame that clips its image. Put an `Avatar.Image` and
 * an `Avatar.Fallback` inside; the fallback shows through whenever the image
 * is missing or fails to load.
 */
export const AvatarFrame = styled<AvatarProps>(Square, {
  name: "Avatar",
  defaultProps: {
    position: "relative",
    overflow: "hidden",
    userSelect: "none",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        backgroundColor: "$background",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const AvatarImageFrame = styled("img", {
  name: "AvatarImage",
  defaultProps: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: 1,
  },
});

export type AvatarImageProps = StyledProps & {
  src?: string;
  alt?: string;
  onError?: (event: Event) => void;
};

/**
 * Avatar.Image: fills the frame, cropping to cover. An image that fails to
 * load takes itself out of the layout, so the browser's placeholder glyph
 * never sits on top of the fallback.
 */
function AvatarImageComponent(props: AvatarImageProps): VNode {
  const [brokenSrc, setBrokenSrc] = useControllableState<string>("brokenSrc", { defaultValue: "" });
  const { onError, ...rest } = props;
  const broken = props.src != null && props.src === brokenSrc;
  return h(AvatarImageFrame, {
    ...(rest as Record<string, unknown>),
    ...(broken ? { display: "none" } : null),
    onError: (event: Event) => {
      if (props.src != null) setBrokenSrc(props.src);
      onError?.(event);
    },
  });
}
AvatarImageComponent.displayName = "AvatarImage";

export const AvatarImage = Object.assign(AvatarImageComponent, {
  staticConfig: AvatarImageFrame.staticConfig,
});

/**
 * Avatar.Fallback: sits behind the image, so it is what you see until the
 * image loads. `delayMs` is accepted for API parity and ignored.
 */
export const AvatarFallback = styled(Stack, {
  name: "AvatarFallback",
  consumedProps: ["delayMs"],
  defaultProps: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "$background",
    color: "$color",
    fontFamily: "$body",
  },
});

export const Avatar = Object.assign(AvatarFrame, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
});
