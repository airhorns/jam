import { Portal, useCleanup } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { getSpaceSized, themeableVariants } from "../variants";
import { useControllableState, useStableId } from "../state";
import { readFloatingPosition, useDismissableLayer } from "../layers";
import type { FloatingPosition } from "../layers";
import { arrowStyle, floatingStyle, repositionLayer, splitPlacement } from "../floating";
import type { Placement, Side } from "../floating";
import { Button } from "./Button";
import { dataState } from "./Dialog";
import { Slot } from "./Slot";
import { YStack } from "./Stacks";

export type PopoverContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  placement: Placement;
  contentId: string;
  /** Pointer handlers shared by the trigger, anchor and content of a `hoverable` popover. */
  hover?: { onPointerEnter: () => void; onPointerLeave: () => void };
};

export const PopoverContext = createContext<PopoverContextValue | null>(null);

export function usePopoverContext(part: string): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error(`Popover.${part} must be rendered inside <Popover>`);
  return ctx;
}

export type PopoverProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Preferred side and alignment; flips when it would leave the viewport. */
  placement?: Placement;
  /** Gap in px between the anchor and the content (default 8). */
  offset?: number;
  /** Trap focus and lock scroll while open (default false). */
  modal?: boolean;
  dismissOnEscape?: boolean;
  dismissOnOutsidePress?: boolean;
  /** Close when keyboard focus leaves the popover (default: true unless `modal`). */
  dismissOnFocusOutside?: boolean;
  /**
   * Open while the pointer is over the trigger or content. `delay` (default 150ms) is the
   * grace period for moving between them; clicking the trigger keeps it open rather than toggling.
   */
  hoverable?: boolean | { delay?: number };
  /** Leave focus where it is when the popover opens (default: true when `hoverable`). */
  disableFocus?: boolean;
  children?: VChild | VChild[];
};

// Per-popover hover bookkeeping; the timer calls the latest `setOpen` so a stale close is a no-op once the state moved on.
const hoverState = new Map<string, { timer?: ReturnType<typeof setTimeout>; setOpen: (open: boolean) => void }>();

function PopoverRoot(props: PopoverProps): VNode {
  const id = useStableId("popover");
  useCleanup(() => {
    const state = hoverState.get(id);
    if (state?.timer !== undefined) clearTimeout(state.timer);
    hoverState.delete(id);
  });
  const placement = props.placement ?? "bottom";
  const offset = props.offset ?? 8;
  const hoverable = props.hoverable !== undefined && props.hoverable !== false;
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const open = openState === true;
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal: props.modal ?? false,
    autoFocus: !(props.disableFocus ?? hoverable),
    restoreFocus: true,
    dismissOnEscape: props.dismissOnEscape,
    dismissOnOutsidePress: props.dismissOnOutsidePress,
    dismissOnFocusOutside: props.dismissOnFocusOutside ?? !(props.modal ?? false),
    onReposition: () => repositionLayer(id, { placement, offset }),
  });
  let hover: PopoverContextValue["hover"];
  if (hoverable) {
    const delay = typeof props.hoverable === "object" ? props.hoverable.delay ?? 150 : 150;
    const state = hoverState.get(id) ?? { setOpen };
    state.setOpen = setOpen;
    hoverState.set(id, state);
    const cancelClose = () => {
      if (state.timer !== undefined) clearTimeout(state.timer);
      state.timer = undefined;
    };
    hover = {
      onPointerEnter: () => {
        cancelClose();
        state.setOpen(true);
      },
      onPointerLeave: () => {
        cancelClose();
        state.timer = setTimeout(() => {
          state.timer = undefined;
          state.setOpen(false);
        }, delay);
      },
    };
  }
  const value: PopoverContextValue = { id, open, setOpen, placement, contentId: `${id}-content`, hover };
  return h(PopoverContext.Provider, { value }, props.children);
}
PopoverRoot.displayName = "Popover";

// ---- Trigger / Anchor / Close ----

export type PopoverTriggerProps = StyledProps & {
  asChild?: boolean;
  onClick?: (event: MouseEvent) => void;
};

function PopoverTrigger(props: PopoverTriggerProps): VNode {
  const ctx = usePopoverContext("Trigger");
  const { asChild, onClick, ...rest } = props;
  return h(asChild ? Slot : Button, {
    ...ctx.hover,
    ...rest,
    "aria-haspopup": (rest as Record<string, unknown>)["aria-haspopup"] ?? "dialog",
    "aria-expanded": ctx.open,
    "aria-controls": ctx.open ? ctx.contentId : undefined,
    "data-state": dataState(ctx.open),
    "data-layer-trigger": ctx.id,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      ctx.setOpen(ctx.hover ? true : !ctx.open);
    },
  });
}
PopoverTrigger.displayName = "PopoverTrigger";

