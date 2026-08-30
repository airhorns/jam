import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps } from "../styled";
import { getButtonSized, getFontSized, tokenValue } from "../variants";
import { useControllableState, useStableId } from "../state";
import { rovingFocus } from "./roving-focus";

export type TabsOrientation = "horizontal" | "vertical";
/** `automatic` selects a tab as soon as the arrow keys reach it. */
export type TabsActivationMode = "automatic" | "manual";

/** Size and orientation flow from the Tabs root to its list, tabs and panels. */
export const TabsContext = createStyledContext<{
  size?: string | number;
  orientation?: TabsOrientation;
}>({
  size: undefined,
  orientation: undefined,
});

type TabsStateValue = {
  value: string;
  select: (value: string) => void;
  orientation: TabsOrientation;
  activationMode: TabsActivationMode;
  baseId: string;
};

const TabsState = createContext<TabsStateValue>({
  value: "",
  select: () => {},
  orientation: "horizontal",
  activationMode: "automatic",
  baseId: "tabs",
});

const tabId = (baseId: string, value: string) => `${baseId}-tab-${value}`;
const panelId = (baseId: string, value: string) => `${baseId}-panel-${value}`;

export const TabsFrame = styled("div", {
  name: "Tabs",
  context: TabsContext,
  defaultProps: {
    display: "flex",
    boxSizing: "border-box",
  },
  variants: {
    orientation: {
      horizontal: { flexDirection: "column" },
      vertical: { flexDirection: "row" },
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export const TabsListFrame = styled("div", {
  name: "TabsList",
  context: TabsContext,
  defaultProps: {
    display: "flex",
    boxSizing: "border-box",
    flexShrink: 0,
  },
  variants: {
    unstyled: { false: {} },
    // Only one side is bordered, so every border prop here is a longhand: an
    // atomic `border-width` shorthand would fight it depending on which was
    // injected first.
    orientation: {
      horizontal: (_value, { props }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        ...(props.unstyled
          ? {}
          : { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "$borderColor" }),
      }),
      vertical: (_value, { props }) => ({
        flexDirection: "column",
        alignItems: "stretch",
        ...(props.unstyled
          ? {}
          : { borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "$borderColor" }),
      }),
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "horizontal",
  },
});

export const TabsTabFrame = styled("button", {
  name: "TabsTab",
  context: TabsContext,
  defaultProps: {
    type: "button",
    role: "tab",
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
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "$2",
        flexShrink: 0,
        borderRadius: 0,
        backgroundColor: "transparent",
        color: "$color10",
        fontFamily: "$body",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        hoverStyle: {
          color: "$color",
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

    // The indicator overlaps the list's own border, so only one line shows.
    // Every border prop is a longhand (see TabsListFrame), which means the
    // three unused sides have to be zeroed one by one over the UA button border.
    orientation: {
      horizontal: (_value, { props }) =>
        props.unstyled
          ? null
          : {
              borderTopWidth: 0,
              borderLeftWidth: 0,
              borderRightWidth: 0,
              borderBottomWidth: 2,
              borderBottomStyle: "solid",
              borderBottomColor: "transparent",
              marginBottom: -1,
            },
      vertical: (_value, { props }) =>
        props.unstyled
          ? { justifyContent: "flex-start" }
          : {
              borderTopWidth: 0,
              borderLeftWidth: 0,
              borderBottomWidth: 0,
              borderRightWidth: 2,
              borderRightStyle: "solid",
              borderRightColor: "transparent",
              marginRight: -1,
              justifyContent: "flex-start",
            },
    },

    size: {
      "...size": (value, extras) => sizedTab(value, extras),
      ":number": (value: number, extras) => sizedTab(value, extras),
    },

    activeState: {
      true: (_value, { props }) => ({
        color: "$color",
        fontWeight: "600",
        ...(props.orientation === "vertical" ? { borderRightColor: "$color10" } : { borderBottomColor: "$color10" }),
        hoverStyle: { color: "$color" },
      }),
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "horizontal",
  },
});

/** Button sizing without the radius: tabs are square so the indicator sits flush. */
function sizedTab(value: string | number, extras: Parameters<typeof getButtonSized>[1]) {
  const sized = (getButtonSized(value, extras) ?? {}) as Record<string, unknown>;
  const { borderRadius: _radius, ...rest } = sized;
  return { ...rest, ...getFontSized(value, extras) };
}

export const TabsContentFrame = styled("div", {
  name: "TabsContent",
  context: TabsContext,
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        flexGrow: 1,
        minWidth: 0,
        color: "$color",
        focusVisibleStyle: {
          outlineColor: "$outlineColor",
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineOffset: -2,
        },
      },
    },
    size: {
      "...size": (value, { tokens }) => ({ padding: tokenValue(tokens, "space", value) ?? tokens.space?.true }),
      ":number": (value: number) => ({ padding: value }),
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type TabsListProps = StyledProps & {
  /** Wrap around when the arrow keys reach either end. */
  loop?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
  onKeyDown?: (event: KeyboardEvent) => void;
};

/** The row (or column) of tabs; owns arrow-key navigation. */
function TabsListComponent(props: TabsListProps): VNode {
  const { loop = true, children, onKeyDown, ...frameProps } = props;
  const state = useContext(TabsState);

  return h(
    TabsListFrame,
    {
      ...(frameProps as Record<string, unknown>),
      role: "tablist",
      "aria-orientation": state.orientation,
      "data-orientation": state.orientation,
      onKeyDown: (event: KeyboardEvent) => {
        onKeyDown?.(event);
        rovingFocus(event, "[role=tab]", {
          orientation: state.orientation,
          loop,
          onMove:
            state.activationMode === "automatic"
              ? (item) => {
                  const value = item.dataset.value;
                  if (value !== undefined) state.select(value);
                }
              : undefined,
        });
      },
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
TabsListComponent.displayName = "Tabs.List";

export type TabsTabProps = StyledProps & {
  value: string;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
  onClick?: (event: MouseEvent) => void;
};

/** One tab; selects its panel when clicked. */
function TabsTabComponent(props: TabsTabProps): VNode {
  const { value, children, onClick, ...frameProps } = props;
  const state = useContext(TabsState);
  const selected = state.value === value;
  const disabled = props.disabled === true;

  return h(
    TabsTabFrame,
    {
      ...(frameProps as Record<string, unknown>),
      id: tabId(state.baseId, value),
      disabled: disabled || undefined,
      activeState: selected || undefined,
      "aria-selected": String(selected),
      "aria-controls": panelId(state.baseId, value),
      "data-state": selected ? "active" : "inactive",
      "data-value": value,
      // Only the selected tab is a tab stop; the arrows reach the rest.
      tabIndex: state.value === "" ? 0 : selected ? 0 : -1,
      onClick: (event: MouseEvent) => {
        onClick?.(event);
        if (disabled) return;
        state.select(value);
      },
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
TabsTabComponent.displayName = "Tabs.Tab";

export type TabsContentProps = StyledProps & {
  value: string;
  /** Render the panel even when its tab is not selected (it stays visible with `data-state="inactive"`). */
  forceMount?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
};

/** The panel for one tab; renders nothing unless its tab is selected. */
function TabsContentComponent(props: TabsContentProps): VNode | null {
  const { value, forceMount, children, ...frameProps } = props;
  const state = useContext(TabsState);
  const selected = state.value === value;
  if (!selected && !forceMount) return null;

  return h(
    TabsContentFrame,
    {
      ...(frameProps as Record<string, unknown>),
      id: panelId(state.baseId, value),
      role: "tabpanel",
      "aria-labelledby": tabId(state.baseId, value),
      "data-state": selected ? "active" : "inactive",
      "data-orientation": state.orientation,
      tabIndex: 0,
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
TabsContentComponent.displayName = "Tabs.Content";

export type TabsProps = StyledProps & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  /** `automatic` (default) selects on arrow-key focus; `manual` waits for a click or Space. */
  activationMode?: TabsActivationMode;
  size?: string | number;
  children?: VChild | VChild[];
};

/**
 * Tabs: one panel at a time out of a set, chosen from a row (or column) of
 * tabs. Arrow keys move between the tabs and, unless `activationMode` is
 * `manual`, select as they go.
 */
function TabsComponent(props: TabsProps): VNode {
  const {
    defaultValue,
    onValueChange,
    orientation = "horizontal",
    activationMode = "automatic",
    children,
    ...frameProps
  } = props;

  const baseId = useStableId("tabs");
  const [value, setValue] = useControllableState<string>("value", {
    value: props.value,
    defaultValue: defaultValue ?? "",
    onChange: onValueChange,
  });

  const state: TabsStateValue = {
    value: value ?? "",
    select: setValue,
    orientation,
    activationMode,
    baseId,
  };

  return h(
    TabsFrame,
    {
      ...(frameProps as Record<string, unknown>),
      orientation,
      "data-orientation": orientation,
      "data-value": value || undefined,
    },
    h(TabsState.Provider, { value: state }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
TabsComponent.displayName = "Tabs";

export const Tabs = Object.assign(TabsComponent, {
  Frame: TabsFrame,
  List: TabsListComponent,
  Tab: TabsTabComponent,
  Content: TabsContentComponent,
  /** Provide `size`/`orientation` to every Tabs beneath. */
  Apply: TabsContext.Provider,
});
