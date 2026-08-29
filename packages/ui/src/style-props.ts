import type { TokenCategory } from "./types";

/**
 * Shorthand prop names → full style prop names. Supports both the terse
 * tamagui shorthands (`ai`, `jc`, `bg`) and the word-based v5 ones
 * (`items`, `justify`, `rounded`).
 */
export const shorthandMap: Record<string, string> = {
  // padding / margin
  p: "padding",
  pt: "paddingTop",
  pr: "paddingRight",
  pb: "paddingBottom",
  pl: "paddingLeft",
  px: "paddingHorizontal",
  py: "paddingVertical",
  m: "margin",
  mt: "marginTop",
  mr: "marginRight",
  mb: "marginBottom",
  ml: "marginLeft",
  mx: "marginHorizontal",
  my: "marginVertical",
  // sizing
  w: "width",
  h: "height",
  miw: "minWidth",
  mih: "minHeight",
  maw: "maxWidth",
  mah: "maxHeight",
  minW: "minWidth",
  minH: "minHeight",
  maxW: "maxWidth",
  maxH: "maxHeight",
  // flex
  f: "flex",
  fb: "flexBasis",
  fd: "flexDirection",
  fg: "flexGrow",
  fs: "flexShrink",
  fw: "flexWrap",
  grow: "flexGrow",
  shrink: "flexShrink",
  ai: "alignItems",
  ac: "alignContent",
  als: "alignSelf",
  as: "alignSelf",
  jc: "justifyContent",
  items: "alignItems",
  content: "alignContent",
  self: "alignSelf",
  justify: "justifyContent",
  // position
  pos: "position",
  t: "top",
  r: "right",
  b: "bottom",
  l: "left",
  zi: "zIndex",
  z: "zIndex",
  // background / border
  bg: "backgroundColor",
  bc: "borderColor",
  boc: "borderColor",
  btc: "borderTopColor",
  brc: "borderRightColor",
  bbc: "borderBottomColor",
  blc: "borderLeftColor",
  bw: "borderWidth",
  btw: "borderTopWidth",
  brw: "borderRightWidth",
  bbw: "borderBottomWidth",
  blw: "borderLeftWidth",
  bs: "borderStyle",
  bts: "borderTopStyle",
  brs: "borderRightStyle",
  bbs: "borderBottomStyle",
  bls: "borderLeftStyle",
  br: "borderRadius",
  btlr: "borderTopLeftRadius",
  btrr: "borderTopRightRadius",
  bblr: "borderBottomLeftRadius",
  bbrr: "borderBottomRightRadius",
  rounded: "borderRadius",
  bxs: "boxSizing",
  bxsh: "boxShadow",
  // misc view
  dsp: "display",
  o: "opacity",
  ov: "overflow",
  ox: "overflowX",
  oy: "overflowY",
  pe: "pointerEvents",
  us: "userSelect",
  ussel: "userSelect",
  select: "userSelect",
  cur: "cursor",
  ol: "outline",
  shac: "shadowColor",
  shar: "shadowRadius",
  shof: "shadowOffset",
  shop: "shadowOpacity",
  // text
  col: "color",
  ff: "fontFamily",
  fos: "fontSize",
  fost: "fontStyle",
  fow: "fontWeight",
  ls: "letterSpacing",
  lh: "lineHeight",
  ta: "textAlign",
  text: "textAlign",
  tt: "textTransform",
  ww: "wordWrap",
};

/** Style props that expand to several CSS longhands. */
export const expansionMap: Record<string, string[]> = {
  paddingHorizontal: ["paddingLeft", "paddingRight"],
  paddingVertical: ["paddingTop", "paddingBottom"],
  paddingStart: ["paddingLeft"],
  paddingEnd: ["paddingRight"],
  marginHorizontal: ["marginLeft", "marginRight"],
  marginVertical: ["marginTop", "marginBottom"],
  marginStart: ["marginLeft"],
  marginEnd: ["marginRight"],
  inset: ["top", "right", "bottom", "left"],
};

