// ---- Token types ----

export type TokenCategory = "size" | "space" | "radius" | "color" | "zIndex";

export type TokenConfig = {
  size?: Record<string, number>;
  space?: Record<string, number>;
  radius?: Record<string, number>;
  color?: Record<string, string>;
  zIndex?: Record<string, number>;
};

// ---- Theme types ----

export type ThemeValues = Record<string, string>;

// Standard theme keys (matching Tamagui)
export type ThemeKey =
  | "background"
  | "backgroundHover"
  | "backgroundPress"
  | "backgroundFocus"
  | "backgroundActive"
  | "backgroundStrong"
  | "backgroundTransparent"
  | "color"
  | "colorHover"
  | "colorPress"
  | "colorFocus"
  | "colorTransparent"
  | "borderColor"
  | "borderColorHover"
  | "borderColorPress"
  | "borderColorFocus"
  | "placeholderColor"
  | "outlineColor"
  | "shadowColor"
  | "accentBackground"
  | "accentColor";

// ---- Media types ----

export type MediaQueryConfig = {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  hover?: "hover" | "none";
  pointer?: "coarse" | "fine" | "none";
  orientation?: "portrait" | "landscape";
  prefersColorScheme?: "light" | "dark";
};

export type MediaConfig = Record<string, MediaQueryConfig>;

// ---- Font types ----

export type FontConfig = {
  family: string;
  size: Record<string, number>;
  lineHeight?: Record<string, number>;
  weight?: Record<string, string>;
  letterSpacing?: Record<string, number>;
  face?: Record<string, { normal: string; italic?: string }>;
};

// ---- Style prop types ----

/** A value that can be a raw value or a token reference like "$size.4" or a theme ref like "$background" */
export type TokenValue<T> = T | `$${string}.${string}` | `$${string}`;

type Length = TokenValue<number | string>;
type Color = TokenValue<string>;

export type StyleProps = {
  // Layout
  display?: TokenValue<string>;
  flex?: TokenValue<number | string>;
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "wrap" | "nowrap" | "wrap-reverse";
  flexGrow?: TokenValue<number>;
  flexShrink?: TokenValue<number>;
  flexBasis?: Length;
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignSelf?: "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignContent?: "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
  gap?: Length;
  rowGap?: Length;
  columnGap?: Length;
  order?: number;
  boxSizing?: "border-box" | "content-box";
  aspectRatio?: number | string;
  visibility?: "visible" | "hidden" | "collapse";
  contain?: string;

  // Sizing
  width?: Length;
  height?: Length;
  minWidth?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  maxHeight?: Length;

  // Spacing
  padding?: Length;
  paddingTop?: Length;
  paddingRight?: Length;
  paddingBottom?: Length;
  paddingLeft?: Length;
  paddingHorizontal?: Length;
  paddingVertical?: Length;
  paddingStart?: Length;
  paddingEnd?: Length;
  margin?: Length;
  marginTop?: Length;
  marginRight?: Length;
  marginBottom?: Length;
  marginLeft?: Length;
  marginHorizontal?: Length;
  marginVertical?: Length;
  marginStart?: Length;
  marginEnd?: Length;

  // Position
  position?: "relative" | "absolute" | "fixed" | "sticky" | "static";
  top?: Length;
  right?: Length;
  bottom?: Length;
  left?: Length;
  inset?: Length;
  zIndex?: TokenValue<number>;

  // Border
  borderWidth?: Length;
  borderTopWidth?: Length;
  borderRightWidth?: Length;
  borderBottomWidth?: Length;
  borderLeftWidth?: Length;
  borderColor?: Color;
  borderTopColor?: Color;
  borderRightColor?: Color;
  borderBottomColor?: Color;
  borderLeftColor?: Color;
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
  borderTopStyle?: "solid" | "dashed" | "dotted" | "none";
  borderRightStyle?: "solid" | "dashed" | "dotted" | "none";
  borderBottomStyle?: "solid" | "dashed" | "dotted" | "none";
  borderLeftStyle?: "solid" | "dashed" | "dotted" | "none";
  borderRadius?: Length;
  borderTopLeftRadius?: Length;
  borderTopRightRadius?: Length;
  borderBottomLeftRadius?: Length;
  borderBottomRightRadius?: Length;

  // Background
  backgroundColor?: Color;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundClip?: string;
  opacity?: TokenValue<number>;
  mixBlendMode?: string;

  // Text
  color?: Color;
  fontFamily?: TokenValue<string>;
  fontSize?: Length;
  fontWeight?: TokenValue<string | number>;
  fontStyle?: "normal" | "italic";
  lineHeight?: Length;
  letterSpacing?: Length;
  textAlign?: "left" | "right" | "center" | "justify" | "start" | "end";
  textDecorationLine?: "none" | "underline" | "line-through" | "underline line-through";
  textDecorationColor?: Color;
  textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
  textTransform?: "none" | "capitalize" | "uppercase" | "lowercase";
  textShadowColor?: Color;
  textShadowOffset?: { width: number; height: number };
  textShadowRadius?: number;
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
  wordBreak?: "normal" | "break-all" | "break-word" | "keep-all";
  wordWrap?: "normal" | "break-word";
  overflowWrap?: "normal" | "break-word" | "anywhere";
  textOverflow?: "clip" | "ellipsis";
  verticalAlign?: string;
  fontVariant?: string;
  textIndent?: Length;

  // Overflow
  overflow?: "visible" | "hidden" | "scroll" | "auto" | "clip";
  overflowX?: "visible" | "hidden" | "scroll" | "auto" | "clip";
  overflowY?: "visible" | "hidden" | "scroll" | "auto" | "clip";

  // Shadow (React Native style; combined into box-shadow on web)
  boxShadow?: string;
  shadowColor?: Color;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  filter?: string;
  backdropFilter?: string;

  // Cursor / interaction
  cursor?: string;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  userSelect?: "auto" | "text" | "none" | "contain" | "all";
  touchAction?: string;
  resize?: "none" | "both" | "horizontal" | "vertical";
  appearance?: string;
  outline?: string;

  // Transform
  transform?: string;
  transformOrigin?: string;
  x?: Length;
  y?: Length;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: string;
  rotateX?: string;
  rotateY?: string;
  rotateZ?: string;
  skewX?: string;
  skewY?: string;
  perspective?: number;

  // Transitions / animation
  transition?: string;
  transitionProperty?: string;
  transitionDuration?: string;
  transitionTimingFunction?: string;
  animationName?: string;
  willChange?: string;

  // Outline
  outlineColor?: Color;
  outlineStyle?: string;
  outlineWidth?: Length;
  outlineOffset?: Length;

  // Misc
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  objectPosition?: string;
  listStyle?: string;
  content?: string;
  scrollbarWidth?: "auto" | "thin" | "none";
  scrollSnapType?: string;
  scrollSnapAlign?: string;
  columns?: number | string;
};

