import { $, replace, useComponentId, when } from "@jam/core";
import type { Term } from "@jam/core";

export type ControllableStateOptions<T> = {
  /** Controlled value; when defined the component never stores its own. */
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
};

/**
 * Controlled/uncontrolled state for the component being rendered. The
 * uncontrolled value lives in the fact DB under the component's id, so it
 * survives re-renders and can be inspected or driven by other programs.
 */
export function useControllableState<T extends Term>(
  key: string,
  options: ControllableStateOptions<T>,
): [T | undefined, (value: T) => void] {
  const id = useComponentId();
  const controlled = options.value !== undefined;
  const stored = when([id, key, $.value]);
  const current = controlled ? options.value : stored.length > 0 ? (stored[0].value as T) : options.defaultValue;
  const update = (next: T) => {
    if (next === current) return;
    options.onChange?.(next);
    if (!controlled) replace(id, key, next);
  };
  return [current, update];
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
