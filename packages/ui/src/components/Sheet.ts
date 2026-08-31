import { $, _, Portal, forget, replace, when } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { useControllableState, useStableId } from "../state";
import { useDismissableLayer } from "../layers";
import { dataState } from "./Dialog";
import { YStack } from "./Stacks";

export type SheetContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Snap point heights as percentages of the viewport, largest first. */
  snapPoints: number[];
  position: number;
  setPosition: (position: number) => void;
  dismissOnSnapToBottom: boolean;
  /** Current drag offset in px while the handle is being dragged. */
  dragOffset: number | undefined;
};

export const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext(part: string): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error(`Sheet.${part} must be rendered inside <Sheet>`);
  return ctx;
}

export type SheetProps = Omit<StyledProps, "position"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trap focus and lock body scroll while open (default true). */
  modal?: boolean;
  /** Heights the sheet can rest at, as viewport percentages, largest first (default [80]). */
  snapPoints?: number[];
  /** Controlled index into `snapPoints`. */
  position?: number;
  defaultPosition?: number;
  onPositionChange?: (position: number) => void;
  /** Dragging the handle below the smallest snap point closes the sheet (default true). */
  dismissOnSnapToBottom?: boolean;
  /** Close when pressing the overlay or anything else outside the sheet (default true). */
  dismissOnOverlayPress?: boolean;
  dismissOnEscape?: boolean;
  children?: VChild | VChild[];
};

function readDragOffset(id: string): number | undefined {
  const rows = when([id, "dragOffset", $.dy]);
  return rows.length > 0 ? (rows[0].dy as number) : undefined;
}

function isOverlayNode(child: VChild): boolean {
  return typeof child === "object" && child !== null && "__vnode" in child && child.tag === SheetOverlay;
}

function SheetRoot(props: SheetProps): VNode | null {
  const {
    open: openProp,
    defaultOpen,
    onOpenChange,
    modal = true,
    snapPoints = [80],
    position: positionProp,
    defaultPosition,
    onPositionChange,
    dismissOnSnapToBottom = true,
    dismissOnOverlayPress,
    dismissOnEscape,
    children,
    ...rest
  } = props;
  const id = useStableId("sheet");
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: openProp,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  });
  const open = openState === true;
  const [positionState, setPosition] = useControllableState<number>("position", {
    value: positionProp,
    defaultValue: defaultPosition ?? 0,
    onChange: onPositionChange,
  });
  const position = Math.min(Math.max(positionState ?? 0, 0), snapPoints.length - 1);
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal,
    autoFocus: true,
    restoreFocus: true,
    dismissOnEscape,
    dismissOnOutsidePress: dismissOnOverlayPress,
  });
  if (!open) return null;

  const dragOffset = readDragOffset(id);
  const value: SheetContextValue = { id, open, setOpen, snapPoints, position, setPosition, dismissOnSnapToBottom, dragOffset };
  const all = ([children] as VChild[]).flat(10);
  const overlays = all.filter(isOverlayNode);
  const body = all.filter((child) => !isOverlayNode(child));
  const style: Record<string, string> = { height: `${snapPoints[position]}%` };
  if (dragOffset !== undefined) {
    style.transform = `translateY(${dragOffset}px)`;
    style.transition = "none";
  }
  return h(
    Portal,
    null,
    h(
      SheetContext.Provider,
      { value },
      h(
        SheetPortalFrame,
        { "data-state": dataState(open) },
        ...overlays,
        h(
          SheetPositioner,
          {
            role: "dialog",
            "aria-modal": modal ? "true" : undefined,
            "data-state": dataState(open),
            "data-layer": id,
            "data-position": position,
            tabIndex: -1,
            ...rest,
            style: typeof rest.style === "object" && rest.style ? { ...style, ...(rest.style as Record<string, unknown>) } : style,
          },
          ...body,
        ),
      ),
    ),
  );
}
SheetRoot.displayName = "Sheet";

// ---- Frames ----

