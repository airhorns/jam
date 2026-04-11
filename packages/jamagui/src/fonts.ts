import { assert, when, $ } from "@jam/core";
import type { FontConfig } from "./types";

/**
 * Create a font configuration and assert it as facts.
 * Facts: ["font", name, property, sizeKey, value]
 * Family fact: ["font", name, "family", familyString]
 */
export function createFont(name: string, config: FontConfig): void {
  // Assert family
  assert("font", name, "family", config.family);

  // Assert size scale
  for (const [key, value] of Object.entries(config.size)) {
    assert("font", name, "size", key, value);
  }

  // Auto-fill and assert lineHeight
  const lineHeights = autoFill(config.size, config.lineHeight ?? {});
  for (const [key, value] of Object.entries(lineHeights)) {
    assert("font", name, "lineHeight", key, value);
  }

  // Auto-fill and assert weight
  const weights = autoFillString(config.size, config.weight ?? {});
  for (const [key, value] of Object.entries(weights)) {
    assert("font", name, "weight", key, value);
  }

  // Auto-fill and assert letterSpacing
  const letterSpacings = autoFill(config.size, config.letterSpacing ?? {});
  for (const [key, value] of Object.entries(letterSpacings)) {
    assert("font", name, "letterSpacing", key, value);
  }

  // Assert face mappings if provided
  if (config.face) {
    for (const [weight, faces] of Object.entries(config.face)) {
      assert("font", name, "face", weight, faces.normal);
      if (faces.italic) {
        assert("font", name, "faceItalic", weight, faces.italic);
      }
    }
  }
}

/**
 * Auto-fill a numeric property map to match all keys in the size map.
 * Missing keys are filled from the nearest defined key.
 */
function autoFill(
  sizeMap: Record<string, number>,
  partial: Record<string, number>,
): Record<string, number> {
  const sizeKeys = Object.keys(sizeMap).sort((a, b) => Number(a) - Number(b));
  const definedKeys = Object.keys(partial).sort((a, b) => Number(a) - Number(b));

  if (definedKeys.length === 0) return {};

  const result: Record<string, number> = {};
  for (const key of sizeKeys) {
    if (key in partial) {
      result[key] = partial[key];
    } else {
      // Find nearest defined key
      const keyNum = Number(key);
      let closest = definedKeys[0];
      let closestDist = Math.abs(Number(closest) - keyNum);
      for (const dk of definedKeys) {
        const dist = Math.abs(Number(dk) - keyNum);
        if (dist < closestDist) {
          closest = dk;
          closestDist = dist;
        }
      }
      result[key] = partial[closest];
    }
  }
  return result;
}

/** Same as autoFill but for string values. */
function autoFillString(
  sizeMap: Record<string, number>,
  partial: Record<string, string>,
): Record<string, string> {
  const sizeKeys = Object.keys(sizeMap).sort((a, b) => Number(a) - Number(b));
  const definedKeys = Object.keys(partial).sort((a, b) => Number(a) - Number(b));

  if (definedKeys.length === 0) return {};

  const result: Record<string, string> = {};
  for (const key of sizeKeys) {
    if (key in partial) {
      result[key] = partial[key];
    } else {
      const keyNum = Number(key);
      let closest = definedKeys[0];
      let closestDist = Math.abs(Number(closest) - keyNum);
      for (const dk of definedKeys) {
        const dist = Math.abs(Number(dk) - keyNum);
        if (dist < closestDist) {
          closest = dk;
          closestDist = dist;
        }
      }
      result[key] = partial[closest];
    }
  }
  return result;
}

/**
 * Get a resolved font configuration at a specific size key.
 */
export function getFontSized(
  fontName: string,
  sizeKey: string,
): {
  fontFamily: string;
  fontSize: number;
  lineHeight: number | undefined;
  fontWeight: string | undefined;
  letterSpacing: number | undefined;
} {
  const familyResults = when(["font", fontName, "family", $.value]);
  const fontFamily = familyResults.length > 0 ? (familyResults[0].value as string) : "";

  const sizeResults = when(["font", fontName, "size", sizeKey, $.value]);
  const fontSize = sizeResults.length > 0 ? (sizeResults[0].value as number) : 14;

  const lhResults = when(["font", fontName, "lineHeight", sizeKey, $.value]);
  const lineHeight = lhResults.length > 0 ? (lhResults[0].value as number) : undefined;

  const weightResults = when(["font", fontName, "weight", sizeKey, $.value]);
  const fontWeight = weightResults.length > 0 ? (weightResults[0].value as string) : undefined;

  const lsResults = when(["font", fontName, "letterSpacing", sizeKey, $.value]);
  const letterSpacing = lsResults.length > 0 ? (lsResults[0].value as number) : undefined;

  return { fontFamily, fontSize, lineHeight, fontWeight, letterSpacing };
}
