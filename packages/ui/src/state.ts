import { $, _, forget, replace, useCleanup, useComponentId, useDriver, when } from "@jam/core";
import type { Term } from "@jam/core";

export type ControllableStateOptions<T> = {
  /** Controlled value; when defined the component never stores its own. */
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Expose the state to `drive()`/`describeUI()` under its key (default true); false for internal bookkeeping. */
  drive?: boolean;
};

/** Read a driven value in the type the state currently holds, so `drive(id, "open", "true")` works like `true`. */
function coerce<T extends Term>(value: Term, like: T | undefined): T {
  if (typeof like === "boolean") return (value === true || value === "true") as T;
  if (typeof like === "number" && typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value) as T;
  return value as T;
}

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
 * radio group or select, as the DOM does) to `onChange`. The state is also
 * registered as a driver, so `drive(id, key, value)` goes through the same
 * setter a user's input would, controlled or not.
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
  if (options.drive !== false) {
    useDriver(key, { set: (next) => update(coerce(next, read() ?? options.defaultValue)), get: read });
  }
  return [read(), update, reset];
}

/** Like `useControllableState` for string arrays, stored as one JSON fact; driven with a JSON array or a single value. */
export function useControllableList(
  key: string,
  options: ControllableStateOptions<string[]>,
): [string[], (value: string[]) => void] {
  const [json, setJson] = useControllableState<string>(key, {
    value: options.value === undefined ? undefined : JSON.stringify(options.value),
    defaultValue: JSON.stringify(options.defaultValue ?? []),
    onChange: options.onChange ? (v) => options.onChange!(JSON.parse(v)) : undefined,
    drive: false,
  });
  const list = json ? (JSON.parse(json) as string[]) : [];
  const setList = (next: string[]) => setJson(JSON.stringify(next));
  if (options.drive !== false) {
    useDriver(key, { set: (next) => setList(parseList(next)), get: () => JSON.stringify(list) });
  }
  return [list, setList];
}

function parseList(value: Term): string[] {
  if (typeof value !== "string") return [String(value)];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Not JSON: a single item.
  }
  return value === "" ? [] : [value];
}

/** A stable, DOM-safe id for the current component, for `id`/`aria-*` wiring. */
export function useStableId(suffix = ""): string {
  const base = useComponentId().replace(/[^a-zA-Z0-9_-]/g, "_");
  return suffix ? `${base}-${suffix}` : base;
}
