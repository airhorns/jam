import { createTokens } from "./tokens";
import { createThemes, setTheme, injectThemeCSS } from "./themes";
import { createMedia, defaultMediaConfig } from "./media";
import { createFont } from "./fonts";
import type { JamUIConfig } from "./types";

/**
 * Initialize the Jam UI design system.
 * Sets up tokens, themes, media queries, and fonts in one call.
 */
export function createJamUI(config: JamUIConfig): void {
  if (config.tokens) {
    createTokens(config.tokens);
  }

  if (config.themes) {
    createThemes(config.themes);
  }

  if (config.media) {
    createMedia(config.media);
  } else {
    createMedia(defaultMediaConfig);
  }

  if (config.fonts) {
    for (const [name, fontConfig] of Object.entries(config.fonts)) {
      createFont(name, fontConfig);
    }
  }

  if (config.defaultTheme) {
    setTheme(config.defaultTheme);
  }

  // Inject theme CSS variables
  injectThemeCSS();
}
