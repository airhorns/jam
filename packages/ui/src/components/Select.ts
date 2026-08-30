import { Portal } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { getFontSized, themeableVariants } from "../variants";
import { useControllableState, useStableId } from "../state";
import { useDismissableLayer } from "../layers";
import { repositionLayer } from "../floating";
import type { Placement } from "../floating";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { dataState } from "./Dialog";
import { floatingContentProps } from "./Popover";
import { Slot } from "./Slot";
import { XStack, YStack } from "./Stacks";
import { SizableText } from "./Text";

export type SelectOption = { value: string; label: string; disabled: boolean };

export type SelectContextValue = {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string | undefined;
  setValue: (value: string) => void;
  options: SelectOption[];
  disabled: boolean;
  size: string | number | undefined;
  placement: Placement;
  triggerId: string;
  contentId: string;
  optionId: (value: string) => string;
};

export const SelectContext = createContext<SelectContextValue | null>(null);

export function useSelectContext(part: string): SelectContextValue {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error(`Select.${part} must be rendered inside <Select>`);
  return ctx;
}

// ---- Option discovery ----

function isVNode(child: VChild): child is VNode {
  return typeof child === "object" && child !== null && "__vnode" in child;
}

function textOf(children: VChild[]): string {
  let text = "";
  for (const child of children.flat(10)) {
    if (typeof child === "string" || typeof child === "number") text += String(child);
    else if (isVNode(child) && child.tag !== SelectItemIndicator) text += textOf(child.children);
  }
  return text.trim();
}

/**
 * Items declared anywhere under the Select, in order, so the trigger can show
 * the selected label and keyboard navigation works before the list opens.
 */
export function collectOptions(children: VChild | VChild[]): SelectOption[] {
  const options: SelectOption[] = [];
  const visit = (nodes: VChild[]) => {
    for (const child of nodes.flat(10)) {
      if (!isVNode(child)) continue;
      if (child.tag === SelectItem) {
        const props = child.props as SelectItemProps;
        options.push({ value: props.value, label: props.label ?? textOf(child.children), disabled: props.disabled === true });
      } else {
        visit(child.children);
      }
    }
  };
  visit([children].flat(10) as VChild[]);
  return options;
}

// ---- Root ----

export type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** Size token applied to the trigger and items (default "$true"). */
  size?: string | number;
  /** Side the list opens on (default "bottom-start"). */
  placement?: Placement;
  /** Submits the value with a hidden input when inside a form. */
  name?: string;
  /** DOM id of the trigger, so a `<Label htmlFor>` can target it. */
  id?: string;
  children?: VChild | VChild[];
};

