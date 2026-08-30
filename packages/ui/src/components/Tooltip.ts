import { Portal, useCleanup } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { steppedSpace, tokenValue } from "../variants";
import { useControllableState, useStableId } from "../state";
import { useDismissableLayer } from "../layers";
import { repositionLayer } from "../floating";
import type { Placement } from "../floating";
import { FloatingArrow, PopoverArrowFrame, PopoverContentFrame, floatingContentProps } from "./Popover";
import type { PopoverArrowProps } from "./Popover";
import { Slot } from "./Slot";
import { SizableText, wrapChildrenInText } from "./Text";
import type { TextParentProps } from "./Text";

export type TooltipContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  placement: Placement;
  contentId: string;
  delay: number;
  skipDelayDuration: number;
};

export const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext(part: string): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error(`Tooltip.${part} must be rendered inside <Tooltip>`);
  return ctx;
}

const openTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Ids currently mid-pointerdown, so the focus a mouse click causes doesn't reopen the tooltip. */
const pointerDownIds = new Map<string, boolean>();
/** Open tooltips' close functions, so opening one closes any other that's open. */
const openTooltips = new Map<string, () => void>();
/** Mounted tooltip ids; the pool below resets once none remain, so tests (and separate app instances) start clean. */
const mountedTooltips = new Set<string>();
let lastCloseAt: number | undefined;

function cancelOpen(id: string): void {
  const timer = openTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    openTimers.delete(id);
  }
}

/** Only one tooltip is open at a time, as with Radix's `tooltip.open` event. */
function openTooltip(ctx: TooltipContextValue): void {
  for (const [otherId, close] of Array.from(openTooltips.entries())) {
    if (otherId !== ctx.id) close();
  }
  openTooltips.set(ctx.id, () => ctx.setOpen(false));
  ctx.setOpen(true);
}

/** Opens immediately when there's no delay, or another tooltip closed within `skipDelayDuration`. */
function scheduleOpen(ctx: TooltipContextValue): void {
  cancelOpen(ctx.id);
  const skipDelay = lastCloseAt !== undefined && Date.now() - lastCloseAt < ctx.skipDelayDuration;
  if (ctx.delay <= 0 || skipDelay) {
    openTooltip(ctx);
    return;
  }
  openTimers.set(
    ctx.id,
    setTimeout(() => {
      openTimers.delete(ctx.id);
      openTooltip(ctx);
    }, ctx.delay),
  );
}

/** Merges a caller's `aria-describedby` with the tooltip content id, like Radix's `concatAriaDescribedby`. */
function concatAriaDescribedby(...values: (string | undefined)[]): string | undefined {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const token of value.split(/\s+/)) if (token) ids.add(token);
  }
  return ids.size > 0 ? Array.from(ids).join(" ") : undefined;
}

export type TooltipProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Preferred side; flips when it would leave the viewport (default "top"). */
  placement?: Placement;
  /** Gap in px between trigger and content (default 6). */
  offset?: number;
  /** Hover delay in ms before opening (default 400). Focus opens immediately. */
  delay?: number;
  /**
   * Reopening any tooltip within this many ms of the last tooltip closing
   * skips the hover delay (default 300). There is no `Tooltip.Provider`; this
   * pooling is global across every mounted `Tooltip`.
   */
  skipDelayDuration?: number;
  children?: VChild | VChild[];
};

function TooltipRoot(props: TooltipProps): VNode {
  const id = useStableId("tooltip");
  mountedTooltips.add(id);
  useCleanup(() => {
    cancelOpen(id);
    pointerDownIds.delete(id);
    openTooltips.delete(id);
    mountedTooltips.delete(id);
    if (mountedTooltips.size === 0) lastCloseAt = undefined;
  });
  const placement = props.placement ?? "top";
  const offset = props.offset ?? 6;
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: (next) => {
      if (!next) {
        lastCloseAt = Date.now();
        openTooltips.delete(id);
      }
      props.onOpenChange?.(next);
    },
  });
  const open = openState === true;
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal: false,
    autoFocus: false,
    restoreFocus: false,
    onReposition: () => repositionLayer(id, { placement, offset }),
  });
  const value: TooltipContextValue = {
    id,
    open,
    setOpen,
    placement,
    contentId: `${id}-content`,
    delay: props.delay ?? 400,
    skipDelayDuration: props.skipDelayDuration ?? 300,
  };
  return h(TooltipContext.Provider, { value }, props.children);
}
TooltipRoot.displayName = "Tooltip";

