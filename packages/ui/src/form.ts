import { useCleanup, useComponentId } from "@jam/core";
import type { ElementRef } from "@jam/core";

type Control = { element: HTMLElement | null; onReset: () => void };

const controls = new Map<string, Control>();
let listening = false;

function onDocumentReset(event: Event) {
  const form = event.target as Node;
  for (const control of controls.values()) {
    if (control.element && form.contains(control.element)) control.onReset();
  }
}

/**
 * Props for a form control's mirrored hidden input so `onReset` runs when the
 * owning `<form>` resets. The latest `onReset` is always the one invoked.
 */
export function useFormReset(onReset: () => void): { __jamElementRef: ElementRef } {
  const id = useComponentId();
  const control = controls.get(id) ?? { element: null, onReset };
  control.onReset = onReset;
  controls.set(id, control);
  useCleanup(() => controls.delete(id));
  if (!listening && typeof document !== "undefined") {
    document.addEventListener("reset", onDocumentReset, true);
    listening = true;
  }
  return {
    __jamElementRef(element) {
      control.element = element;
    },
  };
}
