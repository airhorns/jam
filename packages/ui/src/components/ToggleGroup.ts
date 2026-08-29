import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps } from "../styled";
import { getButtonSized, getFontSized } from "../variants";
import { useControllableList, useControllableState } from "../state";
import { rovingFocus } from "./roving-focus";
import { groupedChildrenClass } from "./group-css";

export type ToggleGroupType = "single" | "multiple";
export type ToggleGroupOrientation = "horizontal" | "vertical";

/** Size and orientation flow from the group to its items. */
export const ToggleGroupContext = createStyledContext<{
  size?: string | number;
  orientation?: ToggleGroupOrientation;
}>({
  size: undefined,
  orientation: undefined,
});

type ToggleGroupState = {
  isActive: (value: string) => boolean;
  toggle: (value: string) => void;
  disabled: boolean;
};

const ToggleState = createContext<ToggleGroupState>({
  isActive: () => false,
  toggle: () => {},
  disabled: false,
});

export const ToggleGroupFrame = styled("div", {
  name: "ToggleGroup",
  context: ToggleGroupContext,
  defaultProps: {
    role: "group",
    display: "inline-flex",
    boxSizing: "border-box",
  },
  variants: {
    orientation: {
      horizontal: { flexDirection: "row", alignItems: "stretch" },
      vertical: { flexDirection: "column" },
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export const ToggleGroupItemFrame = styled("button", {
  name: "ToggleGroupItem",
  context: ToggleGroupContext,
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
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        backgroundColor: "$background",
        color: "$color",
        fontFamily: "$body",
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
          outlineOffset: -1,
          zIndex: 10,
        },
        disabledStyle: {
          opacity: 0.5,
          cursor: "not-allowed",
        },
      },
    },

    size: {
      "...size": (value, extras) => ({ ...getButtonSized(value, extras), ...getFontSized(value, extras) }),
      ":number": (value: number, extras) => ({ ...getButtonSized(value, extras), ...getFontSized(value, extras) }),
    },

    activeState: {
      true: {
        backgroundColor: "$color5",
        borderColor: "$color7",
        zIndex: 1,
        hoverStyle: {
          backgroundColor: "$color6",
        },
        pressStyle: {
          backgroundColor: "$color6",
        },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type ToggleGroupItemProps = StyledProps & {
  value: string;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
  onClick?: (event: MouseEvent) => void;
};

/** One toggle in the group; reports its state with `aria-pressed`. */
function ToggleGroupItemComponent(props: ToggleGroupItemProps): VNode {
  const { value, children, onClick, ...frameProps } = props;
  const group = useContext(ToggleState);
  const active = group.isActive(value);
  const disabled = props.disabled === true || group.disabled;

  return h(
    ToggleGroupItemFrame,
    {
      ...(frameProps as Record<string, unknown>),
      disabled: disabled || undefined,
      activeState: active || undefined,
      "aria-pressed": String(active),
      "data-state": active ? "on" : "off",
      "data-value": value,
      onClick: (event: MouseEvent) => {
        onClick?.(event);
        if (disabled) return;
        group.toggle(value);
      },
    },
    ...(([] as VChild[]).concat(children ?? [])),
  );
}
ToggleGroupItemComponent.displayName = "ToggleGroup.Item";

type ToggleGroupBaseProps = StyledProps & {
  /** Keep the active item active when it is pressed again. */
  disableDeactivation?: boolean;
  orientation?: ToggleGroupOrientation;
  disabled?: boolean;
  size?: string | number;
  children?: VChild | VChild[];
  onKeyDown?: (event: KeyboardEvent) => void;
};

/** `type="single"` reports a string (`""` when deselected); `"multiple"` reports an array. */
export type ToggleGroupProps = ToggleGroupBaseProps &
  (
    | { type?: "single"; value?: string; defaultValue?: string; onValueChange?: (value: string) => void }
    | { type: "multiple"; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void }
  );

/**
 * ToggleGroup: a row (or column) of joined toggle buttons that behave as one
 * control. `type="single"` keeps at most one item active and reports a string;
 * `type="multiple"` reports an array. Arrow keys move focus between the items.
 */
function ToggleGroupComponent(props: ToggleGroupProps): VNode {
  const {
    type = "single",
    defaultValue,
    onValueChange,
    disableDeactivation,
    orientation = "horizontal",
    children,
    onKeyDown,
    ...frameProps
  } = props;
  const multiple = type === "multiple";

  const [single, setSingle] = useControllableState<string>("value", {
    value: multiple ? undefined : (props.value as string | undefined),
    defaultValue: multiple ? undefined : (defaultValue as string | undefined),
    onChange: multiple ? undefined : (onValueChange as unknown as (value: string) => void | undefined),
  });
  const [list, setList] = useControllableList("values", {
    value: multiple ? (props.value as string[] | undefined) : undefined,
    defaultValue: multiple ? (defaultValue as string[] | undefined) : undefined,
    onChange: multiple ? (onValueChange as unknown as (value: string[]) => void | undefined) : undefined,
  });

  const state: ToggleGroupState = {
    isActive: (value) => (multiple ? list.includes(value) : single === value),
    toggle: (value) => {
      if (multiple) {
        if (!list.includes(value)) setList([...list, value]);
        else if (!disableDeactivation) setList(list.filter((v) => v !== value));
        return;
      }
      if (single === value) {
        if (!disableDeactivation) setSingle("");
        return;
      }
      setSingle(value);
    },
    disabled: props.disabled === true,
  };

  return h(
    ToggleGroupFrame,
    {
      ...(frameProps as Record<string, unknown>),
      orientation,
      class: [groupedChildrenClass(orientation), props.class].filter(Boolean).join(" ") || undefined,
      "aria-orientation": orientation,
      "data-orientation": orientation,
      "data-disabled": props.disabled ? "true" : undefined,
      onKeyDown: (event: KeyboardEvent) => {
        onKeyDown?.(event);
        if (props.disabled) return;
        rovingFocus(event, "button[aria-pressed]", { orientation });
      },
    },
    h(ToggleState.Provider, { value: state }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
ToggleGroupComponent.displayName = "ToggleGroup";

export const ToggleGroup = Object.assign(ToggleGroupComponent, {
  Frame: ToggleGroupFrame,
  Item: ToggleGroupItemComponent,
  /** Provide `size`/`orientation` to every ToggleGroup beneath. */
  Apply: ToggleGroupContext.Provider,
});