// ---- Trigger ----

export const TooltipTriggerFrame = styled("span", {
  name: "TooltipTrigger",
  defaultProps: {
    display: "inline-flex",
    tabIndex: 0,
  },
});

export type TooltipTriggerProps = StyledProps & {
  asChild?: boolean;
};

function TooltipTrigger(props: TooltipTriggerProps): VNode {
  const ctx = useTooltipContext("Trigger");
  const { asChild, "aria-describedby": describedBy, ...rest } = props;
  const close = () => {
    cancelOpen(ctx.id);
    if (ctx.open) ctx.setOpen(false);
  };
  return h(asChild ? Slot : TooltipTriggerFrame, {
    ...rest,
    "data-state": ctx.open ? "open" : "closed",
    "data-layer-trigger": ctx.id,
    "aria-describedby": ctx.open ? concatAriaDescribedby(describedBy as string | undefined, ctx.contentId) : (describedBy as string | undefined),
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      scheduleOpen(ctx);
    },
    onPointerLeave: close,
    onPointerDown: () => {
      pointerDownIds.set(ctx.id, true);
      document.addEventListener(
        "pointerup",
        () => pointerDownIds.delete(ctx.id),
        { once: true },
      );
      close();
    },
    onFocus: () => {
      if (pointerDownIds.get(ctx.id)) return;
      cancelOpen(ctx.id);
      openTooltip(ctx);
    },
    onBlur: close,
  });
}
TooltipTrigger.displayName = "TooltipTrigger";

// ---- Content / Arrow ----

export const TooltipContentFrame = styled(PopoverContentFrame, {
  name: "Tooltip",
  variants: {
    unstyled: {
      false: {
        size: "$3",
        alignItems: "center",
        pointerEvents: "none",
        borderWidth: 0,
        userSelect: "none",
      },
    },
    size: {
      "...size": (value, extras) => ({
        paddingHorizontal: tokenValue(extras.tokens, "space", value),
        paddingVertical: steppedSpace(extras.tokens, value, -2),
        borderRadius: tokenValue(extras.tokens, "radius", value),
      }),
      ":number": (value: number) => ({ paddingHorizontal: value, paddingVertical: value * 0.5, borderRadius: value * 0.5 }),
    },
  },
});

export const TooltipText = styled(SizableText, {
  name: "TooltipText",
  defaultProps: {
    size: "$2",
    color: "$color",
    textAlign: "center",
  },
});

export type TooltipContentProps = StyledProps &
  TextParentProps & {
    size?: string | number;
    unstyled?: boolean;
  };

function TooltipContent(props: TooltipContentProps): VNode | null {
  const ctx = useTooltipContext("Content");
  if (!ctx.open) return null;
  const { children, noTextWrap, textProps, ...rest } = props;
  const { attrs } = floatingContentProps(ctx.id, ctx.placement, rest);
  return h(
    Portal,
    null,
    h(
      TooltipContentFrame,
      { id: ctx.contentId, role: "tooltip", "data-state": "open", ...attrs },
      ...wrapChildrenInText(TooltipText, children, { noTextWrap, textProps }),
    ),
  );
}
TooltipContent.displayName = "TooltipContent";

export const TooltipArrowFrame = styled(PopoverArrowFrame, {
  name: "TooltipArrow",
  variants: {
    unstyled: {
      false: {
        borderWidth: 0,
      },
    },
  },
});

function TooltipArrow(props: PopoverArrowProps): VNode {
  const ctx = useTooltipContext("Arrow");
  return h(FloatingArrow, { ...props, layerId: ctx.id, frame: TooltipArrowFrame });
}
TooltipArrow.displayName = "TooltipArrow";

/**
 * Tooltip: a short label that appears near its trigger on hover or focus.
 * Uses the accent "Tooltip" component theme so it reads as an inverted chip.
 *
 *   <Tooltip>
 *     <Tooltip.Trigger asChild><Button icon={<Info />} /></Tooltip.Trigger>
 *     <Tooltip.Content>
 *       <Tooltip.Arrow />
 *       More information
 *     </Tooltip.Content>
 *   </Tooltip>
 */
export const Tooltip = Object.assign(TooltipRoot, {
  Trigger: TooltipTrigger,
  Content: TooltipContent,
  Arrow: TooltipArrow,
  Text: TooltipText,
});
