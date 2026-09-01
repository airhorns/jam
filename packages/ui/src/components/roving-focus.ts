// Shared arrow-key navigation for composite widgets (RadioGroup, ToggleGroup,
// Tabs, Accordion). A single `onKeyDown` on the group container walks its
// items in the DOM, so no per-item registration or lifecycle is needed.

export type RovingOrientation = "horizontal" | "vertical" | "both";

export type RovingDirection = "ltr" | "rtl";

export type RovingFocusOptions = {
  orientation?: RovingOrientation;
  /** Reading direction; `rtl` swaps ArrowLeft and ArrowRight. */
  dir?: RovingDirection;
  /** Wrap around at the ends. */
  loop?: boolean;
  /** Run for the item the keypress moved to, after it is focused. */
  onMove?: (item: HTMLElement, index: number) => void;
};

const prevKeys = new Set(["ArrowLeft", "ArrowUp"]);
const nextKeys = new Set(["ArrowRight", "ArrowDown"]);

function logicalKey(key: string, dir: RovingDirection): string {
  if (dir !== "rtl") return key;
  if (key === "ArrowLeft") return "ArrowRight";
  if (key === "ArrowRight") return "ArrowLeft";
  return key;
}

function allowedKey(key: string, orientation: RovingOrientation): boolean {
  if (orientation === "both") return true;
  if (orientation === "vertical") return key !== "ArrowLeft" && key !== "ArrowRight";
  return key !== "ArrowUp" && key !== "ArrowDown";
}

/** Enabled items of a group, in DOM order. `aria-disabled` items stay reachable, as in Radix. */
export function rovingItems(container: Element, selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("disabled") && !el.hasAttribute("data-disabled"),
  );
}

/**
 * Move focus between `selector` items inside `event.currentTarget` for arrow,
 * Home and End keys pressed on one of the items. Returns the item that was
 * focused, or null when the key was not a navigation key for this orientation
 * or came from somewhere other than an item (a focusable nested inside one).
 */
export function rovingFocus(event: KeyboardEvent, selector: string, options: RovingFocusOptions = {}): HTMLElement | null {
  const { orientation = "horizontal", dir = "ltr", loop = true, onMove } = options;
  const key = logicalKey(event.key, dir);
  const isPrev = prevKeys.has(key);
  const isNext = nextKeys.has(key);
  if ((isPrev || isNext) && !allowedKey(key, orientation)) return null;
  if (!isPrev && !isNext && key !== "Home" && key !== "End") return null;

  const target = event.target as HTMLElement | null;
  if (!target?.matches(selector)) return null;
  const container = event.currentTarget as HTMLElement;
  const items = rovingItems(container, selector);
  if (items.length === 0) return null;

  const from = items.indexOf(target);

  let index: number;
  if (key === "Home") index = 0;
  else if (key === "End") index = items.length - 1;
  else if (from === -1) index = isNext ? 0 : items.length - 1;
  else {
    index = from + (isNext ? 1 : -1);
    if (index < 0) index = loop ? items.length - 1 : 0;
    else if (index >= items.length) index = loop ? 0 : items.length - 1;
  }

  const item = items[index];
  event.preventDefault();
  item.focus();
  onMove?.(item, index);
  return item;
}
