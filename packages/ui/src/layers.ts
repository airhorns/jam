// Dismissable layers: one document-level program that closes the topmost
// open overlay on Escape, outside press or (opt-in) focus moving outside,
// traps Tab inside modal layers, locks body scroll while a modal is open,
// and restores focus on close.
//
// Components register while rendering (`useDismissableLayer`) and mark
// their DOM with `data-layer={id}` (content), `data-layer-trigger={id}` and
// optionally `data-layer-anchor={id}` so the program can tell inside from
// outside and floating.ts knows what to position against.

import { $, _, db, forget, replace, useCleanup, when } from "@jam/core";

export type LayerOptions = {
  onDismiss: () => void;
  /** Close on Escape (default true). */
  dismissOnEscape?: boolean;
  /** Close on pointerdown outside the content and anchor (default true). */
  dismissOnOutsidePress?: boolean;
  /** Close when focus lands outside the content, trigger and anchor (default false). */
  dismissOnFocusOutside?: boolean;
  /** Trap Tab focus inside the content and lock body scroll. */
  modal?: boolean;
  /** Move focus into the content when it opens (default: modal). */
  autoFocus?: boolean;
  /** Selector for the element to focus on open when nothing inside carries `autofocus` (default: first focusable). */
  initialFocus?: string;
  /** Return focus to the previously focused element on close (default: modal). */
  restoreFocus?: boolean;
  /** Keep this layer's floating position up to date (see floating.ts). */
  onReposition?: () => void;
};

type Layer = LayerOptions & {
  id: string;
  previouslyFocused: HTMLElement | null;
  focused: boolean;
};

const layers = new Map<string, Layer>();
let listenersInstalled = false;
let scrollLocked: string | null = null;

function contentElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-layer="${id}"]`);
}

function isInsideLayer(id: string, target: Node | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`[data-layer="${id}"], [data-layer-trigger="${id}"], [data-layer-anchor="${id}"]`) != null;
}

/** Drop layers whose content has left the document without their component being cleaned up. */
function prune(): void {
  for (const id of Array.from(layers.keys())) {
    if (!contentElement(id)) closeLayer(id);
  }
}

function closeLayer(id: string): void {
  const layer = layers.get(id);
  if (!layer) return;
  layers.delete(id);
  finishLayer(layer);
}

function topmost(): Layer | undefined {
  let last: Layer | undefined;
  for (const layer of layers.values()) last = layer;
  return last;
}

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']):not([disabled]), [contenteditable='true']";

export function focusableElements(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden);
}

function onKeyDown(event: KeyboardEvent): void {
  prune();
  const layer = topmost();
  if (!layer) return;
  if (event.key === "Escape" && layer.dismissOnEscape !== false) {
    event.preventDefault();
    layer.onDismiss();
    return;
  }
  if (event.key === "Tab" && layer.modal) {
    const content = contentElement(layer.id);
    if (!content) return;
    const focusables = focusableElements(content);
    if (focusables.length === 0) {
      event.preventDefault();
      content.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !content.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !content.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}

function onPointerDown(event: PointerEvent | MouseEvent): void {
  prune();
  const layer = topmost();
  if (!layer || layer.dismissOnOutsidePress === false) return;
  if (isInsideLayer(layer.id, event.target as Node)) return;
  layer.onDismiss();
}

function onFocusIn(event: FocusEvent): void {
  prune();
  const layer = topmost();
  if (!layer || !layer.dismissOnFocusOutside) return;
  const target = event.target as Node;
  // Focus falling back to the document when a nested layer unmounts is not the user leaving.
  if (target === document.body || target === document.documentElement) return;
  if (isInsideLayer(layer.id, target)) return;
  layer.onDismiss();
}

function onReposition(): void {
  for (const layer of layers.values()) layer.onReposition?.();
}

function installListeners(): void {
  if (listenersInstalled || typeof document === "undefined") return;
  listenersInstalled = true;
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusin", onFocusIn, true);
  window.addEventListener("scroll", onReposition, true);
  window.addEventListener("resize", onReposition);
}

function updateScrollLock(): void {
  if (typeof document === "undefined") return;
  let modal: Layer | undefined;
  for (const layer of layers.values()) if (layer.modal) modal = layer;
  if (modal && scrollLocked == null) {
    scrollLocked = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else if (!modal && scrollLocked != null) {
    document.body.style.overflow = scrollLocked;
    scrollLocked = null;
  }
}

function startLayer(layer: Layer): void {
  installListeners();
  updateScrollLock();
  queueMicrotask(() => {
    if (!layers.has(layer.id)) return;
    const content = contentElement(layer.id);
    if (!content) return;
    layer.onReposition?.();
    if ((layer.autoFocus ?? layer.modal) && !layer.focused) {
      layer.focused = true;
      if (!content.contains(document.activeElement)) {
        const preferred = layer.initialFocus ? content.querySelector<HTMLElement>(layer.initialFocus) : null;
        const target = content.querySelector<HTMLElement>("[autofocus]") ?? preferred ?? focusableElements(content)[0] ?? content;
        target.focus();
      }
    }
  });
}

function finishLayer(layer: Layer): void {
  updateScrollLock();
  queueMicrotask(() => clearFloatingPosition(layer.id));
  const previous = layer.previouslyFocused;
  if ((layer.restoreFocus ?? layer.modal) && previous) {
    queueMicrotask(() => {
      if (!previous.isConnected) return;
      const active = document.activeElement;
      if (active == null || active === document.body || !active.isConnected) previous.focus();
    });
  }
}

/**
 * Register (while `open`) or unregister the current component as a
 * dismissable layer. Call it on every render; the options are refreshed so
 * handlers never go stale, and the layer is closed when the component leaves
 * the tree. Returns the attributes to spread on the content element.
 */
export function useDismissableLayer(id: string, open: boolean, options: LayerOptions): { "data-layer": string; tabIndex: number } {
  useCleanup(() => closeLayer(id));
  if (typeof document !== "undefined") {
    const existing = layers.get(id);
    if (open && !existing) {
      const layer: Layer = {
        id,
        ...options,
        previouslyFocused: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        focused: false,
      };
      layers.set(id, layer);
      startLayer(layer);
    } else if (open && existing) {
      Object.assign(existing, options);
    } else if (!open && existing) {
      closeLayer(id);
    }
  }
  return { "data-layer": id, tabIndex: -1 };
}

/** True when `id` is the layer that will receive Escape/outside presses. */
export function isTopmostLayer(id: string): boolean {
  return topmost()?.id === id;
}

/** Forget every layer and release the scroll lock (for tests and hot reload). */
export function resetLayers(): void {
  layers.clear();
  if (typeof document !== "undefined" && scrollLocked != null) {
    document.body.style.overflow = scrollLocked;
    scrollLocked = null;
  }
}

// ---- Floating position facts ----
//
// Layers that float next to an anchor store their computed position as a
// fact so the content re-renders when it changes.

export type FloatingPosition = {
  x: number;
  y: number;
  placement: string;
  arrowX?: number;
  arrowY?: number;
  anchorWidth: number;
  anchorHeight: number;
};

export function readFloatingPosition(id: string): FloatingPosition | undefined {
  const rows = when([id, "floating", $.json]);
  return rows.length > 0 ? (JSON.parse(rows[0].json as string) as FloatingPosition) : undefined;
}

export function writeFloatingPosition(id: string, position: FloatingPosition): void {
  const json = JSON.stringify(position);
  const rows = db.index([id, "floating", $.json]).get();
  if (rows.length > 0 && rows[0].json === json) return;
  replace(id, "floating", json);
}

export function clearFloatingPosition(id: string): void {
  forget(id, "floating", _);
}
