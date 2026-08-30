import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps, VariantExtras } from "../styled";
import { getButtonSized, getFontSized, getRadiusSized, tokenValue } from "../variants";
import { useControllableList, useControllableState, useStableId } from "../state";
import { rovingFocus } from "./roving-focus";
import { lastChildBorderlessClass } from "./group-css";

const ACCORDION_KEYS = new Set(["Home", "End", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]);

export type AccordionType = "single" | "multiple";
export type AccordionOrientation = "vertical" | "horizontal";

/** Size and orientation flow from the Accordion to its items, triggers and panels. */
export const AccordionContext = createStyledContext<{
  size?: string | number;
  orientation?: AccordionOrientation;
}>({
  size: undefined,
  orientation: undefined,
});

type AccordionStateValue = {
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
  disabled: boolean;
  orientation: AccordionOrientation;
};

const AccordionState = createContext<AccordionStateValue>({
  isOpen: () => false,
  toggle: () => {},
  disabled: false,
  orientation: "vertical",
});

type AccordionItemStateValue = {
  open: boolean;
  disabled: boolean;
  triggerId: string;
  contentId: string;
  toggle: () => void;
};

const ItemState = createContext<AccordionItemStateValue>({
  open: false,
  disabled: false,
  triggerId: "",
  contentId: "",
  toggle: () => {},
});

export const AccordionFrame = styled("div", {
  name: "Accordion",
  context: AccordionContext,
  defaultProps: {
    display: "flex",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        backgroundColor: "$background",
        overflow: "hidden",
      },
    },
    orientation: {
      vertical: { flexDirection: "column" },
      horizontal: { flexDirection: "row" },
    },
    size: {
      "...size": getRadiusSized,
      ":number": getRadiusSized,
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "vertical",
  },
});