/** Style props → the token category bare `$` tokens resolve against. */
export const tokenCategoryMap: Record<string, TokenCategory> = {
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
  x: "space",
  y: "space",
  outlineOffset: "space",
  outlineWidth: "space",
  borderWidth: "space",
  borderTopWidth: "space",
  borderRightWidth: "space",
  borderBottomWidth: "space",
  borderLeftWidth: "space",
  textIndent: "space",

  width: "size",
  height: "size",
  minWidth: "size",
  minHeight: "size",
  maxWidth: "size",
  maxHeight: "size",
  flexBasis: "size",
  shadowRadius: "size",

  borderRadius: "radius",
  borderTopLeftRadius: "radius",
  borderTopRightRadius: "radius",
  borderBottomLeftRadius: "radius",
  borderBottomRightRadius: "radius",

  color: "color",
  backgroundColor: "color",
  borderColor: "color",
  borderTopColor: "color",
  borderRightColor: "color",
  borderBottomColor: "color",
  borderLeftColor: "color",
  outlineColor: "color",
  shadowColor: "color",
  textDecorationColor: "color",
  textShadowColor: "color",

  zIndex: "zIndex",
};

/** Text props whose bare `$` tokens resolve against the element's font tables. */
export const fontPropertyMap: Record<string, "size" | "lineHeight" | "weight" | "letterSpacing"> = {
  fontSize: "size",
  lineHeight: "lineHeight",
  fontWeight: "weight",
  letterSpacing: "letterSpacing",
};

const camelToKebabCache = new Map<string, string>();

export function camelToKebab(str: string): string {
  let result = camelToKebabCache.get(str);
  if (result !== undefined) return result;
  result = str.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  camelToKebabCache.set(str, result);
  return result;
}

/** Props composed into `transform`, in application order. */
export const transformProps = [
  "perspective",
  "x",
  "y",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skewX",
  "skewY",
] as const;

/** React-Native-style shadow props composed into `box-shadow`. */
export const shadowProps = ["shadowColor", "shadowOffset", "shadowOpacity", "shadowRadius"] as const;

/** Props that are style props but don't map 1:1 to a CSS declaration. */
const virtualStyleProps = new Set<string>([
  ...Object.keys(expansionMap),
  ...transformProps,
  ...shadowProps,
  "textShadowColor",
  "textShadowOffset",
  "textShadowRadius",
  "elevation",
]);

/**
 * Known style prop names (all valid CSS-like props that styled() should extract).
 */
export const stylePropertyNames = new Set<string>([
  // Layout
  "display", "flex", "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis",
  "alignItems", "alignSelf", "alignContent", "justifyContent",
  "gap", "rowGap", "columnGap", "order", "boxSizing", "aspectRatio", "visibility", "contain",
  // Sizing
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  // Spacing
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  // Position
  "position", "top", "right", "bottom", "left", "zIndex",
  // Border
  "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderStyle", "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius",
  // Background
  "backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat",
  "backgroundClip", "opacity", "mixBlendMode",
  // Text
  "color", "fontFamily", "fontSize", "fontWeight", "fontStyle",
  "lineHeight", "letterSpacing", "textAlign",
  "textDecorationLine", "textDecorationColor", "textDecorationStyle", "textTransform",
  "whiteSpace", "wordBreak", "wordWrap", "overflowWrap", "textOverflow", "verticalAlign",
  "fontVariant", "textIndent",
  // Overflow
  "overflow", "overflowX", "overflowY",
  // Shadow / effects
  "boxShadow", "filter", "backdropFilter",
  // Cursor / interaction
  "cursor", "pointerEvents", "userSelect", "touchAction", "resize", "appearance", "outline",
  // Transform / transition
  "transform", "transformOrigin", "transition", "transitionProperty", "transitionDuration",
  "transitionTimingFunction", "animationName", "willChange",
  // Outline
  "outlineColor", "outlineStyle", "outlineWidth", "outlineOffset",
  // Misc
  "objectFit", "objectPosition", "listStyle", "content", "scrollbarWidth", "scrollSnapType",
  "scrollSnapAlign", "columns", "WebkitLineClamp", "WebkitBoxOrient", "textShadow",
  ...virtualStyleProps,
]);

export const shorthandNames = new Set(Object.keys(shorthandMap));

/** Pseudo-style props → CSS selector suffix. `disabledStyle` also applies via the `disabled` prop. */
export const pseudoSelectorMap: Record<string, string> = {
  hoverStyle: ":hover",
  pressStyle: ":active",
  focusStyle: ":focus",
  focusVisibleStyle: ":focus-visible",
  focusWithinStyle: ":focus-within",
  disabledStyle: ":disabled",
  placeholderStyle: "::placeholder",
};