function SelectRoot(props: SelectProps): VNode {
  const id = useStableId("select");
  const disabled = props.disabled === true;
  const placement = props.placement ?? "bottom-start";
  const [value, setValue] = useControllableState<string>("value", {
    value: props.value,
    defaultValue: props.defaultValue,
    onChange: props.onValueChange,
  });
  const [openState, setOpenState] = useControllableState<boolean>("open", {
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const open = openState === true && !disabled;
  const setOpen = (next: boolean) => {
    if (disabled) return;
    setOpenState(next);
  };
  useDismissableLayer(id, open, {
    onDismiss: () => setOpen(false),
    modal: false,
    autoFocus: true,
    restoreFocus: true,
    dismissOnFocusOutside: true,
    onReposition: () => repositionLayer(id, { placement, offset: 4 }),
  });
  const ctx: SelectContextValue = {
    id,
    open,
    setOpen,
    value,
    setValue,
    options: collectOptions(props.children),
    disabled,
    size: props.size,
    placement,
    triggerId: props.id ?? `${id}-trigger`,
    contentId: `${id}-content`,
    optionId: (option) => `${id}-option-${option.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
  };
  return h(
    SelectContext.Provider,
    { value: ctx },
    props.name ? h("input", { type: "hidden", name: props.name, value: value ?? "", "aria-hidden": "true" }) : null,
    props.children,
  );
}
SelectRoot.displayName = "Select";

// ---- Keyboard navigation ----

function enabledOptions(ctx: SelectContextValue): SelectOption[] {
  return ctx.options.filter((option) => !option.disabled);
}

function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function optionElements(ctx: SelectContextValue): HTMLElement[] {
  const content = document.getElementById(ctx.contentId);
  if (!content) return [];
  return Array.from(content.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
}

function focusOption(ctx: SelectContextValue, shift: number | "first" | "last"): void {
  const items = optionElements(ctx);
  if (items.length === 0) return;
  if (shift === "first") return items[0].focus();
  if (shift === "last") return items[items.length - 1].focus();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = index === -1 ? (shift > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, index + shift));
  items[next].focus();
}

let typeahead = { id: "", query: "", at: 0 };

/** Extends the current query when typed within 500ms, then finds the next label matching it after `from`. */
function typeaheadValue(ctx: SelectContextValue, key: string, from: string | undefined): string | undefined {
  const now = Date.now();
  const continuing = typeahead.id === ctx.id && now - typeahead.at < 500;
  const query = (continuing ? typeahead.query + key : key).toLowerCase();
  typeahead = { id: ctx.id, query, at: now };
  const options = enabledOptions(ctx);
  const start = options.findIndex((option) => option.value === from);
  const first = continuing && start !== -1 && options[start].label.toLowerCase().startsWith(query) ? 0 : 1;
  for (let i = first; i <= options.length; i++) {
    const option = options[(start + i) % options.length];
    if (option.label.toLowerCase().startsWith(query)) return option.value;
  }
  return undefined;
}

function focusedOptionValue(ctx: SelectContextValue): string | undefined {
  const active = document.activeElement;
  return ctx.options.find((option) => ctx.optionId(option.value) === active?.id)?.value;
}

// ---- Trigger / Value ----

export type SelectTriggerProps = ButtonProps & { asChild?: boolean };

const chevron = h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, h("path", { d: "M2.5 4.5 6 8l3.5-3.5", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));

function SelectTrigger(props: SelectTriggerProps): VNode {
  const ctx = useSelectContext("Trigger");
  const { asChild, onClick, onKeyDown, ...rest } = props;
  const selected = ctx.options.find((option) => option.value === ctx.value);
  const base = asChild ? {} : { size: ctx.size, justifyContent: "space-between", iconAfter: chevron };
  return h(asChild ? Slot : Button, {
    ...base,
    ...rest,
    id: ctx.triggerId,
    role: "combobox",
    "aria-haspopup": "listbox",
    "aria-expanded": ctx.open,
    "aria-controls": ctx.open ? ctx.contentId : undefined,
    "aria-activedescendant": ctx.open && selected ? ctx.optionId(selected.value) : undefined,
    disabled: ctx.disabled || undefined,
    "data-state": dataState(ctx.open),
    "data-layer-trigger": ctx.id,
    onClick: (event: MouseEvent) => {
      (onClick as ((e: MouseEvent) => void) | undefined)?.(event);
      ctx.setOpen(!ctx.open);
    },
    onKeyDown: (event: KeyboardEvent) => {
      (onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(event);
      if (event.defaultPrevented || ctx.disabled) return;
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case " ":
          event.preventDefault();
          ctx.setOpen(true);
          return;
        default:
          if (isPrintable(event)) {
            const next = typeaheadValue(ctx, event.key, ctx.value);
            if (next !== undefined) ctx.setValue(next);
          }
      }
    },
  });
}
SelectTrigger.displayName = "SelectTrigger";

export const SelectValueFrame = styled(SizableText, {
  name: "SelectValue",
  defaultProps: {
    ellipsis: true,
    flex: 1,
    textAlign: "left",
    color: "$color",
  },
  variants: {
    placeholder: {
      true: { color: "$placeholderColor" },
    },
  },
});

export type SelectValueProps = StyledProps & { placeholder?: VChild };

/** The selected option's label, `children` if given, or the placeholder. */
function SelectValue(props: SelectValueProps): VNode {
  const ctx = useSelectContext("Value");
  const { placeholder, children, ...rest } = props;
  const selected = ctx.options.find((option) => option.value === ctx.value);
  const hasChildren = children != null && (!Array.isArray(children) || children.length > 0);
  const showPlaceholder = !hasChildren && !selected;
  return h(
    SelectValueFrame,
    { size: ctx.size, "data-placeholder": showPlaceholder ? "" : undefined, placeholder: showPlaceholder, ...rest },
    hasChildren ? children : selected ? selected.label : placeholder ?? "",
  );
}
SelectValue.displayName = "SelectValue";

// ---- Content / Viewport ----

export const SelectContentFrame = styled(YStack, {
  name: "SelectContent",
  defaultProps: {
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        backgroundColor: "$background",
        borderRadius: "$4",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        elevate: true,
        zIndex: 100_000,
        outlineWidth: 0,
        userSelect: "none",
        overflow: "hidden",
      },
    },
    elevate: themeableVariants.elevate,
    elevation: themeableVariants.elevation,
    bordered: themeableVariants.bordered,
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type SelectContentProps = StyledProps & {
  elevate?: boolean;
  elevation?: string | number;
  bordered?: boolean | number;
  unstyled?: boolean;
};

function SelectContent(props: SelectContentProps): VNode | null {
  const ctx = useSelectContext("Content");
  if (!ctx.open) return null;
  const { children, ...rest } = props;
  const { position, attrs } = floatingContentProps(ctx.id, ctx.placement, rest);
  const style = attrs.style as Record<string, unknown>;
  if (position && style.minWidth === undefined) style.minWidth = `${position.anchorWidth}px`;
  return h(
    Portal,
    null,
    h(
      SelectContentFrame,
      {
        id: ctx.contentId,
        role: "listbox",
        "aria-labelledby": ctx.triggerId,
        "data-state": "open",
        tabIndex: -1,
        ...attrs,
        onKeyDown: (event: KeyboardEvent) => {
          (rest.onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(event);
          if (event.defaultPrevented) return;
          switch (event.key) {
            case "ArrowDown":
              event.preventDefault();
              return focusOption(ctx, 1);
            case "ArrowUp":
              event.preventDefault();
              return focusOption(ctx, -1);
            case "Home":
              event.preventDefault();
              return focusOption(ctx, "first");
            case "End":
              event.preventDefault();
              return focusOption(ctx, "last");
            case "Tab":
              return ctx.setOpen(false);
            default:
              if (isPrintable(event)) {
                const next = typeaheadValue(ctx, event.key, focusedOptionValue(ctx) ?? ctx.value);
                if (next !== undefined) document.getElementById(ctx.optionId(next))?.focus();
              }
          }
        },
      },
      children,
    ),
  );
}
SelectContent.displayName = "SelectContent";

export const SelectViewport = styled(YStack, {
  name: "SelectViewport",
  defaultProps: {
    padding: "$1",
    gap: 1,
    overflow: "auto",
    maxHeight: "min(320px, 50vh)",
  },
});

export const SelectGroup = styled(YStack, {
  name: "SelectGroup",
  defaultProps: {
    role: "group",
  },
});

export const SelectLabel = styled(SizableText, {
  name: "SelectLabel",
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
  },
  defaultVariants: {
    unstyled: false,
  },
});

// ---- Item ----

export type SelectItemContextValue = { value: string; selected: boolean; disabled: boolean };

export const SelectItemContext = createContext<SelectItemContextValue | null>(null);

export const SelectItemFrame = styled(XStack, {
  name: "SelectItem",
  variants: {
    unstyled: {
      false: {
        alignItems: "center",
        gap: "$3",
        paddingHorizontal: "$3",
        paddingVertical: "$2",
        borderRadius: "$3",
        cursor: "pointer",
        outlineWidth: 0,
        backgroundColor: "transparent",
        hoverStyle: { backgroundColor: "$backgroundHover" },
        focusStyle: { backgroundColor: "$backgroundFocus" },
        pressStyle: { backgroundColor: "$backgroundPress" },
      },
    },
    disabled: {
      true: {
        opacity: 0.5,
        cursor: "not-allowed",
        pointerEvents: "none",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type SelectItemProps = StyledProps & {
  value: string;
  /** Text shown in the trigger and matched by typeahead; defaults to the item's text content. */
  label?: string;
  disabled?: boolean;
  unstyled?: boolean;
};

function SelectItem(props: SelectItemProps): VNode {
  const ctx = useSelectContext("Item");
  const { value, label, disabled = false, children, ...rest } = props;
  const selected = ctx.value === value;
  const choose = () => {
    if (disabled) return;
    ctx.setValue(value);
    ctx.setOpen(false);
  };
  return h(
    SelectItemContext.Provider,
    { value: { value, selected, disabled } },
    h(
      SelectItemFrame,
      {
        id: ctx.optionId(value),
        role: "option",
        "aria-selected": selected,
        "aria-disabled": disabled ? "true" : undefined,
        "data-state": selected ? "checked" : "unchecked",
        "data-disabled": disabled ? "" : undefined,
        tabIndex: -1,
        autofocus: selected || undefined,
        disabled,
        ...rest,
        onClick: (event: MouseEvent) => {
          (rest.onClick as ((e: MouseEvent) => void) | undefined)?.(event);
          choose();
        },
        onPointerMove: (event: PointerEvent) => {
          (rest.onPointerMove as ((e: PointerEvent) => void) | undefined)?.(event);
          if (!disabled && document.activeElement !== event.currentTarget) (event.currentTarget as HTMLElement).focus();
        },
        onKeyDown: (event: KeyboardEvent) => {
          (rest.onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(event);
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            choose();
          }
        },
      },
      children,
    ),
  );
}
SelectItem.displayName = "SelectItem";

export const SelectItemTextFrame = styled(SizableText, {
  name: "SelectItemText",
  defaultProps: {
    flex: 1,
    color: "$color",
    userSelect: "none",
    ellipsis: true,
  },
  variants: {
    size: {
      "...fontSize": getFontSized,
      ":number": (value: number) => ({ fontSize: value * 0.4 }),
    },
  },
});

function SelectItemText(props: StyledProps): VNode {
  const ctx = useSelectContext("ItemText");
  return h(SelectItemTextFrame, { size: ctx.size ?? "$true", ...props });
}
SelectItemText.displayName = "SelectItemText";

export const SelectItemIndicatorFrame = styled("span", {
  name: "SelectItemIndicator",
  defaultProps: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    color: "$color",
    flexShrink: 0,
  },
});

const check = h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, h("path", { d: "M2 6.5 4.75 9 10 3.5", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));

/** Renders only inside the selected item; defaults to a check mark. */
function SelectItemIndicator(props: StyledProps): VNode | null {
  const item = useContext(SelectItemContext);
  if (!item) throw new Error("Select.ItemIndicator must be rendered inside <Select.Item>");
  if (!item.selected) return null;
  const { children, ...rest } = props;
  return h(SelectItemIndicatorFrame, { "aria-hidden": "true", ...rest }, children ?? check);
}
SelectItemIndicator.displayName = "SelectItemIndicator";

/**
 * Select: pick one option from a dropdown list. The trigger is a combobox
 * button showing the selected label; the list floats below it, sized to the
 * trigger, with arrow keys, Home/End, typeahead and Enter/Space selection.
 *
 *   <Select value={value} onValueChange={setValue}>
 *     <Select.Trigger width={240}>
 *       <Select.Value placeholder="Pick a fruit" />
 *     </Select.Trigger>
 *     <Select.Content>
 *       <Select.Viewport>
 *         <Select.Item value="apple"><Select.ItemText>Apple</Select.ItemText><Select.ItemIndicator /></Select.Item>
 *       </Select.Viewport>
 *     </Select.Content>
 *   </Select>
 */
export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: SelectValue,
  Content: SelectContent,
  Viewport: SelectViewport,
  Group: SelectGroup,
  Label: SelectLabel,
  Item: SelectItem,
  ItemText: SelectItemText,
  ItemIndicator: SelectItemIndicator,
});