export type PseudoProps = {
  hoverStyle?: Partial<StyleProps>;
  pressStyle?: Partial<StyleProps>;
  focusStyle?: Partial<StyleProps>;
  focusVisibleStyle?: Partial<StyleProps>;
  focusWithinStyle?: Partial<StyleProps>;
  disabledStyle?: Partial<StyleProps>;
  placeholderStyle?: Partial<StyleProps>;
  enterStyle?: Partial<StyleProps>;
  exitStyle?: Partial<StyleProps>;
};

export type ShorthandProps = {
  p?: StyleProps["padding"];
  pt?: StyleProps["paddingTop"];
  pr?: StyleProps["paddingRight"];
  pb?: StyleProps["paddingBottom"];
  pl?: StyleProps["paddingLeft"];
  px?: StyleProps["paddingHorizontal"];
  py?: StyleProps["paddingVertical"];
  m?: StyleProps["margin"];
  mt?: StyleProps["marginTop"];
  mr?: StyleProps["marginRight"];
  mb?: StyleProps["marginBottom"];
  ml?: StyleProps["marginLeft"];
  mx?: StyleProps["marginHorizontal"];
  my?: StyleProps["marginVertical"];
  bg?: StyleProps["backgroundColor"];
  bc?: StyleProps["borderColor"];
  br?: StyleProps["borderRadius"];
  bw?: StyleProps["borderWidth"];
  w?: StyleProps["width"];
  h?: StyleProps["height"];
  f?: StyleProps["flex"];
  fd?: StyleProps["flexDirection"];
  fw?: StyleProps["flexWrap"];
  ai?: StyleProps["alignItems"];
  ac?: StyleProps["alignContent"];
  jc?: StyleProps["justifyContent"];
  as?: StyleProps["alignSelf"];
  ta?: StyleProps["textAlign"];
  o?: StyleProps["opacity"];
  pe?: StyleProps["pointerEvents"];
  us?: StyleProps["userSelect"];
  zi?: StyleProps["zIndex"];
  pos?: StyleProps["position"];
  t?: StyleProps["top"];
  r?: StyleProps["right"];
  b?: StyleProps["bottom"];
  l?: StyleProps["left"];
  ov?: StyleProps["overflow"];
  ff?: StyleProps["fontFamily"];
  fos?: StyleProps["fontSize"];
  fow?: StyleProps["fontWeight"];
  lh?: StyleProps["lineHeight"];
  ls?: StyleProps["letterSpacing"];
  col?: StyleProps["color"];
  tt?: StyleProps["textTransform"];
};

/** Props accepted by every styled component in addition to style props. */
export type ThemeableProps = {
  /** Apply a sub-theme (e.g. "blue", "accent", "dark_red") to this element and its children. */
  theme?: string;
  /** Flip between light and dark for this element and its children. */
  themeInverse?: boolean;
  /** Skip the component's built-in styles and only apply the styles you pass. */
  unstyled?: boolean;
  /** Render the single child element instead of this component's own element, merging props onto it. */
  asChild?: boolean;
  /** Override the rendered HTML tag. */
  tag?: string;
  /** Name of a configured animation; applied as a CSS transition. */
  animation?: string;
  /** Add a class to this element in addition to generated ones. */
  className?: string;
  class?: string;
  style?: Record<string, unknown> | string;
};

export type AllStyleProps = StyleProps & ShorthandProps & PseudoProps;

// ---- Component types ----

export type StyledConfig<Variants extends Record<string, Record<string, unknown>> = {}> = {
  name?: string;
  defaultProps?: Partial<AllStyleProps> & Record<string, unknown>;
  variants?: { [K in keyof Variants]: Record<string, Partial<AllStyleProps>> };
  defaultVariants?: { [K in keyof Variants]?: keyof Variants[K] };
};

// ---- Config types ----

export type JamUIConfig = {
  tokens?: TokenConfig;
  themes?: Record<string, ThemeValues>;
  media?: MediaConfig;
  fonts?: Record<string, FontConfig>;
  /** Named CSS transitions usable via the `animation` prop, e.g. `{ quick: "150ms ease-out" }`. */
  animations?: Record<string, string>;
  defaultTheme?: string;
  /** Font used when a text component doesn't specify one. Defaults to "body". */
  defaultFont?: string;
  /**
   * Where the active theme's class is written when `setTheme()` is called:
   * "html" (default), "body", or false to manage it yourself.
   */
  themeClassTarget?: "html" | "body" | false;
};
