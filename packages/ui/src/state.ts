import { $, _, forget, replace, useCleanup, useComponentId, when } from "@jam/core";
import type { Term } from "@jam/core";

export type ControllableStateOptions<T> = {
  /** Controlled value; when defined the component never stores its own. */
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
};

/** Ids of components currently in the tree; a setter invoked after unmount (a late blur, image error or timer) must not write. */
const mounted = new Set<string>();

/**
 * Controlled/uncontrolled state for the component being rendered. The
 * uncontrolled value lives in the fact DB under the component's id, so it
 * survives re-renders and can be inspected or driven by other programs; it is
 * forgotten when the component leaves the tree, so a later component at the
 * same position starts from its default. The third element returns to
 * `defaultValue`; when there is none it clears the stored value, which the
 * setter cannot express, and reports the given `empty` value (`""` for a
 * radio group or select, as the DOM does) to `onChange`.
 */
export function useControllableState<T extends Term>(
  key: string,
  options: ControllableStateOptions<T>,
): [T | undefined, (value: T) => void, (empty: T) => void] {
  const id = useComponentId();
  const controlled = options.value !== undefined;
  mounted.add(id);
  useCleanup(() => {
    mounted.delete(id);
    forget(id, key, _);
  });
  const read = (): T | undefined => {
    const stored = when([id, key, $.value]);
    return controlled ? options.value : stored.length > 0 ? (stored[0].value as T) : options.defaultValue;
  };
  // Compare against the live value so a setter kept from an earlier render (a timer, another component's close) still sees changes made since.
  const update = (next: T) => {
    if (!mounted.has(id) || next === read()) return;
    options.onChange?.(next);
    if (!controlled) replace(id, key, next);
  };
  const reset = (empty: T) => {
    if (options.defaultValue !== undefined) return update(options.defaultValue);
    if (!mounted.has(id)) return;
    const current = read();
    if (current === undefined || current === empty) return;
    options.onChange?.(empty);
    if (!controlled) forget(id, key, _);
  };
  return [read(), update, reset];
}

/** Like `useControllableState` for string arrays, stored as one JSON fact. */
export function useControllableList(
  key: string,
  options: ControllableStateOptions<string[]>,
): [string[], (value: string[]) => void] {
  const [json, setJson] = useControllableState<string>(key, {
    value: options.value === undefined ? undefined : JSON.stringify(options.value),
    defaultValue: JSON.stringify(options.defaultValue ?? []),
    onChange: options.onChange ? (v) => options.onChange!(JSON.parse(v)) : undefined,
  });
  return [json ? (JSON.parse(json) as string[]) : [], (next) => setJson(JSON.stringify(next))];
}

/** A stable, DOM-safe id for the current component, for `id`/`aria-*` wiring. */
export function useStableId(suffix = ""): string {
  const base = useComponentId().replace(/[^a-zA-Z0-9_-]/g, "_");
  return suffix ? `${base}-${suffix}` : base;
}
