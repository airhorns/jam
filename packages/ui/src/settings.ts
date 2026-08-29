// Runtime settings that aren't facts: they configure how styles are generated
// rather than describing app state.

let defaultFont = "body";
let animations: Record<string, string> = {};

export function setDefaultFont(name: string): void {
  defaultFont = name;
}

export function getDefaultFont(): string {
  return defaultFont;
}

export function setAnimations(config: Record<string, string>): void {
  animations = { ...config };
}

/** The CSS transition timing ("150ms ease-out") registered under a name. */
export function getAnimation(name: string): string | undefined {
  return animations[name];
}

export function resetSettings(): void {
  defaultFont = "body";
  animations = {};
}
