import { createTokens } from "./tokens";
import { createThemes, setTheme, setThemeClassTarget } from "./themes";
import { createMedia } from "./media";
import { createFont } from "./fonts";
import { setAnimations, setDefaultFont } from "./settings";
import { defaultMedia } from "./default-config";
import type { JamUIConfig } from "./types";

/**
 * Initialize the Jam UI design system: tokens, themes, media queries, fonts,
 * animations and the root theme in one call. Pass `defaultConfig` for the
 * batteries-included setup, or spread it and override pieces.
 */
export function createJamUI(config: JamUIConfig): void {
  if (config.tokens) createTokens(config.tokens);
  if (config.themes) createThemes(config.themes);

  createMedia(config.media ?? defaultMedia);

  if (config.fonts) {
    for (const [name, fontConfig] of Object.entries(config.fonts)) {
      createFont(name, fontConfig);
    }
  }

  setDefaultFont(config.defaultFont ?? "body");
  setAnimations(config.animations ?? {});
  setThemeClassTarget(config.themeClassTarget ?? "html");

  if (config.defaultTheme) setTheme(config.defaultTheme);
}