/**
 * Expand a shorthand prop to full style props.
 * Returns an array of [styleProp, value] pairs.
 */
export function expandShorthand(key: string, value: unknown): Array<[string, unknown]> {
  const full = shorthandMap[key] ?? key;
  const expansion = expansionMap[full];
  if (expansion) return expansion.map((prop) => [prop, value]);
  return [[full, value]];
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
  return key in pseudoSelectorMap || key === "enterStyle" || key === "exitStyle";
}

/**
 * Check if a prop name is a media query prop (starts with $).
 */
export function isMediaProp(key: string): boolean {
  return key.startsWith("$") && key.length > 1;
}

const unitless = new Set([
  "flex", "flexGrow", "flexShrink", "opacity", "zIndex", "fontWeight", "order",
  "aspectRatio", "scale", "scaleX", "scaleY", "columns", "shadowOpacity", "WebkitLineClamp",
]);

/**
 * Format a CSS value with units. Numbers get `px` unless the property is unitless.
 */
export function formatCSSValue(property: string, value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (unitless.has(property)) return String(value);
    return value === 0 ? "0" : `${value}px`;
  }
  return String(value);
}

const px = (v: unknown) => (typeof v === "number" ? `${v}px` : String(v));
const deg = (v: unknown) => (typeof v === "number" ? `${v}deg` : String(v));

/**
 * Turn resolved style props into a flat CSS declaration map (kebab-case
 * property → value string), composing transform and shadow props.
 */
export function stylesToCSS(styles: Record<string, unknown>): Record<string, string> {
  const css: Record<string, string> = {};
  const transforms: string[] = [];
  let shadow: Partial<Record<(typeof shadowProps)[number], unknown>> | null = null;
  let textShadow: { color?: unknown; offset?: unknown; radius?: unknown } | null = null;

  for (const [prop, value] of Object.entries(styles)) {
    if (value == null || value === false) continue;

    if ((transformProps as readonly string[]).includes(prop)) {
      switch (prop) {
        case "x": transforms.push(`translateX(${px(value)})`); break;
        case "y": transforms.push(`translateY(${px(value)})`); break;
        case "perspective": transforms.push(`perspective(${px(value)})`); break;
        case "scale": case "scaleX": case "scaleY": transforms.push(`${prop}(${value})`); break;
        default: transforms.push(`${prop}(${deg(value)})`);
      }
      continue;
    }
    if ((shadowProps as readonly string[]).includes(prop)) {
      (shadow ??= {})[prop as (typeof shadowProps)[number]] = value;
      continue;
    }
    if (prop === "textShadowColor" || prop === "textShadowOffset" || prop === "textShadowRadius") {
      textShadow ??= {};
      if (prop === "textShadowColor") textShadow.color = value;
      else if (prop === "textShadowOffset") textShadow.offset = value;
      else textShadow.radius = value;
      continue;
    }
    if (prop === "elevation") continue;

    const cssValue = formatCSSValue(prop, value);
    if (cssValue === "") continue;
    css[camelToKebab(prop)] = cssValue;
  }

  if (transforms.length > 0) {
    css.transform = [css.transform, ...transforms].filter(Boolean).join(" ");
  }
  if (shadow) {
    const offset = (shadow.shadowOffset as { width?: number; height?: number } | undefined) ?? {};
    const color = shadowColorWithOpacity(String(shadow.shadowColor ?? "rgba(0,0,0,1)"), shadow.shadowOpacity as number | undefined);
    const rule = `${px(offset.width ?? 0)} ${px(offset.height ?? 0)} ${px(shadow.shadowRadius ?? 0)} ${color}`;
    css["box-shadow"] = css["box-shadow"] ? `${css["box-shadow"]}, ${rule}` : rule;
  }
  if (textShadow) {
    const offset = (textShadow.offset as { width?: number; height?: number } | undefined) ?? {};
    css["text-shadow"] = `${px(offset.width ?? 0)} ${px(offset.height ?? 0)} ${px(textShadow.radius ?? 0)} ${textShadow.color ?? "currentColor"}`;
  }
  return css;
}

// Opacity can only be folded into a literal color; CSS variables are left alone.
function shadowColorWithOpacity(color: string, opacity: number | undefined): string {
  if (opacity == null || color.startsWith("var(")) return color;
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}
