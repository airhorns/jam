import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { YStack, styled } from "@jam/ui";

/** A phone-sized viewport for mobile shells; children position against it. */
export const PhoneFrame = styled(YStack, {
  name: "PhoneFrame",
  defaultProps: {
    width: "100%",
    maxWidth: 390,
    height: 720,
    position: "relative",
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: 32,
    backgroundColor: "$background",
  },
});

/** A full-width page area with the theme's page background, for desktop screens. */
export const Page = styled(YStack, {
  name: "ExamplePage",
  defaultProps: {
    width: "100%",
    minWidth: 0,
    minHeight: 400,
    backgroundColor: "$background",
    borderRadius: "$radius.4",
    overflow: "hidden",
  },
});

export function fullWidth(child: VChild): VChild {
  return <YStack width="100%">{child}</YStack>;
}
