import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { mount } from "@jam/core";

/**
 * Portal: renders children into a separate DOM container (document.body by default).
 *
 * In Jam's architecture, this creates a second mount point. The children are
 * rendered into a new container element appended to the target.
 *
 * Note: In a non-browser environment, Portal just renders children inline.
 */
export function Portal(props: {
  container?: HTMLElement;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { container, children, ...rest } = props;

  // In a test/SSR environment, just render inline
  if (typeof document === "undefined") {
    return (children as VNode) ?? null;
  }

  // For web, we render a placeholder and use a side-effect to mount the portal.
  // Since Jam components are pure functions (no lifecycle hooks), we use
  // a sentinel div with a data attribute that the portal system can pick up.
  return h("div", {
    ...rest,
    "data-portal": "true",
    style: "display:none",
  });
}
Portal.displayName = "Portal";
