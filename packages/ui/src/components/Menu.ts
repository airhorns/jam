import { Portal, useCleanup } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { getFontSized, getSpaceSized, themeableVariants } from "../variants";
import { useControllableState, useStableId } from "../state";
import { useDismissableLayer } from "../layers";
import { repositionLayer } from "../floating";
import type { Placement } from "../floating";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { dataState } from "./Dialog";
import { FloatingArrow, floatingContentProps } from "./Popover";
import type { PopoverArrowProps } from "./Popover";
import { Separator } from "./Separator";
import { Slot } from "./Slot";
import { SizableText } from "./Text";
import { XStack, YStack } from "./Stacks";
import { containsTag } from "./vnode";
import type { RovingDirection } from "./roving-focus";

// ---- Context ----

export type MenuContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  placement: Placement;
  triggerId: string;
  contentId: string;
  loop: boolean;
  dir: RovingDirection;
};

export const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenuContext(part: string): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error(`Menu.${part} must be rendered inside <Menu>`);
  return ctx;
}

export type MenuProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Preferred side and alignment; flips when it would leave the viewport (default `bottom-start`). */
  placement?: Placement;
  /** Gap in px between the trigger and the content (default 4). */
  offset?: number;
  /** Trap focus and lock scroll while open (default false). */
  modal?: boolean;
  /** Wrap arrow-key navigation around at the ends (default false). */
  loop?: boolean;
  /** Reading direction; `rtl` swaps the meaning of ArrowLeft and ArrowRight. */
  dir?: RovingDirection;
  children?: VChild | VChild[];
};

const ITEM_SELECTOR = '[role^="menuitem"]';
const ENABLED_ITEM_SELECTOR = `${ITEM_SELECTOR}:not([data-disabled])`;

/** Whether the pending open came from the keyboard, so the first (or last) item is focused instead of the menu itself. */
const openedFrom = new Map<string, "first" | "last">();

/** Open menus close when the window loses focus (switching tab or app), as Radix does, so none is left open on return. */
const openMenus = new Map<string, () => void>();
let closeOnWindowBlur = false;

function watchWindowBlur(): void {
  if (closeOnWindowBlur || typeof window === "undefined") return;
  closeOnWindowBlur = true;
  window.addEventListener("blur", () => {
    for (const close of Array.from(openMenus.values())) close();
  });
}

function MenuRoot(props: MenuProps): VNode {
  const id = useStableId("menu");
  useCleanup(() => {
    openedFrom.delete(id);
    openMenus.delete(id);
    clearTypeahead(id);
  });
  const placement = props.placement ?? "bottom-start";
  const offset = props.offset ?? 4;
  const modal = props.modal ?? false;
  const [openState, setOpen] = useControllableState<boolean>("open", {
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const open = openState === true;
  if (open) {
    openMenus.set(id, () => setOpen(false));
    watchWindowBlur();
  } else {
    openMenus.delete(id);
    clearTypeahead(id);
  }
  const from = openedFrom.get(id);
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal,
    autoFocus: true,
    restoreFocus: true,
    initialFocus: (content) => (from ? itemElements(content).at(from === "first" ? 0 : -1) : content),
    dismissOnFocusOutside: !modal,
    onReposition: () => repositionLayer(id, { placement, offset }),
  });
  const value: MenuContextValue = {
    id,
    open,
    setOpen,
    placement,
    triggerId: `${id}-trigger`,
    contentId: `${id}-content`,
    loop: props.loop ?? false,
    dir: props.dir ?? "ltr",
  };
  return h(MenuContext.Provider, { value }, props.children);
}
MenuRoot.displayName = "Menu";

// ---- Trigger ----

export type MenuTriggerProps = ButtonProps & {
  asChild?: boolean;
  disabled?: boolean;
};

