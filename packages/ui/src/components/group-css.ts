import { injectRule } from "../css";

// Grouped controls (ToggleGroup) need `:first-child`/`:last-child` selectors so
// only the outer corners stay rounded and adjacent borders collapse. Atomic
// style props cannot express child selectors, so the rules are injected once
// and applied with a class on the container.

const classNames = { horizontal: "jam-grouped-h", vertical: "jam-grouped-v" } as const;

/**
 * Class for a container whose direct children should read as one grouped
 * control: inner corners squared off and shared borders collapsed.
 */
export function groupedChildrenClass(orientation: "horizontal" | "vertical"): string {
  const cls = classNames[orientation];
  if (orientation === "horizontal") {
    injectRule(
      `${cls}-start`,
      `.${cls} > *:not(:first-child) { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -1px; }`,
    );
    injectRule(`${cls}-end`, `.${cls} > *:not(:last-child) { border-top-right-radius: 0; border-bottom-right-radius: 0; }`);
  } else {
    injectRule(
      `${cls}-start`,
      `.${cls} > *:not(:first-child) { border-top-left-radius: 0; border-top-right-radius: 0; margin-top: -1px; }`,
    );
    injectRule(`${cls}-end`, `.${cls} > *:not(:last-child) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }`);
  }
  return cls;
}

/** Class that removes the trailing border from a stack's last child (Accordion items). */
export function lastChildBorderlessClass(): string {
  const cls = "jam-last-borderless";
  injectRule(cls, `.${cls} > *:last-child { border-bottom-width: 0; }`);
  return cls;
}
