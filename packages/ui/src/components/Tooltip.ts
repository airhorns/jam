import { Portal } from "@jam/core";
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
};

export const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext(part: string): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error(`Tooltip.${part} must be rendered inside <Tooltip>`);
  return ctx;
}

const openTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelOpen(id: string): void {
  const timer = openTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    openTimers.delete(id);
  }
}

function scheduleOpen(ctx: TooltipContextValue): void {
  cancelOpen(ctx.id);
  if (ctx.delay <= 0) {
    ctx.setOpen(true);
    return;
  }
  openTimers.set(
    ctx.id,
    setTimeout(() => {
      openTimers.delete(ctx.id);
      ctx.setOpen(true);
    }, ctx.delay),
  );
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
  children?: VChild | VChild[];
};

function TooltipRoot(props: TooltipProps): VNode {
  const id = useStableId("tooltip");
  const placement = props.placement ?? "top";
  const offset = props.offset ?? 6;
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const open = openState === true;
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal: false,
    autoFocus: false,
    restoreFocus: false,
    onReposition: () => repositionLayer(id, { placement, offset }),
  });
  const value: TooltipContextValue = { id, open, setOpen, placement, contentId: `${id}-content`, delay: props.delay ?? 400 };
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
  const { asChild, ...rest } = props;
  const close = () => {
    cancelOpen(ctx.id);
    if (ctx.open) ctx.setOpen(false);
  };
  return h(asChild ? Slot : TooltipTriggerFrame, {
    ...rest,
    "data-state": ctx.open ? "open" : "closed",
    "data-layer-trigger": ctx.id,
    "aria-describedby": ctx.open ? ctx.contentId : undefined,
    onPointerEnter: () => scheduleOpen(ctx),
    onPointerLeave: close,
    onPointerDown: close,
    onFocus: () => {
      cancelOpen(ctx.id);
      ctx.setOpen(true);
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