/** Position the content against this element instead of the trigger. */
function PopoverAnchor(props: StyledProps & { asChild?: boolean }): VNode {
  const ctx = usePopoverContext("Anchor");
  const { asChild, ...rest } = props;
  return h(asChild ? Slot : YStack, { ...ctx.hover, ...rest, "data-layer-anchor": ctx.id });
}
PopoverAnchor.displayName = "PopoverAnchor";

function PopoverClose(props: PopoverTriggerProps): VNode {
  const ctx = usePopoverContext("Close");
  const { asChild, onClick, ...rest } = props;
  return h(asChild ? Slot : Button, {
    ...rest,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      ctx.setOpen(false);
    },
  });
}
PopoverClose.displayName = "PopoverClose";

// ---- Content / Arrow ----

export const PopoverContentFrame = styled(YStack, {
  name: "PopoverContent",
  defaultProps: {
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        elevate: true,
        zIndex: 100_000,
        outlineStyle: "none",
      },
    },
    size: {
      "...size": getSpaceSized,
      ":number": getSpaceSized,
    },
    elevate: themeableVariants.elevate,
    elevation: themeableVariants.elevation,
    bordered: themeableVariants.bordered,
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** Slide in from the anchor's side. */
export function enterStyleFor(side: Side, distance = 6): Record<string, number> {
  switch (side) {
    case "bottom":
      return { opacity: 0, y: -distance };
    case "top":
      return { opacity: 0, y: distance };
    case "right":
      return { opacity: 0, x: -distance };
    case "left":
      return { opacity: 0, x: distance };
  }
}

/**
 * Attributes shared by every floating content element: fixed position, layer
 * id, resolved placement and a matching enter animation. The caller's own
 * `style` is merged over the positioning.
 */
export function floatingContentProps(id: string, fallback: Placement, props: Record<string, unknown>): { position: FloatingPosition | undefined; attrs: Record<string, unknown> } {
  const { position, style } = floatingStyle(id);
  const placement = (position?.placement as Placement | undefined) ?? fallback;
  const own = props.style;
  return {
    position,
    attrs: {
      "data-layer": id,
      "data-placement": placement,
      enterStyle: enterStyleFor(splitPlacement(placement).side),
      animateOnly: ["opacity", "transform"],
      ...props,
      style: own && typeof own === "object" ? { ...style, ...(own as Record<string, unknown>) } : style,
    },
  };
}

export type PopoverContentProps = StyledProps & {
  size?: string | number;
  elevate?: boolean;
  elevation?: string | number;
  bordered?: boolean | number;
  unstyled?: boolean;
};

function PopoverContent(props: PopoverContentProps): VNode | null {
  const ctx = usePopoverContext("Content");
  if (!ctx.open) return null;
  const { attrs } = floatingContentProps(ctx.id, ctx.placement, props);
  return h(
    Portal,
    null,
    h(PopoverContentFrame, {
      id: ctx.contentId,
      role: "dialog",
      "data-state": "open",
      tabIndex: -1,
      ...ctx.hover,
      ...attrs,
    }),
  );
}
PopoverContent.displayName = "PopoverContent";

export const PopoverArrowFrame = styled("span", {
  name: "PopoverArrow",
  variants: {
    unstyled: {
      false: {
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type PopoverArrowProps = StyledProps & {
  /** Arrow square size in px (default 8). */
  size?: number;
};

/** An arrow on the content edge that points at the anchor. Render it inside Content. */
export function FloatingArrow(props: PopoverArrowProps & { layerId: string; frame?: typeof PopoverArrowFrame }): VNode {
  const { layerId, frame = PopoverArrowFrame, size = 8, ...rest } = props;
  const position = readFloatingPosition(layerId);
  const { outer, inner } = arrowStyle(position, size);
  return h("span", { style: outer, "data-placement": position?.placement, "aria-hidden": "true" }, h(frame, { ...rest, style: inner }));
}

function PopoverArrow(props: PopoverArrowProps): VNode {
  const ctx = usePopoverContext("Arrow");
  return h(FloatingArrow, { ...props, layerId: ctx.id });
}
PopoverArrow.displayName = "PopoverArrow";

/**
 * Popover: non-modal floating content anchored to a trigger. Escape or a
 * press outside closes it; it flips sides when it would leave the viewport.
 *
 *   <Popover placement="bottom">
 *     <Popover.Trigger asChild><Button>Options</Button></Popover.Trigger>
 *     <Popover.Content>
 *       <Popover.Arrow />
 *       …
 *       <Popover.Close asChild><Button size="$2">Done</Button></Popover.Close>
 *     </Popover.Content>
 *   </Popover>
 */
export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Anchor: PopoverAnchor,
  Content: PopoverContent,
  Arrow: PopoverArrow,
  Close: PopoverClose,
});
