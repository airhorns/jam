// Anchored positioning for popovers, tooltips and menus: place a fixed
// element next to its anchor, flip to the opposite side when it would
// overflow the viewport, and shift it back inside the viewport padding.

import type { FloatingPosition } from "./layers";
import { readFloatingPosition, writeFloatingPosition } from "./layers";

export type Side = "top" | "bottom" | "left" | "right";
export type Alignment = "start" | "center" | "end";
export type Placement = Side | `${Side}-${Exclude<Alignment, "center">}`;

export type Rect = { x: number; y: number; width: number; height: number };

export type ComputePositionOptions = {
  placement?: Placement;
  /** Gap between anchor and floating element. */
  offset?: number;
  /** Minimum distance from the viewport edges. */
  padding?: number;
  viewport: { width: number; height: number };
};

const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

export function splitPlacement(placement: Placement): { side: Side; align: Alignment } {
  const [side, align] = placement.split("-") as [Side, Alignment | undefined];
  return { side, align: align ?? "center" };
}

function coordsFor(side: Side, align: Alignment, anchor: Rect, floating: Rect, offset: number): { x: number; y: number } {
  const alignOn = (start: number, anchorLen: number, floatLen: number) =>
    align === "start" ? start : align === "end" ? start + anchorLen - floatLen : start + anchorLen / 2 - floatLen / 2;
  switch (side) {
    case "top":
      return { x: alignOn(anchor.x, anchor.width, floating.width), y: anchor.y - floating.height - offset };
    case "bottom":
      return { x: alignOn(anchor.x, anchor.width, floating.width), y: anchor.y + anchor.height + offset };
    case "left":
      return { x: anchor.x - floating.width - offset, y: alignOn(anchor.y, anchor.height, floating.height) };
    case "right":
      return { x: anchor.x + anchor.width + offset, y: alignOn(anchor.y, anchor.height, floating.height) };
  }
}

function overflows(side: Side, pos: { x: number; y: number }, floating: Rect, viewport: { width: number; height: number }, padding: number): boolean {
  switch (side) {
    case "top":
      return pos.y < padding;
    case "bottom":
      return pos.y + floating.height > viewport.height - padding;
    case "left":
      return pos.x < padding;
    case "right":
      return pos.x + floating.width > viewport.width - padding;
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Compute where to put `floating` relative to `anchor`. Flips to the
 * opposite side when the preferred side overflows and the other fits
 * better, then shifts along the cross axis to stay inside the viewport.
 * The arrow coordinate points at the anchor's centre, relative to the
 * floating element.
 */
export function computePosition(anchor: Rect, floating: Rect, options: ComputePositionOptions): FloatingPosition {
  const { offset = 0, padding = 8, viewport } = options;
  let { side, align } = splitPlacement(options.placement ?? "bottom");

  let pos = coordsFor(side, align, anchor, floating, offset);
  if (overflows(side, pos, floating, viewport, padding)) {
    const flipped = coordsFor(opposite[side], align, anchor, floating, offset);
    if (!overflows(opposite[side], flipped, floating, viewport, padding)) {
      side = opposite[side];
      pos = flipped;
    }
  }

  const vertical = side === "top" || side === "bottom";
  if (vertical) {
    pos.x = clamp(pos.x, padding, viewport.width - padding - floating.width);
  } else {
    pos.y = clamp(pos.y, padding, viewport.height - padding - floating.height);
  }

  const result: FloatingPosition = {
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    placement: align === "center" ? side : `${side}-${align}`,
  };
  if (vertical) {
    result.arrowX = Math.round(clamp(anchor.x + anchor.width / 2 - pos.x, 8, floating.width - 8));
  } else {
    result.arrowY = Math.round(clamp(anchor.y + anchor.height / 2 - pos.y, 8, floating.height - 8));
  }
  return result;
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/**
 * Measure the layer's anchor and content in the DOM and store the resulting
 * position as a fact. Used as a layer's `onReposition`.
 */
export function repositionLayer(id: string, options: Omit<ComputePositionOptions, "viewport">): void {
  if (typeof document === "undefined") return;
  const anchor = document.querySelector(`[data-layer-anchor="${id}"]`);
  const content = document.querySelector(`[data-layer="${id}"]`);
  if (!anchor || !content) return;
  const position = computePosition(rectOf(anchor), rectOf(content), {
    ...options,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
  writeFloatingPosition(id, position);
}

/**
 * Inline style for a floating layer's content: fixed at the computed
 * position, or parked invisibly at the origin until the first measurement.
 */
export function floatingStyle(id: string): { position: FloatingPosition | undefined; style: Record<string, string | number> } {
  const position = readFloatingPosition(id);
  if (!position) {
    return { position, style: { position: "fixed", top: 0, left: 0, visibility: "hidden" } };
  }
  return { position, style: { position: "fixed", top: `${position.y}px`, left: `${position.x}px` } };
}

/** Where the arrow sits on the content for a resolved placement. */
export function arrowStyle(position: FloatingPosition | undefined, size = 8): Record<string, string | number> {
  if (!position) return { display: "none" };
  const { side } = splitPlacement(position.placement as Placement);
  const half = size / 2;
  const base: Record<string, string | number> = { position: "absolute", width: `${size}px`, height: `${size}px`, transform: "rotate(45deg)" };
  switch (side) {
    case "bottom":
      return { ...base, top: `${-half}px`, left: `${(position.arrowX ?? 0) - half}px` };
    case "top":
      return { ...base, bottom: `${-half}px`, left: `${(position.arrowX ?? 0) - half}px` };
    case "right":
      return { ...base, left: `${-half}px`, top: `${(position.arrowY ?? 0) - half}px` };
    case "left":
      return { ...base, right: `${-half}px`, top: `${(position.arrowY ?? 0) - half}px` };
  }
}
