import { $, Portal, db, replace, when, useCleanup } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { useControllableState, useStableId } from "../state";
import { Button } from "./Button";
import { dataState } from "./Dialog";
import { Slot } from "./Slot";
import { XStack, YStack } from "./Stacks";
import { SizableText } from "./Text";

export type ToastPlacement = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export type ToastConfig = {
  /** Default auto-dismiss time in ms; `Infinity` keeps toasts until closed (default 5000). */
  duration: number;
  /** Corner the viewport pins to (default "bottom-right"). */
  placement: ToastPlacement;
  /** Accessible name announced for the viewport region (default "Notifications"). */
  label: string;
};

const defaultConfig: ToastConfig = { duration: 5000, placement: "bottom-right", label: "Notifications" };

export const ToastConfigContext = createContext<ToastConfig>(defaultConfig);
/** The enclosing `Toast.Viewport`'s DOM id while rendering inside one, where toasts lay out inline and share pause/resume broadcasts. */
const InsideViewportContext = createContext<string | null>(null);

function ToastProvider(props: Partial<ToastConfig> & { children?: VChild | VChild[] }): VNode {
  const { children, ...config } = props;
  const parent = useContext(ToastConfigContext);
  const value: ToastConfig = { ...parent };
  for (const key of ["duration", "placement", "label"] as const) {
    if (config[key] !== undefined) (value as Record<string, unknown>)[key] = config[key];
  }
  return h(ToastConfigContext.Provider, { value }, children);
}
ToastProvider.displayName = "ToastProvider";

// ---- Auto-dismiss timers ----

type RunningTimer = { startedAt: number; handle: ReturnType<typeof setTimeout> };
type ToastTimer = { remaining: number; running: RunningTimer | undefined };

const timers = new Map<string, ToastTimer>();

function startTimer(id: string, duration: number, dismiss: () => void): RunningTimer {
  return { startedAt: Date.now(), handle: setTimeout(() => { timers.delete(id); dismiss(); }, duration) };
}

/** Arms a fresh dismiss timer for `duration`; a no-op if one is already running or `duration` is Infinite. */
function armDismiss(id: string, duration: number, dismiss: () => void): void {
  if (timers.has(id) || !Number.isFinite(duration)) return;
  timers.set(id, { remaining: duration, running: startTimer(id, duration, dismiss) });
}

/** Cancels the running timer and remembers the time left, so `resumeDismiss` restarts from there rather than the full duration. */
function pauseDismiss(id: string): void {
  const timer = timers.get(id);
  if (!timer?.running) return;
  clearTimeout(timer.running.handle);
  timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.running.startedAt));
  timer.running = undefined;
}

function resumeDismiss(id: string, dismiss: () => void): void {
  const timer = timers.get(id);
  if (!timer || timer.running) return;
  timer.running = startTimer(id, timer.remaining, dismiss);
}

function cancelDismiss(id: string): void {
  const timer = timers.get(id);
  if (timer?.running) clearTimeout(timer.running.handle);
  timers.delete(id);
}

// ---- Viewport hotkey ----

const hotkeyViewports = new Map<string, string[]>();
let hotkeyListening = false;

function onHotkeyKeydown(event: KeyboardEvent): void {
  for (const [domId, hotkey] of hotkeyViewports) {
    if (hotkey.includes(event.key)) document.getElementById(domId)?.focus();
  }
}

function ensureHotkeyListener(): void {
  if (hotkeyListening || typeof document === "undefined") return;
  document.addEventListener("keydown", onHotkeyKeydown);
  hotkeyListening = true;
}

// ---- Viewport-wide pause/resume broadcast ----

type ViewportToastHandlers = { pause: () => void; resume: () => void };

const viewportToasts = new Map<string, Map<string, ViewportToastHandlers>>();

function registerViewportToast(viewportId: string, toastId: string, handlers: ViewportToastHandlers): void {
  let toasts = viewportToasts.get(viewportId);
  if (!toasts) {
    toasts = new Map();
    viewportToasts.set(viewportId, toasts);
  }
  toasts.set(toastId, handlers);
}

function unregisterViewportToast(viewportId: string, toastId: string): void {
  viewportToasts.get(viewportId)?.delete(toastId);
}

function pauseViewportToasts(viewportId: string): void {
  for (const handlers of viewportToasts.get(viewportId)?.values() ?? []) handlers.pause();
}