function MenuTrigger(props: MenuTriggerProps): VNode {
  const ctx = useMenuContext("Trigger");
  const { asChild, disabled = false, onPointerDown, onKeyDown, ...rest } = props;
  const openFrom = (from: "first" | "last" | undefined) => {
    if (from) openedFrom.set(ctx.id, from);
    else openedFrom.delete(ctx.id);
    ctx.setOpen(true);
  };
  return h(asChild ? Slot : Button, {
    ...rest,
    id: ctx.triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": ctx.open,
    "aria-controls": ctx.open ? ctx.contentId : undefined,
    "data-state": dataState(ctx.open),
    "data-disabled": disabled ? "" : undefined,
    "data-layer-trigger": ctx.id,
    disabled: disabled || undefined,
    onPointerDown: (event: PointerEvent) => {
      (onPointerDown as ((e: PointerEvent) => void) | undefined)?.(event);
      if (disabled || event.defaultPrevented || event.button !== 0 || event.ctrlKey) return;
      if (ctx.open) return ctx.setOpen(false);
      // Focus the trigger ourselves so the menu can take focus without the mousedown default fighting it, and focus returns here on close.
      event.preventDefault();
      (event.currentTarget as HTMLElement).focus();
      openFrom(undefined);
    },
    onKeyDown: (event: KeyboardEvent) => {
      (onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(event);
      if (disabled || event.defaultPrevented) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (ctx.open) ctx.setOpen(false);
        else openFrom("first");
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        openFrom("first");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        openFrom("last");
      }
    },
  });
}
MenuTrigger.displayName = "MenuTrigger";

// ---- Keyboard navigation ----

function itemElements(content: HTMLElement): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(ENABLED_ITEM_SELECTOR)).filter((el) => el.closest("[data-menu-content]") === content);
}

function focusItem(content: HTMLElement, loop: boolean, shift: number | "first" | "last"): void {
  const items = itemElements(content);
  if (items.length === 0) return;
  if (shift === "first") return items[0].focus();
  if (shift === "last") return items[items.length - 1].focus();
  const index = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (index === -1) next = shift > 0 ? 0 : items.length - 1;
  else if (loop) next = (index + shift + items.length) % items.length;
  else next = Math.min(items.length - 1, Math.max(0, index + shift));
  items[next].focus();
}

type Typeahead = { query: string; timer?: ReturnType<typeof setTimeout> };
const typeaheads = new Map<string, Typeahead>();

function clearTypeahead(id: string): void {
  const state = typeaheads.get(id);
  if (!state) return;
  if (state.timer !== undefined) clearTimeout(state.timer);
  typeaheads.delete(id);
}

export function isTypingAhead(id: string): boolean {
  return (typeaheads.get(id)?.query ?? "") !== "";
}

function textValue(item: HTMLElement): string {
  return (item.dataset.textValue ?? item.textContent ?? "").trim();
}

/**
 * Radix's typeahead: the query extends while keys arrive within a second; a
 * repeated single character cycles through items starting with it; the current
 * item is skipped for single-character queries so focus always moves.
 */
function typeaheadFocus(id: string, content: HTMLElement, key: string): void {
  const state = typeaheads.get(id) ?? { query: "" };
  state.query += key;
  if (state.timer !== undefined) clearTimeout(state.timer);
  state.timer = setTimeout(() => typeaheads.delete(id), 1000);
  typeaheads.set(id, state);

  const items = itemElements(content);
  const current = items.indexOf(document.activeElement as HTMLElement);
  const repeated = state.query.length > 1 && Array.from(state.query).every((char) => char === state.query[0]);
  const query = (repeated ? state.query[0] : state.query).toLowerCase();
  const start = Math.max(current, 0);
  for (let i = 0; i < items.length; i++) {
    const index = (start + i) % items.length;
    if (query.length === 1 && index === current) continue;
    if (textValue(items[index]).toLowerCase().startsWith(query)) {
      if (index !== current) items[index].focus();
      return;
    }
  }
}

// ---- Content / Arrow ----

