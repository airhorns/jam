import { styled } from "../styled";

/**
 * Slot: merges its props (attributes, classes and handlers) onto its single
 * child instead of rendering an element of its own. Compound parts use it to
 * implement `asChild`:
 *
 *   <Dialog.Trigger asChild><Button>Open</Button></Dialog.Trigger>
 *
 * With anything other than exactly one element child it falls back to a span.
 */
export const Slot = styled("span", {
  defaultProps: {
    asChild: true,
  },
});
Slot.displayName = "Slot";