function resumeViewportToasts(viewportId: string): void {
  for (const handlers of viewportToasts.get(viewportId)?.values() ?? []) handlers.resume();
}

// ---- Imperative toasts ----

export type ToastOptions = {
  message?: string;
  /** Auto-dismiss time in ms; defaults to the provider's `duration`. */
  duration?: number;
  /** Theme name applied to the toast frame, e.g. "green" or "red". */
  theme?: string;
  action?: { label: string; onPress: () => void };
  /** `foreground` toasts announce assertively (default "background"). */
  type?: "foreground" | "background";
};

export type ToastRecord = ToastOptions & { id: string; title: string };

const records = new Map<string, ToastRecord>();
const TOASTS = "toasts";
let counter = 0;

function readToastIds(): string[] {
  const rows = when([TOASTS, "ids", $.json]);
  return rows.length > 0 ? (JSON.parse(rows[0].json as string) as string[]) : [];
}

function writeToastIds(ids: string[]): void {
  replace(TOASTS, "ids", JSON.stringify(ids));
}

function currentToastIds(): string[] {
  const rows = db.index([TOASTS, "ids", $.json]).get();
  return rows.length > 0 ? (JSON.parse(rows[0].json as string) as string[]) : [];
}

function hideToast(id: string): void {
  if (!records.delete(id)) return;
  cancelDismiss(id);
  writeToastIds(currentToastIds().filter((existing) => existing !== id));
}

/**
 * Show toasts from anywhere, without rendering `<Toast>` yourself. They appear
 * in the mounted `Toast.Viewport` and auto-dismiss after their duration.
 */
export const toastController = {
  show(title: string, options: ToastOptions = {}): string {
    const id = `toast-${++counter}`;
    records.set(id, { id, title, ...options });
    writeToastIds([...currentToastIds(), id]);
    return id;
  },
  hide: hideToast,
  hideAll(): void {
    for (const id of Array.from(records.keys())) hideToast(id);
  },
};

export function useToastController(): typeof toastController {
  return toastController;
}

/** The most recently shown imperative toast, for apps that render their own. */
export function useToastState(): ToastRecord | undefined {
  const ids = readToastIds();
  return ids.length > 0 ? records.get(ids[ids.length - 1]) : undefined;
}

// ---- Viewport ----

const placementStyles: Record<ToastPlacement, Record<string, unknown>> = {
  "top-left": { top: 0, left: 0, alignItems: "flex-start" },
  "top-center": { top: 0, left: 0, right: 0, alignItems: "center" },
  "top-right": { top: 0, right: 0, alignItems: "flex-end" },
  "bottom-left": { bottom: 0, left: 0, alignItems: "flex-start", flexDirection: "column-reverse" },
  "bottom-center": { bottom: 0, left: 0, right: 0, alignItems: "center", flexDirection: "column-reverse" },
  "bottom-right": { bottom: 0, right: 0, alignItems: "flex-end", flexDirection: "column-reverse" },
};

