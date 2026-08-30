// Shared arrow-key navigation for composite widgets (RadioGroup, ToggleGroup,
// Tabs, Accordion). A single `onKeyDown` on the group container walks its
// items in the DOM, so no per-item registration or lifecycle is needed.

export type RovingOrientation = "horizontal" | "vertical" | "both";

export type RovingFocusOptions = {
  orientation?: RovingOrientation;
  /** Wrap around at the ends. */
  loop?: boolean;
  /** Run for the item the keypress moved to, after it is focused. */
  onMove?: (item: HTMLElement, index: number) => void;
};

const prevKeys = new Set(["ArrowLeft", "ArrowUp"]);
const nextKeys = new Set(["ArrowRight", "ArrowDown"]);

function allowedKey(key: string, orientation: RovingOrientation): boolean {
  if (orientation === "both") return true;
  if (orientation === "vertical") return key !== "ArrowLeft" && key !== "ArrowRight";
  return key !== "ArrowUp" && key !== "ArrowDown";
}

/** Enabled, focusable items of a group, in DOM order. */
export function rovingItems(container: Element, selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true" && el.dataset.disabled !== "true",
  );
}

/**
 * Move focus between `selector` items inside `event.currentTarget` for arrow,
 * Home and End keys. Returns the item that was focused, or null when the key
 * was not a navigation key for this orientation.
 */
export function rovingFocus(event: KeyboardEvent, selector: string, options: RovingFocusOptions = {}): HTMLElement | null {
  const { orientation = "horizontal", loop = true, onMove } = options;
  const key = event.key;
  const isPrev = prevKeys.has(key);
  const isNext = nextKeys.has(key);
  if ((isPrev || isNext) && !allowedKey(key, orientation)) return null;
  if (!isPrev && !isNext && key !== "Home" && key !== "End") return null;

  const container = event.currentTarget as HTMLElement;
  const items = rovingItems(container, selector);
  if (items.length === 0) return null;

  const active = document.activeElement as HTMLElement | null;
  const from = active ? items.indexOf(active) : -1;

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

/** `tabIndex` for roving focus: only the active item (or the first, when none is active) is tabbable. */
export function rovingTabIndex(isActive: boolean, anyActive: boolean, isFirst: boolean): number {
  if (isActive) return 0;
  return !anyActive && isFirst ? 0 : -1;
}
