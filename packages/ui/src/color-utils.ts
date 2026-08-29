export type RGBA = { r: number; g: number; b: number; a: number };

const namedColors: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  transparent: "rgba(0,0,0,0)",
};

/**
 * Parse a CSS color (hex, rgb[a](), hsl[a](), white/black/transparent) into RGBA.
 * Returns null for anything else (e.g. CSS variables or gradients).
 */
export function parseColor(input: string): RGBA | null {
  const str = (namedColors[input.trim().toLowerCase()] ?? input).trim();

  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = Number.parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    if (hex.length === 6) {
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    return { r: (n >>> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: (n & 255) / 255 };
  }

  const fn = str.match(/^(rgba?|hsla?)\(([^)]*)\)$/i);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts.length > 3 ? parseAlpha(parts[3]) : 1;

  if (fn[1].toLowerCase().startsWith("rgb")) {
    return { r: parseChannel(parts[0]), g: parseChannel(parts[1]), b: parseChannel(parts[2]), a: alpha };
  }

  const h = Number.parseFloat(parts[0]);
  const s = Number.parseFloat(parts[1]) / 100;
  const l = Number.parseFloat(parts[2]) / 100;
  const { r, g, b } = hslToRgb(h, s, l);
  return { r, g, b, a: alpha };
}

function parseChannel(v: string): number {
  if (v.endsWith("%")) return Math.round((Number.parseFloat(v) / 100) * 255);
  return Math.round(Number.parseFloat(v));
}

function parseAlpha(v: string): number {
  if (v.endsWith("%")) return Number.parseFloat(v) / 100;
  return Number.parseFloat(v);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
}

export function rgbaToString({ r, g, b, a }: RGBA): string {
  const alpha = Math.round(a * 1000) / 1000;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Return `color` with its alpha channel replaced by `alpha` (0..1). */
export function opacify(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return rgbaToString({ ...parsed, a: alpha });
}

/** Linearly interpolate between two colors; `amount` 0 returns `from`, 1 returns `to`. */
export function interpolateColor(from: string, to: string, amount: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return from;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return rgbaToString({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b), a: a.a + (b.a - a.a) * amount });
}
