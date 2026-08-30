import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps } from "../styled";
import { tokenValue } from "../variants";
import { useControllableState } from "../state";
import { rovingFocus } from "./roving-focus";

export type RadioGroupOrientation = "horizontal" | "vertical";

/** Size and orientation flow from the group to its items. */
export const RadioGroupContext = createStyledContext<{
  size?: string | number;
  orientation?: RadioGroupOrientation;
}>({
  size: undefined,
  orientation: undefined,
});

type RadioGroupState = {
  value?: string;
  select: (value: string) => void;
  disabled: boolean;
  /** Native radio behaviour: with nothing selected every item is tabbable. */
  anySelected: boolean;
};

const RadioState = createContext<RadioGroupState>({
  value: undefined,
  select: () => {},
  disabled: false,
  anySelected: false,
});

const RadioItemState = createContext<{ checked: boolean }>({ checked: false });

export const RadioGroupFrame = styled("div", {
  name: "RadioGroup",
  context: RadioGroupContext,
  defaultProps: {
    role: "radiogroup",
    display: "flex",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      false: { size: "$2" },
    },
    orientation: {
      horizontal: { flexDirection: "row", alignItems: "center" },
      vertical: { flexDirection: "column" },
    },
    size: {
      "...size": (value, { tokens }) => ({ gap: tokenValue(tokens, "space", value) }),
      ":number": (value: number) => ({ gap: value * 0.25 }),
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "vertical",
  },
});

export const RadioGroupItemFrame = styled("button", {
  name: "RadioGroupItem",
  context: RadioGroupContext,
  defaultProps: {
    type: "button",
    role: "radio",
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
        padding: 0,
        borderRadius: 100_000,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        backgroundColor: "$background",
        cursor: "pointer",
        userSelect: "none",
        hoverStyle: {
          borderColor: "$borderColorHover",
        },
        focusVisibleStyle: {
          outlineColor: "$outlineColor",
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineOffset: 2,
        },
        disabledStyle: {
          opacity: 0.5,
          cursor: "not-allowed",
        },
      },
    },

    // tamagui's ratio: half the size token, so a radio reads smaller than a button.
    size: {
      "...size": (value, { tokens }) => {
        const side = Math.floor((tokenValue(tokens, "size", value) ?? 44) * 0.5);
        return { width: side, height: side };
      },
      ":number": (value: number) => ({ width: value, height: value }),
    },

    checkedState: {
      true: {
        borderColor: "$color",
        borderWidth: 2,
        hoverStyle: {
          borderColor: "$color",
        },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const RadioGroupIndicatorFrame = styled("span", {
  name: "RadioGroupIndicator",
  context: RadioGroupContext,
  defaultProps: {
    display: "block",
    pointerEvents: "none",
  },
  variants: {
    unstyled: {
      false: {
        width: "50%",
        height: "50%",
        borderRadius: 100_000,
        backgroundColor: "$color",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type RadioGroupIndicatorProps = StyledProps & {
  /** Render even when the item is not selected. */
  forceMount?: boolean;
  unstyled?: boolean;
};

/** The filled dot; rendered only while its item is selected. */
function RadioGroupIndicatorComponent(props: RadioGroupIndicatorProps): VNode | null {
  const { forceMount, ...rest } = props;
  const { checked } = useContext(RadioItemState);
  if (!forceMount && !checked) return null;
  return h(RadioGroupIndicatorFrame, rest as Record<string, unknown>);
}
RadioGroupIndicatorComponent.displayName = "RadioGroup.Indicator";

export type RadioGroupItemProps = StyledProps & {
  value: string;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  id?: string;
  children?: VChild | VChild[];
  onClick?: (event: MouseEvent) => void;
};

/** One radio in the group; selects itself on click. */
function RadioGroupItemComponent(props: RadioGroupItemProps): VNode {
  const { value, children, onClick, ...frameProps } = props;
  const group = useContext(RadioState);
  const checked = group.value === value;
  const disabled = props.disabled === true || group.disabled;

  return h(
    RadioGroupItemFrame,
    {
      ...(frameProps as Record<string, unknown>),
      disabled: disabled || undefined,
      checkedState: checked || undefined,
      "aria-checked": String(checked),
      "data-state": checked ? "checked" : "unchecked",
      "data-value": value,
      tabIndex: group.anySelected ? (checked ? 0 : -1) : 0,
      onClick: (event: MouseEvent) => {
        onClick?.(event);
        if (disabled) return;
        group.select(value);
      },
    },
    h(RadioItemState.Provider, { value: { checked } }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
RadioGroupItemComponent.displayName = "RadioGroup.Item";

export type RadioGroupProps = StyledProps & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: RadioGroupOrientation;
  disabled?: boolean;
  size?: string | number;
  /** Reserved for form integration; rendered as `data-name` on the group. */
  name?: string;
  required?: boolean;
  children?: VChild | VChild[];
  onKeyDown?: (event: KeyboardEvent) => void;
};

/**
 * RadioGroup: a `role="radiogroup"` container in which exactly one
 * `RadioGroup.Item` can be selected. Arrow keys move selection between the
 * enabled items and follow it with focus, as native radios do.
 */
function RadioGroupComponent(props: RadioGroupProps): VNode {
  const { defaultValue, onValueChange, orientation = "vertical", children, name, required, onKeyDown, ...frameProps } = props;
  const [value, setValue] = useControllableState<string>("value", {
    value: props.value,
    defaultValue,
    onChange: onValueChange,
  });

  const state: RadioGroupState = {
    value: value ?? undefined,
    select: (next) => setValue(next),
    disabled: props.disabled === true,
    anySelected: value != null,
  };

  return h(
    RadioGroupFrame,
    {
      ...(frameProps as Record<string, unknown>),
      orientation,
      "aria-orientation": orientation,
      "aria-required": required || undefined,
      "data-name": name,
      "data-disabled": props.disabled ? "true" : undefined,
      onKeyDown: (event: KeyboardEvent) => {
        onKeyDown?.(event);
        if (props.disabled) return;
        rovingFocus(event, "[role=radio]", {
          orientation: orientation === "horizontal" ? "horizontal" : "vertical",
          onMove: (item) => {
            const next = item.dataset.value;
            if (next != null) setValue(next);
          },
        });
      },
    },
    h(RadioState.Provider, { value: state }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
RadioGroupComponent.displayName = "RadioGroup";

export const RadioGroup = Object.assign(RadioGroupComponent, {
  Frame: RadioGroupFrame,
  Item: RadioGroupItemComponent,
  Indicator: RadioGroupIndicatorComponent,
  /** Provide `size`/`orientation` to every RadioGroup beneath. */
  Apply: RadioGroupContext.Provider,
});