export const MenuContentFrame = styled(YStack, {
  name: "MenuContent",
  defaultProps: {
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        minWidth: 160,
        padding: "$1",
        gap: 1,
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        borderRadius: "$4",
        elevate: true,
        zIndex: 100_000,
        outlineStyle: "none",
        userSelect: "none",
        overflow: "auto",
        maxHeight: "min(480px, calc(100vh - 16px))",
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

export type MenuContentProps = StyledProps & {
  size?: string | number;
  elevate?: boolean;
  elevation?: string | number;
  bordered?: boolean | number;
  unstyled?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
};

function MenuContent(props: MenuContentProps): VNode | null {
  const ctx = useMenuContext("Content");
  if (!ctx.open) return null;
  const { children, onKeyDown, ...rest } = props;
  const { attrs } = floatingContentProps(ctx.id, ctx.placement, rest);
  return h(
    Portal,
    null,
    h(
      MenuContentFrame,
      {
        id: ctx.contentId,
        role: "menu",
        "aria-orientation": "vertical",
        "aria-labelledby": ctx.triggerId,
        "data-state": "open",
        "data-menu-content": "",
        dir: ctx.dir,
        tabIndex: -1,
        ...attrs,
        onKeyDown: (event: KeyboardEvent) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          const content = event.currentTarget as HTMLElement;
          const target = event.target as HTMLElement;
          // Keys typed into a focusable nested inside an item (an input) are that control's business.
          if (target !== content && !target.matches(ITEM_SELECTOR)) return;
          switch (event.key) {
            case "Tab":
              return event.preventDefault();
            case "ArrowDown":
              event.preventDefault();
              return focusItem(content, ctx.loop, target === content ? "first" : 1);
            case "ArrowUp":
              event.preventDefault();
              return focusItem(content, ctx.loop, target === content ? "last" : -1);
            case "Home":
            case "PageUp":
              event.preventDefault();
              return focusItem(content, ctx.loop, "first");
            case "End":
            case "PageDown":
              event.preventDefault();
              return focusItem(content, ctx.loop, "last");
            default:
              if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (event.key === " " && !isTypingAhead(ctx.id)) return;
                event.preventDefault();
                typeaheadFocus(ctx.id, content, event.key);
              }
          }
        },
        onFocusOut: (event: FocusEvent) => {
          if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) clearTypeahead(ctx.id);
        },
      },
      children,
    ),
  );
}
MenuContent.displayName = "MenuContent";

function MenuArrow(props: PopoverArrowProps): VNode {
  const ctx = useMenuContext("Arrow");
  return h(FloatingArrow, { ...props, layerId: ctx.id });
}
MenuArrow.displayName = "MenuArrow";

// ---- Items ----