export const SheetPortalFrame = styled(YStack, {
  name: "SheetPortal",
  variants: {
    unstyled: {
      false: {
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 100_000,
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const SheetPositioner = styled(YStack, {
  name: "SheetPositioner",
  defaultProps: {
    animation: "medium",
  },
  variants: {
    unstyled: {
      false: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: "flex-end",
        pointerEvents: "auto",
        outlineStyle: "none",
        enterStyle: { y: "100%" },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const SheetOverlayFrame = styled(YStack, {
  name: "SheetOverlay",
  defaultProps: {
    animation: "medium",
  },
  variants: {
    unstyled: {
      false: {
        position: "absolute",
        inset: 0,
        backgroundColor: "$shadow6",
        pointerEvents: "auto",
        enterStyle: { opacity: 0 },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

function SheetOverlay(props: StyledProps): VNode {
  useSheetContext("Overlay");
  return h(SheetOverlayFrame, { "aria-hidden": "true", ...props });
}
SheetOverlay.displayName = "SheetOverlay";

export const SheetFrame = styled(YStack, {
  name: "SheetFrame",
  variants: {
    unstyled: {
      false: {
        flex: 1,
        minHeight: 0,
        backgroundColor: "$background",
        borderTopLeftRadius: "$6",
        borderTopRightRadius: "$6",
        width: "100%",
        maxHeight: "100%",
        overflow: "hidden",
        elevate: true,
      },
    },
    elevate: {
      true: {
        shadowColor: "$shadowColor",
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -4 },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const SheetScrollView = styled(YStack, {
  name: "SheetScrollView",
  defaultProps: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
});

export const SheetHandleFrame = styled(YStack, {
  name: "SheetHandle",
  variants: {
    unstyled: {
      false: {
        height: 8,
        width: "30%",
        maxWidth: 120,
        alignSelf: "center",
        borderRadius: 100,
        backgroundColor: "$background",
        opacity: 0.5,
        marginBottom: "$2",
        cursor: "grab",
        touchAction: "none",
        hoverStyle: { opacity: 0.7 },
        pressStyle: { opacity: 1, cursor: "grabbing" },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

// ---- Dragging ----

function currentHeights(ctx: SheetContextValue): { current: number; max: number; viewport: number } {
  const viewport = window.innerHeight;
  return {
    viewport,
    current: (ctx.snapPoints[ctx.position] / 100) * viewport,
    max: (Math.max(...ctx.snapPoints) / 100) * viewport,
  };
}

/** Snap to the point nearest the dragged height, closing when that is the bottom. */
function settle(ctx: SheetContextValue, dy: number): void {
  const { current, viewport } = currentHeights(ctx);
  const visible = ((current - dy) / viewport) * 100;
  const candidates = ctx.dismissOnSnapToBottom ? [...ctx.snapPoints, 0] : ctx.snapPoints;
  let nearest = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (Math.abs(candidates[i] - visible) < Math.abs(candidates[nearest] - visible)) nearest = i;
  }
  if (nearest === ctx.snapPoints.length) {
    ctx.setOpen(false);
  } else if (nearest !== ctx.position) {
    ctx.setPosition(nearest);
  }
}

function startDrag(ctx: SheetContextValue, event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  const startY = event.clientY;
  const { current, max } = currentHeights(ctx);
  const offsetFor = (clientY: number) => Math.min(current, Math.max(current - max, clientY - startY));
  const move = (e: PointerEvent) => replace(ctx.id, "dragOffset", offsetFor(e.clientY));
  const finish = (e: PointerEvent) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    forget(ctx.id, "dragOffset", _);
    settle(ctx, offsetFor(e.clientY));
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
  replace(ctx.id, "dragOffset", 0);
}

function SheetHandle(props: StyledProps): VNode {
  const ctx = useSheetContext("Handle");
  return h(SheetHandleFrame, {
    "aria-hidden": "true",
    "data-state": dataState(ctx.open),
    ...props,
    onPointerDown: (event: PointerEvent) => {
      (props.onPointerDown as ((e: PointerEvent) => void) | undefined)?.(event);
      startDrag(ctx, event);
    },
  });
}
SheetHandle.displayName = "SheetHandle";

/**
 * Sheet: a bottom drawer that slides up over the page and rests at one of
 * several snap points. Drag the handle to move between them or to dismiss.
 *
 *   <Sheet open={open} onOpenChange={setOpen} snapPoints={[85, 50]}>
 *     <Sheet.Overlay />
 *     <Sheet.Handle />
 *     <Sheet.Frame padding="$4">…</Sheet.Frame>
 *   </Sheet>
 */
export const Sheet = Object.assign(SheetRoot, {
  Overlay: SheetOverlay,
  Handle: SheetHandle,
  Frame: SheetFrame,
  ScrollView: SheetScrollView,
});