export const ToastViewportFrame = styled(YStack, {
  name: "ToastViewport",
  variants: {
    unstyled: {
      false: {
        position: "fixed",
        padding: "$4",
        gap: "$2",
        maxWidth: "100vw",
        maxHeight: "100vh",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 100_001,
        outlineStyle: "none",
      },
    },
    placement: placementStyles,
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type ToastViewportProps = StyledProps & {
  placement?: ToastPlacement;
  label?: string;
  unstyled?: boolean;
  /** Keys that move focus to the viewport from anywhere in the page (default `["F8"]`). */
  hotkey?: string[];
};

function ToastViewport(props: ToastViewportProps): VNode {
  const config = useContext(ToastConfigContext);
  const viewportId = useStableId("toast-viewport");
  const { placement = config.placement, label = config.label, hotkey = ["F8"], id: idProp, children, ...rest } = props;
  const domId = (idProp as string | undefined) ?? viewportId;
  useCleanup(() => {
    hotkeyViewports.delete(domId);
    viewportToasts.delete(domId);
  });
  hotkeyViewports.set(domId, hotkey);
  ensureHotkeyListener();
  const ids = readToastIds();
  const imperative = ids
    .map((id) => records.get(id))
    .filter((record): record is ToastRecord => record !== undefined)
    .map((record) =>
      h(
        ToastRoot,
        {
          key: record.id,
          open: true,
          onOpenChange: (open: boolean) => {
            if (!open) hideToast(record.id);
          },
          duration: record.duration,
          theme: record.theme,
          type: record.type,
          "data-toast-id": record.id,
        },
        h(
          XStack,
          { gap: "$3", alignItems: "flex-start" },
          h(YStack, { flex: 1, gap: "$1" }, h(ToastTitlePart, null, record.title), record.message ? h(ToastDescriptionPart, null, record.message) : null),
          record.action
            ? h(
                ToastAction,
                {
                  altText: record.action.label,
                  onClick: () => {
                    record.action?.onPress();
                    hideToast(record.id);
                  },
                },
                record.action.label,
              )
            : null,
          h(ToastClose, { "aria-label": "Close" }, "×"),
        ),
      ),
    );
  return h(
    Portal,
    null,
    h(
      ToastConfigContext.Provider,
      { value: { ...config, placement, label } },
      h(
        InsideViewportContext.Provider,
        { value: domId },
        h(
          ToastViewportFrame,
          {
            id: domId,
            role: "region",
            "aria-label": label,
            tabIndex: -1,
            placement,
            "data-toast-viewport": placement,
            ...rest,
            onPointerOver: (event: PointerEvent) => {
              (rest.onPointerOver as ((e: PointerEvent) => void) | undefined)?.(event);
              pauseViewportToasts(domId);
            },
            onPointerOut: (event: PointerEvent) => {
              (rest.onPointerOut as ((e: PointerEvent) => void) | undefined)?.(event);
              resumeViewportToasts(domId);
            },
            onFocusIn: (event: FocusEvent) => {
              (rest.onFocusIn as ((e: FocusEvent) => void) | undefined)?.(event);
              pauseViewportToasts(domId);
            },
            onFocusOut: (event: FocusEvent) => {
              (rest.onFocusOut as ((e: FocusEvent) => void) | undefined)?.(event);
              resumeViewportToasts(domId);
            },
          },
          ...imperative,
          children,
        ),
      ),
    ),
  );
}
ToastViewport.displayName = "ToastViewport";

// ---- Toast ----

export type ToastContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

function useToastContext(part: string): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error(`Toast.${part} must be rendered inside <Toast>`);
  return ctx;
}

export const ToastFrame = styled(YStack, {
  name: "Toast",
  defaultProps: {
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        position: "relative",
        gap: "$1",
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        borderRadius: "$4",
        paddingHorizontal: "$4",
        paddingVertical: "$3",
        width: "min(360px, calc(100vw - 36px))",
        pointerEvents: "auto",
        shadowColor: "$shadowColor",
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        focusStyle: { outlineStyle: "solid", outlineWidth: 2, outlineColor: "$outlineColor" },
      },
    },
    side: {
      top: { enterStyle: { opacity: 0, y: -16 } },
      bottom: { enterStyle: { opacity: 0, y: 16 } },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type ToastProps = StyledProps & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Auto-dismiss time in ms; `Infinity` disables. Defaults to the provider's `duration`. */
  duration?: number;
  /** `foreground` announces assertively, `background` politely (default). */
  type?: "foreground" | "background";
  unstyled?: boolean;
};

function ToastRoot(props: ToastProps): VNode | null {
  const config = useContext(ToastConfigContext);
  const viewportId = useContext(InsideViewportContext);
  const id = useStableId("toast");
  useCleanup(() => {
    cancelDismiss(id);
    if (viewportId) unregisterViewportToast(viewportId, id);
  });
  const { open: openProp, defaultOpen, onOpenChange, duration = config.duration, type = "background", children, ...rest } = props;
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: openProp,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  });
  const open = openState === true;
  if (!open) {
    cancelDismiss(id);
    if (viewportId) unregisterViewportToast(viewportId, id);
    return null;
  }
  armDismiss(id, duration, () => setOpen(false));
  if (viewportId) {
    registerViewportToast(viewportId, id, {
      pause: () => pauseDismiss(id),
      resume: () => resumeDismiss(id, () => setOpen(false)),
    });
  }
  const value: ToastContextValue = { id, open, setOpen, titleId: `${id}-title`, descriptionId: `${id}-description` };
  const side = config.placement.startsWith("top") ? "top" : "bottom";
  const toast = h(
    ToastContext.Provider,
    { value },
    h(
      ToastFrame,
      {
        role: "status",
        "aria-live": type === "foreground" ? "assertive" : "polite",
        "aria-atomic": "true",
        "aria-labelledby": value.titleId,
        tabIndex: 0,
        "data-state": dataState(open),
        side,
        ...rest,
        onPointerEnter: (event: PointerEvent) => {
          (rest.onPointerEnter as ((e: PointerEvent) => void) | undefined)?.(event);
          pauseDismiss(id);
        },
        onPointerLeave: (event: PointerEvent) => {
          (rest.onPointerLeave as ((e: PointerEvent) => void) | undefined)?.(event);
          resumeDismiss(id, () => setOpen(false));
        },
        onFocus: (event: FocusEvent) => {
          (rest.onFocus as ((e: FocusEvent) => void) | undefined)?.(event);
          pauseDismiss(id);
        },
        onBlur: (event: FocusEvent) => {
          (rest.onBlur as ((e: FocusEvent) => void) | undefined)?.(event);
          resumeDismiss(id, () => setOpen(false));
        },
        "data-handles-escape": "",
        onKeyDown: (event: KeyboardEvent) => {
          (rest.onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(event);
          if (event.key === "Escape") setOpen(false);
        },
      },
      children,
    ),
  );
  if (viewportId) return toast;
  return h(Portal, null, h(ToastViewportFrame, { placement: config.placement, "data-toast-viewport": config.placement }, toast));
}
ToastRoot.displayName = "Toast";

// ---- Parts ----

export const ToastTitle = styled(SizableText, {
  name: "ToastTitle",
  variants: {
    unstyled: {
      false: {
        size: "$4",
        fontWeight: "600",
        color: "$color",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const ToastDescription = styled(SizableText, {
  name: "ToastDescription",
  variants: {
    unstyled: {
      false: {
        size: "$2",
        color: "$color11",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

function ToastTitlePart(props: StyledProps): VNode {
  const ctx = useToastContext("Title");
  return h(ToastTitle, { id: ctx.titleId, ...props });
}
ToastTitlePart.displayName = "ToastTitle";

function ToastDescriptionPart(props: StyledProps): VNode {
  const ctx = useToastContext("Description");
  return h(ToastDescription, { id: ctx.descriptionId, ...props });
}
ToastDescriptionPart.displayName = "ToastDescription";

export type ToastActionProps = StyledProps & {
  /** Plain-text alternative announced by screen readers, e.g. "Undo the deletion". */
  altText: string;
  asChild?: boolean;
  onClick?: (event: MouseEvent) => void;
};

function ToastAction(props: ToastActionProps): VNode {
  useToastContext("Action");
  const { altText, asChild, ...rest } = props;
  if (!altText.trim()) console.error("Toast.Action requires a non-blank `altText` naming the action for screen readers.");
  return h(asChild ? Slot : Button, { size: "$2", ...rest, "aria-label": altText || undefined, "data-toast-action": "" });
}
ToastAction.displayName = "ToastAction";

export type ToastCloseProps = StyledProps & {
  asChild?: boolean;
  onClick?: (event: MouseEvent) => void;
};

function ToastClose(props: ToastCloseProps): VNode {
  const ctx = useToastContext("Close");
  const { asChild, onClick, ...rest } = props;
  return h(asChild ? Slot : Button, {
    size: "$2",
    circular: true,
    chromeless: true,
    "aria-label": "Close",
    ...rest,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      ctx.setOpen(false);
    },
  });
}
ToastClose.displayName = "ToastClose";

/**
 * Toast: a brief, auto-dismissing notification. Render one `Toast.Viewport`
 * near the app root; imperative toasts from `toastController.show()` stack
 * inside it, and declarative `<Toast open>` elements float at the same corner
 * (or stack too when rendered inside the viewport).
 *
 *   <Toast.Viewport />
 *   toastController.show("Saved", { message: "Your changes are safe." })
 *
 *   <Toast open={open} onOpenChange={setOpen}>
 *     <Toast.Title>Saved</Toast.Title>
 *     <Toast.Description>Your changes are safe.</Toast.Description>
 *     <Toast.Close />
 *   </Toast>
 */
export const Toast = Object.assign(ToastRoot, {
  Provider: ToastProvider,
  Viewport: ToastViewport,
  Title: ToastTitlePart,
  Description: ToastDescriptionPart,
  Action: ToastAction,
  Close: ToastClose,
});