export const MenuItemFrame = styled(XStack, {
  name: "MenuItem",
  variants: {
    unstyled: {
      false: {
        size: "$true",
        alignItems: "center",
        gap: "$2",
        paddingHorizontal: "$3",
        paddingVertical: "$2",
        borderRadius: "$3",
        color: "$color",
        fontFamily: "$body",
        cursor: "pointer",
        outlineStyle: "none",
        backgroundColor: "transparent",
        hoverStyle: { backgroundColor: "$backgroundHover" },
        focusStyle: { backgroundColor: "$backgroundFocus" },
        pressStyle: { backgroundColor: "$backgroundPress" },
      },
    },
    size: {
      "...fontSize": getFontSized,
      ":number": (value: number) => ({ fontSize: value }),
    },
    disabled: {
      true: {
        opacity: 0.5,
        cursor: "not-allowed",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type MenuItemProps = StyledProps & {
  disabled?: boolean;
  /** Text matched by typeahead; defaults to the item's text content. */
  textValue?: string;
  /** Called when the item is activated. `event.preventDefault()` keeps the menu open. */
  onSelect?: (event: Event) => void;
  unstyled?: boolean;
};

/** The item under the pointer when it went down, so releasing over a different item activates that one instead. */
let pointerDownItem: Element | null = null;

function isMouse(event: PointerEvent): boolean {
  return event.pointerType === "mouse" || event.pointerType === undefined || event.pointerType === "";
}

/** Attributes and handlers shared by `Menu.Item`, `Menu.CheckboxItem` and `Menu.RadioItem`. */
function itemProps(ctx: MenuContextValue, props: MenuItemProps, role: string, extra: Record<string, unknown>): Record<string, unknown> {
  const { disabled = false, textValue, onSelect, children, ...rest } = props;
  const handlers = rest as Record<string, ((event: Event) => void) | undefined>;
  const select = (item: HTMLElement) => {
    if (disabled) return;
    const event = new CustomEvent("menu.itemSelect", { bubbles: true, cancelable: true });
    item.addEventListener("menu.itemSelect", (e) => onSelect?.(e), { once: true });
    item.dispatchEvent(event);
    if (!event.defaultPrevented) ctx.setOpen(false);
  };
  return {
    role,
    tabIndex: -1,
    "aria-disabled": disabled || undefined,
    "data-disabled": disabled ? "" : undefined,
    "data-text-value": textValue,
    disabled,
    ...extra,
    ...rest,
    onClick: (event: MouseEvent) => {
      handlers.onClick?.(event);
      select(event.currentTarget as HTMLElement);
    },
    onPointerDown: (event: PointerEvent) => {
      handlers.onPointerDown?.(event);
      pointerDownItem = event.currentTarget as Element;
    },
    onPointerUp: (event: PointerEvent) => {
      handlers.onPointerUp?.(event);
      const item = event.currentTarget as HTMLElement;
      if (pointerDownItem !== null && pointerDownItem !== item) item.click();
      pointerDownItem = null;
    },
    onPointerMove: (event: PointerEvent) => {
      handlers.onPointerMove?.(event);
      if (!isMouse(event)) return;
      const item = event.currentTarget as HTMLElement;
      if (disabled) {
        item.closest<HTMLElement>("[data-menu-content]")?.focus({ preventScroll: true });
      } else if (document.activeElement !== item) {
        item.focus({ preventScroll: true });
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      handlers.onPointerLeave?.(event);
      if (!isMouse(event)) return;
      const item = event.currentTarget as HTMLElement;
      if (document.activeElement === item) item.closest<HTMLElement>("[data-menu-content]")?.focus({ preventScroll: true });
    },
    onKeyDown: (event: KeyboardEvent) => {
      handlers.onKeyDown?.(event);
      if (disabled || event.defaultPrevented || event.target !== event.currentTarget) return;
      if (event.key === " " && isTypingAhead(ctx.id)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        (event.currentTarget as HTMLElement).click();
      }
    },
  };
}

function MenuItem(props: MenuItemProps): VNode {
  const ctx = useMenuContext("Item");
  return h(MenuItemFrame, itemProps(ctx, props, "menuitem", {}), props.children);
}
MenuItem.displayName = "MenuItem";

// ---- Checkbox / radio items ----

export type MenuCheckedState = boolean | "indeterminate";

const ItemIndicatorContext = createContext<{ checked: MenuCheckedState } | null>(null);

function checkedState(checked: MenuCheckedState): "checked" | "unchecked" | "indeterminate" {
  return checked === "indeterminate" ? "indeterminate" : checked ? "checked" : "unchecked";
}

export type MenuCheckboxItemProps = MenuItemProps & {
  checked?: MenuCheckedState;
  onCheckedChange?: (checked: boolean) => void;
};

function MenuCheckboxItem(props: MenuCheckboxItemProps): VNode {
  const ctx = useMenuContext("CheckboxItem");
  const { checked = false, onCheckedChange, onSelect, ...rest } = props;
  const attrs = itemProps(
    ctx,
    {
      ...rest,
      onSelect: (event) => {
        onSelect?.(event);
        onCheckedChange?.(checked === "indeterminate" ? true : !checked);
      },
    },
    "menuitemcheckbox",
    { "aria-checked": checked === "indeterminate" ? "mixed" : checked, "data-state": checkedState(checked) },
  );
  return h(ItemIndicatorContext.Provider, { value: { checked } }, h(MenuItemFrame, attrs, props.children));
}
MenuCheckboxItem.displayName = "MenuCheckboxItem";

const RadioGroupContext = createContext<{ value: string | undefined; onValueChange?: (value: string) => void } | null>(null);

export type MenuRadioGroupProps = StyledProps & {
  value?: string;
  onValueChange?: (value: string) => void;
};

function MenuRadioGroup(props: MenuRadioGroupProps): VNode {
  const { value, onValueChange, children, ...rest } = props;
  return h(RadioGroupContext.Provider, { value: { value, onValueChange } }, h(MenuGroupComponent, rest, children));
}
MenuRadioGroup.displayName = "MenuRadioGroup";

export type MenuRadioItemProps = MenuItemProps & { value: string };

function MenuRadioItem(props: MenuRadioItemProps): VNode {
  const ctx = useMenuContext("RadioItem");
  const group = useContext(RadioGroupContext);
  if (!group) throw new Error("Menu.RadioItem must be rendered inside <Menu.RadioGroup>");
  const { value, onSelect, ...rest } = props;
  const checked = group.value === value;
  const attrs = itemProps(
    ctx,
    {
      ...rest,
      onSelect: (event) => {
        onSelect?.(event);
        group.onValueChange?.(value);
      },
    },
    "menuitemradio",
    { "aria-checked": checked, "data-state": checkedState(checked) },
  );
  return h(ItemIndicatorContext.Provider, { value: { checked } }, h(MenuItemFrame, attrs, props.children));
}
MenuRadioItem.displayName = "MenuRadioItem";

export const MenuItemIndicatorFrame = styled(XStack, {
  name: "MenuItemIndicator",
  defaultProps: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    color: "$color",
    flexShrink: 0,
  },
});

const check = h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, h("path", { d: "M2 6.5 4.75 9 10 3.5", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
const dot = h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "currentColor", "aria-hidden": "true" }, h("circle", { cx: 6, cy: 6, r: 3 }));

export type MenuItemIndicatorProps = StyledProps & {
  /** Render (hidden) even while unchecked so the layout doesn't shift. */
  forceMount?: boolean;
};

/** Renders inside a checked `CheckboxItem`/`RadioItem`; defaults to a check mark or a dot. */
function MenuItemIndicator(props: MenuItemIndicatorProps): VNode | null {
  const indicator = useContext(ItemIndicatorContext);
  if (!indicator) throw new Error("Menu.ItemIndicator must be rendered inside a Menu.CheckboxItem or Menu.RadioItem");
  const { forceMount, children, ...rest } = props;
  const state = checkedState(indicator.checked);
  if (state === "unchecked" && !forceMount) return null;
  const fallback = state === "indeterminate" ? dot : check;
  return h(MenuItemIndicatorFrame, { "aria-hidden": "true", "data-state": state, ...rest }, state === "unchecked" ? null : children ?? fallback);
}
MenuItemIndicator.displayName = "MenuItemIndicator";

// ---- Group / Label / Separator ----

export const MenuGroupFrame = styled(YStack, {
  name: "MenuGroup",
  defaultProps: {
    role: "group",
    gap: 1,
  },
});

export const MenuLabelFrame = styled(SizableText, {
  name: "MenuLabel",
  variants: {
    unstyled: {
      false: {
        size: "$2",
        fontWeight: "600",
        color: "$color10",
        paddingHorizontal: "$3",
        paddingVertical: "$2",
        userSelect: "none",
      },
    },
    size: {
      "...fontSize": getFontSized,
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** Mints the id a `Menu.Label` inside the same `Menu.Group` labels the group with. */
const GroupLabelContext = createContext<string | null>(null);

export type MenuGroupProps = StyledProps;

function MenuGroupComponent(props: MenuGroupProps): VNode {
  const labelId = useStableId("menu-group-label");
  const { children, ...rest } = props;
  const labelled = containsTag(children, [MenuLabelComponent]);
  return h(GroupLabelContext.Provider, { value: labelId }, h(MenuGroupFrame, { "aria-labelledby": labelled ? labelId : undefined, ...rest }, children));
}
MenuGroupComponent.displayName = "MenuGroup";

export type MenuLabelProps = StyledProps & { size?: string; unstyled?: boolean };

function MenuLabelComponent(props: MenuLabelProps): VNode {
  const labelId = useContext(GroupLabelContext);
  const { children, ...rest } = props;
  return h(MenuLabelFrame, { id: labelId ?? undefined, ...rest }, children);
}
MenuLabelComponent.displayName = "MenuLabel";

function MenuSeparator(props: StyledProps): VNode {
  return h(Separator, { role: "separator", "aria-orientation": "horizontal", marginVertical: "$1", ...props });
}
MenuSeparator.displayName = "MenuSeparator";

/**
 * Menu: a dropdown of actions anchored to a trigger, following the WAI-ARIA
 * menu button pattern. Arrow keys, Home/End and typeahead move between items;
 * Enter, Space or a click activates one and closes the menu unless the item's
 * `onSelect` calls `event.preventDefault()`.
 *
 *   <Menu>
 *     <Menu.Trigger asChild><Button>Sort</Button></Menu.Trigger>
 *     <Menu.Content>
 *       <Menu.Group>
 *         <Menu.Label>Sort by</Menu.Label>
 *         <Menu.RadioGroup value={orderBy} onValueChange={setOrderBy}>
 *           <Menu.RadioItem value="created"><Menu.ItemIndicator />Created</Menu.RadioItem>
 *         </Menu.RadioGroup>
 *       </Menu.Group>
 *       <Menu.Separator />
 *       <Menu.CheckboxItem checked={done} onCheckedChange={setDone} onSelect={(e) => e.preventDefault()}>
 *         <Menu.ItemIndicator />Show done
 *       </Menu.CheckboxItem>
 *       <Menu.Item onSelect={remove}>Delete…</Menu.Item>
 *     </Menu.Content>
 *   </Menu>
 */
export const Menu = Object.assign(MenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Arrow: MenuArrow,
  Item: MenuItem,
  CheckboxItem: MenuCheckboxItem,
  RadioGroup: MenuRadioGroup,
  RadioItem: MenuRadioItem,
  ItemIndicator: MenuItemIndicator,
  Group: MenuGroupComponent,
  Label: MenuLabelComponent,
  Separator: MenuSeparator,
});
