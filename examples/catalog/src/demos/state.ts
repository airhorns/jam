import { $, replace, when } from "@jam/core";

type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T;

/**
 * Minimal demo-local state stored in the fact database:
 * `["demo", key, value]`. Reads are reactive when called during render.
 */
export function useDemoState<T extends string | number | boolean>(
  key: string,
  initial: T,
): [Widen<T>, (next: Widen<T>) => void] {
  const rows = when(["demo", key, $.v]);
  const value = rows.length > 0 ? (rows[0].v as Widen<T>) : (initial as Widen<T>);
  return [value, (next) => replace("demo", key, next)];
}
