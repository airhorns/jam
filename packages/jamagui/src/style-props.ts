import type { TokenCategory } from "./types";

/**
 * Map shorthand prop names to their full CSS property names.
 */
export const shorthandMap: Record<string, string | string[]> = {
  p: "padding",
  pt: "paddingTop",
  pr: "paddingRight",
  pb: "paddingBottom",
  pl: "paddingLeft",
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  paddingHorizontal: ["paddingLeft", "paddingRight"],
  paddingVertical: ["paddingTop", "paddingBottom"],
  m: "margin",
  mt: "marginTop",
  mr: "marginRight",
  mb: "marginBottom",
  ml: "marginLeft",
  mx: ["marginLeft", "marginRight"],
  my: ["marginTop", "marginBottom"],
  marginHorizontal: ["marginLeft", "marginRight"],
  marginVertical: ["marginTop", "marginBottom"],
  bg: "backgroundColor",
  bc: "borderColor",
  br: "borderRadius",
  bw: "borderWidth",
  w: "width",
  h: "height",
  f: "flex",
  fd: "flexDirection",
  fw: "flexWrap",
  ai: "alignItems",
  ac: "alignContent",
  jc: "justifyContent",
  as: "alignSelf",
  ta: "textAlign",
  o: "opacity",
  pe: "pointerEvents",
  us: "userSelect",
};

/**
 * Map CSS property names to the token category they resolve from.
 */
export const tokenCategoryMap: Record<string, TokenCategory> = {
  // Space tokens
  padding: "space",
  paddingTop: "space",
  paddingRight: "space",
  paddingBottom: "space",
  paddingLeft: "space",
  margin: "space",
  marginTop: "space",
  marginRight: "space",
  marginBottom: "space",
  marginLeft: "space",
  gap: "space",
  rowGap: "space",
  columnGap: "space",
  top: "space",
  right: "space",
  bottom: "space",
  left: "space",

  // Size tokens
  width: "size",
  height: "size",
  minWidth: "size",
  minHeight: "size",
  maxWidth: "size",
  maxHeight: "size",

  // Radius tokens
  borderRadius: "radius",
  borderTopLeftRadius: "radius",
  borderTopRightRadius: "radius",
  borderBottomLeftRadius: "radius",
  borderBottomRightRadius: "radius",

  // Color tokens
  color: "color",
  backgroundColor: "color",
  borderColor: "color",
  borderTopColor: "color",
  borderRightColor: "color",
  borderBottomColor: "color",
  borderLeftColor: "color",
  outlineColor: "color",

  // zIndex tokens
  zIndex: "zIndex",
};

/**
 * Map camelCase CSS property names to kebab-case for CSS output.
 */
const camelToKebabCache = new Map<string, string>();

export function camelToKebab(str: string): string {
  let result = camelToKebabCache.get(str);
  if (result !== undefined) return result;
  result = str.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  camelToKebabCache.set(str, result);
  return result;
}

/**
 * Known style prop names (all valid CSS-like props that styled() should extract).
 */
export const stylePropertyNames = new Set([
  // Layout
  "display", "flex", "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis",
  "alignItems", "alignSelf", "alignContent", "justifyContent",
  "gap", "rowGap", "columnGap",
  // Sizing
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  // Spacing
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "paddingHorizontal", "paddingVertical",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "marginHorizontal", "marginVertical",
  // Position
  "position", "top", "right", "bottom", "left", "zIndex",
  // Border
  "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderStyle",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius",
  // Background
  "backgroundColor", "opacity",
  // Text
  "color", "fontFamily", "fontSize", "fontWeight", "fontStyle",
  "lineHeight", "letterSpacing", "textAlign",
  "textDecorationLine", "textTransform", "whiteSpace", "wordBreak", "textOverflow",
  // Overflow
  "overflow", "overflowX", "overflowY",
  // Shadow
  "boxShadow",
  // Cursor / interaction
  "cursor", "pointerEvents", "userSelect",
  // Transform
  "transform", "transformOrigin", "transition",
  // Outline
  "outlineColor", "outlineStyle", "outlineWidth", "outlineOffset",
]);

/**
 * All known shorthands
 */
export const shorthandNames = new Set(Object.keys(shorthandMap));

/**
 * Expand a shorthand prop to full CSS properties.
 * Returns an array of [cssProperty, value] pairs.
 */
export function expandShorthand(key: string, value: unknown): Array<[string, unknown]> {
  const mapped = shorthandMap[key];
  if (!mapped) return [[key, value]];
  if (Array.isArray(mapped)) {
    return mapped.map((prop) => [prop, value]);
  }
  return [[mapped, value]];
}

/**
 * Check if a prop name is a style property (including shorthands).
 */
export function isStyleProp(key: string): boolean {
  return stylePropertyNames.has(key) || shorthandNames.has(key);
}

/**
 * Check if a prop name is a pseudo-style prop.
 */
export function isPseudoProp(key: string): boolean {
  return key === "hoverStyle" || key === "pressStyle" || key === "focusStyle" ||
    key === "focusVisibleStyle" || key === "disabledStyle";
}

/**
 * Check if a prop name is a media query prop (starts with $).
 */
export function isMediaProp(key: string): boolean {
  return key.startsWith("$") && key.length > 1;
}

/**
 * Format a CSS value with units.
 */
export function formatCSSValue(property: string, value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    // These properties are unitless
    const unitless = new Set([
      "flex", "flexGrow", "flexShrink", "opacity", "zIndex",
      "fontWeight", "lineHeight", "order",
    ]);
    if (unitless.has(property)) return String(value);
    return value === 0 ? "0" : `${value}px`;
  }
  return String(value);
}
