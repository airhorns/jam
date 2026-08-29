// Config
export { createJamUI } from "./config";
export {
  defaultConfig,
  defaultTokens,
  defaultFonts,
  defaultMedia,
  defaultAnimations,
  breakpoints,
  createSystemFont,
  size,
  space,
  radius,
  zIndex,
  color,
} from "./default-config";
export { setDefaultFont, getDefaultFont, setAnimations, getAnimation } from "./settings";

// Native mode
export { setNativeMode, isNativeMode } from "./native-mode";

// Token system
export {
  createTokens,
  getToken,
  getTokens,
  resolveTokenValue,
  resolveTokenIn,
  isTokenRef,
  isThemeRef,
} from "./tokens";

// Theme system
export {
  createThemes,
  addTheme,
  updateTheme,
  setTheme,
  setThemeClassTarget,
  getActiveThemeName,
  getThemeNames,
  hasTheme,
  isThemeKey,
  getThemeValues,
  getResolvedThemeValues,
  useTheme,
  useThemeName,
  resolveThemeValue,
  resolveThemeName,
  themeClassNames,
  ensureThemeCSS,
  injectThemeCSS,
  Theme,
  ThemeContext,
} from "./themes";
export type { ThemeProps } from "./themes";

// Theme building
export { buildThemes, getParentThemeName, PALETTE_BACKGROUND_OFFSET } from "./theme-builder";
export type {
  Palette,
  SchemePalette,
  Template,
  Templates,
  ThemeDefinition,
  ThemeSet,
  BuildThemesOptions,
} from "./theme-builder";
export {
  createDefaultThemes,
  defaultTemplates,
  defaultLightPalette,
  defaultDarkPalette,
  defaultChildrenThemes,
  defaultGrandChildrenThemes,
  defaultComponentThemes,
} from "./default-themes";
export type { CreateDefaultThemesOptions } from "./default-themes";
export * as colors from "./colors";
export type { ColorScale } from "./colors";
export { parseColor, rgbaToString, opacify, interpolateColor } from "./color-utils";
export type { RGBA } from "./color-utils";

// Media system
export { createMedia, useMedia, disposeMedia, buildMediaQuery, getMediaQuery, getMediaPrecedence, isMediaKey } from "./media";

// Font system
export { createFont, hasFont, getFont, getFontFamily, getFontValue, getFontStyles, fillSizes } from "./fonts";
export type { ResolvedFont, FontProperty } from "./fonts";

// Style system
export { styled, createStyledContext } from "./styled";
export type {
  StyledComponent,
  StyledConfig,
  StyledProps,
  StyledContext,
  VariantExtras,
  VariantFunction,
  VariantSpec,
} from "./styled";
export {
  getButtonSized,
  getFontSized,
  getElevation,
  getSizedElevation,
  themeableVariants,
  stepToken,
  tokenValue,
} from "./variants";
export { atomicClassName, injectAtomic, injectRule, stylesToCSS, clearInjectedStyles } from "./css";
export {
  shorthandMap,
  tokenCategoryMap,
  isStyleProp,
  isPseudoProp,
  isMediaProp,
  expandShorthand,
  formatCSSValue,
  camelToKebab,
} from "./style-props";

// Types
export type {
  TokenCategory,
  TokenConfig,
  ThemeValues,
  ThemeKey,
  MediaQueryConfig,
  MediaConfig,
  FontConfig,
  TokenValue,
  StyleProps,
  PseudoProps,
  ShorthandProps,
  ThemeableProps,
  AllStyleProps,
  JamUIConfig,
} from "./types";

// Components
export * from "./components";
