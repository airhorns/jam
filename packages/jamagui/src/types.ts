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
  | "shadowColor";

// ---- Media types ----

export type MediaQueryConfig = {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
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

export type StyleProps = {
  // Layout
  display?: TokenValue<string>;
  flex?: TokenValue<number | string>;
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "wrap" | "nowrap" | "wrap-reverse";
  flexGrow?: TokenValue<number>;
  flexShrink?: TokenValue<number>;
  flexBasis?: TokenValue<number | string>;
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignSelf?: "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  alignContent?: "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
  gap?: TokenValue<number | string>;
  rowGap?: TokenValue<number | string>;
  columnGap?: TokenValue<number | string>;

  // Sizing
  width?: TokenValue<number | string>;
  height?: TokenValue<number | string>;
  minWidth?: TokenValue<number | string>;
  minHeight?: TokenValue<number | string>;
  maxWidth?: TokenValue<number | string>;
  maxHeight?: TokenValue<number | string>;

  // Spacing
  padding?: TokenValue<number | string>;
  paddingTop?: TokenValue<number | string>;
  paddingRight?: TokenValue<number | string>;
  paddingBottom?: TokenValue<number | string>;
  paddingLeft?: TokenValue<number | string>;
  paddingHorizontal?: TokenValue<number | string>;
  paddingVertical?: TokenValue<number | string>;
  margin?: TokenValue<number | string>;
  marginTop?: TokenValue<number | string>;
  marginRight?: TokenValue<number | string>;
  marginBottom?: TokenValue<number | string>;
  marginLeft?: TokenValue<number | string>;
  marginHorizontal?: TokenValue<number | string>;
  marginVertical?: TokenValue<number | string>;

  // Position
  position?: "relative" | "absolute" | "fixed" | "sticky";
  top?: TokenValue<number | string>;
  right?: TokenValue<number | string>;
  bottom?: TokenValue<number | string>;
  left?: TokenValue<number | string>;
  zIndex?: TokenValue<number>;

  // Border
  borderWidth?: TokenValue<number>;
  borderTopWidth?: TokenValue<number>;
  borderRightWidth?: TokenValue<number>;
  borderBottomWidth?: TokenValue<number>;
  borderLeftWidth?: TokenValue<number>;
  borderColor?: TokenValue<string>;
  borderTopColor?: TokenValue<string>;
  borderRightColor?: TokenValue<string>;
  borderBottomColor?: TokenValue<string>;
  borderLeftColor?: TokenValue<string>;
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
  borderRadius?: TokenValue<number | string>;
  borderTopLeftRadius?: TokenValue<number | string>;
  borderTopRightRadius?: TokenValue<number | string>;
  borderBottomLeftRadius?: TokenValue<number | string>;
  borderBottomRightRadius?: TokenValue<number | string>;

  // Background
  backgroundColor?: TokenValue<string>;
  opacity?: TokenValue<number>;

  // Text
  color?: TokenValue<string>;
  fontFamily?: TokenValue<string>;
  fontSize?: TokenValue<number | string>;
  fontWeight?: TokenValue<string | number>;
  fontStyle?: "normal" | "italic";
  lineHeight?: TokenValue<number | string>;
  letterSpacing?: TokenValue<number | string>;
  textAlign?: "left" | "right" | "center" | "justify";
  textDecorationLine?: "none" | "underline" | "line-through" | "underline line-through";
  textTransform?: "none" | "capitalize" | "uppercase" | "lowercase";
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
  wordBreak?: "normal" | "break-all" | "break-word" | "keep-all";
  textOverflow?: "clip" | "ellipsis";

  // Overflow
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  overflowX?: "visible" | "hidden" | "scroll" | "auto";
  overflowY?: "visible" | "hidden" | "scroll" | "auto";

  // Shadow
  boxShadow?: string;

  // Cursor
  cursor?: string;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  userSelect?: "auto" | "text" | "none" | "contain" | "all";

  // Transform
  transform?: string;
  transformOrigin?: string;
  transition?: string;

  // Outline
  outlineColor?: TokenValue<string>;
  outlineStyle?: string;
  outlineWidth?: TokenValue<number>;
  outlineOffset?: TokenValue<number>;
};

export type PseudoProps = {
  hoverStyle?: Partial<StyleProps>;
  pressStyle?: Partial<StyleProps>;
  focusStyle?: Partial<StyleProps>;
  focusVisibleStyle?: Partial<StyleProps>;
  disabledStyle?: Partial<StyleProps>;
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
  defaultTheme?: string;
};
