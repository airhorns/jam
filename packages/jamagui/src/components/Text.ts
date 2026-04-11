import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import { getFontSized } from "../fonts";
import type { AllStyleProps } from "../types";

/**
 * Base text component. Renders a span.
 */
export const Text = styled("span", {
  name: "Text",
});

/**
 * SizableText: text with a size variant that maps to the font scale.
 * The size prop (1-16) drives fontSize, lineHeight, fontWeight, and letterSpacing
 * from the configured body font.
 */
export function SizableText(props: { size?: string | number; fontFamily?: string; children?: VChild | VChild[] } & Partial<AllStyleProps> & Record<string, unknown>): VNode {
  const { size, fontFamily: fontFamilyProp, children, ...rest } = props;
  const sizeKey = size != null ? String(size) : "4";
  const fontName = fontFamilyProp?.startsWith("$") ? fontFamilyProp.slice(1) : "body";

  const fontStyles = getFontSized(fontName, sizeKey);
  const mergedProps: Record<string, unknown> = { ...rest };

  if (fontStyles.fontFamily) mergedProps.fontFamily = fontStyles.fontFamily;
  if (fontStyles.fontSize) mergedProps.fontSize = fontStyles.fontSize;
  if (fontStyles.lineHeight) mergedProps.lineHeight = fontStyles.lineHeight;
  if (fontStyles.fontWeight) mergedProps.fontWeight = fontStyles.fontWeight;
  if (fontStyles.letterSpacing) mergedProps.letterSpacing = fontStyles.letterSpacing;

  // Props override font defaults
  if (props.fontSize != null) mergedProps.fontSize = props.fontSize;
  if (props.fontWeight != null) mergedProps.fontWeight = props.fontWeight;
  if (props.lineHeight != null) mergedProps.lineHeight = props.lineHeight;
  if (props.letterSpacing != null) mergedProps.letterSpacing = props.letterSpacing;

  mergedProps.children = children;
  return Text(mergedProps);
}
SizableText.displayName = "SizableText";

/**
 * Paragraph: body text, uses p tag.
 */
export const Paragraph = styled("p", {
  name: "Paragraph",
});

/**
 * Base heading component.
 */
export const Heading = styled("h2", {
  name: "Heading",
  defaultProps: {
    fontWeight: "700",
  },
});

export const H1 = styled("h1", { name: "H1", defaultProps: { fontWeight: "700" } });
export const H2 = styled("h2", { name: "H2", defaultProps: { fontWeight: "700" } });
export const H3 = styled("h3", { name: "H3", defaultProps: { fontWeight: "600" } });
export const H4 = styled("h4", { name: "H4", defaultProps: { fontWeight: "600" } });
export const H5 = styled("h5", { name: "H5", defaultProps: { fontWeight: "500" } });
export const H6 = styled("h6", { name: "H6", defaultProps: { fontWeight: "500" } });