export const AccordionItemFrame = styled("div", {
  name: "AccordionItem",
  context: AccordionContext,
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      false: {
        minWidth: 0,
        // The last item's line is removed by the frame's injected rule.
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: "$borderColor",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const AccordionHeaderFrame = styled("h3", {
  name: "AccordionHeader",
  context: AccordionContext,
  defaultProps: {
    display: "flex",
    margin: 0,
    boxSizing: "border-box",
  },
});

export const AccordionTriggerFrame = styled("button", {
  name: "AccordionTrigger",
  context: AccordionContext,
  defaultProps: {
    type: "button",
    boxSizing: "border-box",
    animation: "quick",
  },
  variants: {
    unstyled: {
      true: {
        borderWidth: 0,
        outlineWidth: 0,
        backgroundColor: "transparent",
        padding: 0,
      },
      false: {
        size: "$true",
        display: "flex",
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "space-between",
        gap: "$2",
        width: "100%",
        borderWidth: 0,
        borderRadius: 0,
        backgroundColor: "transparent",
        color: "$color",
        fontFamily: "$body",
        textAlign: "left",
        cursor: "pointer",
        userSelect: "none",
        hoverStyle: {
          backgroundColor: "$backgroundHover",
        },
        pressStyle: {
          backgroundColor: "$backgroundPress",
        },
        focusVisibleStyle: {
          outlineColor: "$outlineColor",
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineOffset: -2,
          zIndex: 10,
        },
        disabledStyle: {
          opacity: 0.5,
          cursor: "not-allowed",
        },
      },
    },
    size: {
      "...size": (value, extras) => sizedTrigger(value, extras),
      ":number": (value: number, extras) => sizedTrigger(value, extras),
    },
    openState: {
      true: { fontWeight: "600" },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** Button sizing as a minimum height, so a long title wraps instead of clipping. */
function sizedTrigger(value: string | number, extras: VariantExtras) {
  const { borderRadius: _radius, height, ...rest } = (getButtonSized(value, extras) ?? {}) as Record<string, unknown>;
  return { ...rest, minHeight: height, ...getFontSized(value, extras) };
}

export const AccordionIndicatorFrame = styled("span", {
  name: "AccordionIndicator",
  context: AccordionContext,
  defaultProps: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        color: "$color10",
      },
    },
    size: {
      "...size": getFontSized,
      ":number": getFontSized,
    },
    openState: {
      true: { rotate: "180deg" },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const AccordionContentFrame = styled("div", {
  name: "AccordionContent",
  context: AccordionContext,
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        minWidth: 0,
        color: "$color",
      },
    },
    size: {
      // Longhands only: the trigger above already supplies the top gap.
      "...size": (value, { tokens }) => contentPadding(tokenValue(tokens, "space", value) ?? tokens.space?.true),
      ":number": (value: number) => contentPadding(value),
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const contentPadding = (padding: string | number | undefined) => ({
  paddingLeft: padding,
  paddingRight: padding,
  paddingBottom: padding,
  paddingTop: 0,
});

export type AccordionItemProps = StyledProps & {
  value: string;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
};

/** One collapsible section: a header/trigger plus its content. */
function AccordionItemComponent(props: AccordionItemProps): VNode {
  const { value, disabled, children, ...frameProps } = props;
  const group = useContext(AccordionState);
  const open = group.isOpen(value);
  const isDisabled = disabled === true || group.disabled;
  const triggerId = useStableId("trigger");
  const contentId = useStableId("content");

  const state: AccordionItemStateValue = {
    open,
    disabled: isDisabled,
    triggerId,
    contentId,
    toggle: () => {
      if (!isDisabled) group.toggle(value);
    },
  };

  return h(
    AccordionItemFrame,
    {
      ...(frameProps as Record<string, unknown>),
      "data-state": open ? "open" : "closed",
      "data-value": value,
      "data-disabled": isDisabled ? "" : undefined,
      "data-orientation": group.orientation,
    },
    h(ItemState.Provider, { value: state }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
AccordionItemComponent.displayName = "Accordion.Item";

export type AccordionHeaderProps = StyledProps & {
  children?: VChild | VChild[];
};

/** The heading wrapper around a trigger; carries the item's state as data attributes. */
function AccordionHeaderComponent(props: AccordionHeaderProps): VNode {
  const { children, ...frameProps } = props;
  const item = useContext(ItemState);
  const group = useContext(AccordionState);

  return h(
    AccordionHeaderFrame,
    {
      ...(frameProps as Record<string, unknown>),
      "data-state": item.open ? "open" : "closed",
      "data-orientation": group.orientation,
      "data-disabled": item.disabled ? "" : undefined,
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
AccordionHeaderComponent.displayName = "Accordion.Header";

export type AccordionTriggerProps = StyledProps & {
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
  onClick?: (event: MouseEvent) => void;
};

/** The button that opens and closes its item. */
function AccordionTriggerComponent(props: AccordionTriggerProps): VNode {
  const { children, onClick, ...frameProps } = props;
  const item = useContext(ItemState);

  return h(
    AccordionTriggerFrame,
    {
      ...(frameProps as Record<string, unknown>),
      id: item.triggerId,
      disabled: item.disabled || undefined,
      openState: item.open || undefined,
      "aria-expanded": String(item.open),
      "aria-controls": item.open ? item.contentId : undefined,
      "data-state": item.open ? "open" : "closed",
      "data-disabled": item.disabled ? "" : undefined,
      "data-accordion-trigger": "",
      onClick: (event: MouseEvent) => {
        onClick?.(event);
        item.toggle();
      },
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
AccordionTriggerComponent.displayName = "Accordion.Trigger";

export type AccordionIndicatorProps = StyledProps & {
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
};

const chevron = h(
  "svg",
  { width: "1em", height: "1em", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
  h("path", { d: "M3.5 6 8 10.5 12.5 6", stroke: "currentColor", "stroke-width": 1.75, "stroke-linecap": "round", "stroke-linejoin": "round" }),
);

/** The chevron on the right of a trigger; flips when its item opens. */
function AccordionIndicatorComponent(props: AccordionIndicatorProps): VNode {
  const { children, ...frameProps } = props;
  const item = useContext(ItemState);
  const content = children === undefined ? [chevron] : ([] as VChild[]).concat(children);

  return h(
    AccordionIndicatorFrame,
    {
      ...(frameProps as Record<string, unknown>),
      openState: item.open || undefined,
      "aria-hidden": "true",
    },
    ...content,
  );
}
AccordionIndicatorComponent.displayName = "Accordion.Indicator";

export type AccordionContentProps = StyledProps & {
  /** Keep the content mounted (hidden) while the item is closed. */
  forceMount?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
};

/** The revealed content of an item; renders nothing while the item is closed. */
function AccordionContentComponent(props: AccordionContentProps): VNode | null {
  const { forceMount, children, ...frameProps } = props;
  const item = useContext(ItemState);
  if (!item.open && !forceMount) return null;

  return h(
    AccordionContentFrame,
    {
      ...(frameProps as Record<string, unknown>),
      id: item.contentId,
      role: "region",
      "aria-labelledby": item.triggerId,
      "data-state": item.open ? "open" : "closed",
      hidden: item.open ? undefined : true,
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
AccordionContentComponent.displayName = "Accordion.Content";

type AccordionBaseProps = StyledProps & {
  orientation?: AccordionOrientation;
  /** Reading direction; reverses which arrow moves to the next trigger. */
  dir?: "ltr" | "rtl";
  disabled?: boolean;
  size?: string | number;
  children?: VChild | VChild[];
  onKeyDown?: (event: KeyboardEvent) => void;
};

/** `type="single"` opens one item and reports a string; `"multiple"` reports an array. */
export type AccordionProps = AccordionBaseProps &
  (
    | {
        type?: "single";
        value?: string;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
        /** Allow the open item to be closed again. */
        collapsible?: boolean;
      }
    | { type: "multiple"; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void }
  );

/**
 * Accordion: a stack of collapsible sections. `type="single"` keeps at most one
 * open (add `collapsible` to let it close again); `type="multiple"` keeps any
 * number open. Arrow keys move between the triggers.
 */
function AccordionComponent(props: AccordionProps): VNode {
  const {
    type = "single",
    defaultValue,
    onValueChange,
    orientation = "vertical",
    dir,
    disabled,
    children,
    onKeyDown,
    ...frameProps
  } = props;
  const multiple = type === "multiple";
  const collapsible = multiple || (props as { collapsible?: boolean }).collapsible === true;

  const [single, setSingle] = useControllableState<string>("value", {
    value: multiple ? undefined : (props.value as string | undefined),
    defaultValue: multiple ? undefined : ((defaultValue as string | undefined) ?? ""),
    onChange: multiple ? undefined : (onValueChange as unknown as (value: string) => void | undefined),
  });
  const [list, setList] = useControllableList("values", {
    value: multiple ? (props.value as string[] | undefined) : undefined,
    defaultValue: multiple ? (defaultValue as string[] | undefined) : undefined,
    onChange: multiple ? (onValueChange as unknown as (value: string[]) => void | undefined) : undefined,
  });

  const state: AccordionStateValue = {
    isOpen: (value) => (multiple ? list.includes(value) : single === value),
    toggle: (value) => {
      if (multiple) {
        if (list.includes(value)) setList(list.filter((v) => v !== value));
        else setList([...list, value]);
        return;
      }
      if (single === value) {
        if (collapsible) setSingle("");
        return;
      }
      setSingle(value);
    },
    disabled: disabled === true,
    orientation,
  };

  return h(
    AccordionFrame,
    {
      ...(frameProps as Record<string, unknown>),
      orientation,
      dir,
      class: [lastChildBorderlessClass(), props.class].filter(Boolean).join(" ") || undefined,
      "data-orientation": orientation,
      "data-disabled": disabled ? "" : undefined,
      onKeyDown: (event: KeyboardEvent) => {
        onKeyDown?.(event);
        if (disabled) return;
        const target = event.target as HTMLElement | null;
        if (ACCORDION_KEYS.has(event.key) && target?.matches("[data-accordion-trigger]:not([disabled])")) event.preventDefault();
        rovingFocus(event, "[data-accordion-trigger]", { orientation, dir });
      },
    },
    h(AccordionState.Provider, { value: state }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
AccordionComponent.displayName = "Accordion";

export const Accordion = Object.assign(AccordionComponent, {
  Frame: AccordionFrame,
  Item: AccordionItemComponent,
  Header: AccordionHeaderComponent,
  Trigger: AccordionTriggerComponent,
  Indicator: AccordionIndicatorComponent,
  Content: AccordionContentComponent,
  /** Provide `size`/`orientation` to every Accordion beneath. */
  Apply: AccordionContext.Provider,
});
