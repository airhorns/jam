import { vi } from "vitest";
import type { VChild } from "@jam/core/jsx";
import { render } from "../../testing";

/** Render `vnode` and return the message of the error its components threw, if any (the renderer reports them through console.error). */
export function renderError(vnode: VChild): string | undefined {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(vnode);
    const error = errorSpy.mock.calls.flat().find((arg): arg is Error => arg instanceof Error);
    return error?.message;
  } finally {
    errorSpy.mockRestore();
  }
}
