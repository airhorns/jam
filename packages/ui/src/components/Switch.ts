import { createContext, Fragment, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps, VariantExtras } from "../styled";
import { tokenValue } from "../variants";
import { useControllableState } from "../state";
import { useFormReset } from "../form";

/** Size flows from the Switch to its Thumb so the thumb and its travel scale together. */
export const SwitchContext = createStyledContext<{ size?: string | number }>({ size: undefined });

const SwitchState = createContext<{ checked: boolean; disabled: boolean }>({ checked: false, disabled: false });

/** tamagui's ratio: the track is 65% of the size token tall and twice that wide. */
function trackHeight(value: unknown, tokens: VariantExtras["tokens"]): number {
  const token = tokenValue(tokens, "size", value ?? "$true") ?? tokenValue(tokens, "size", "$true") ?? 44;
  return Math.round(token * 0.65);
}

/**
 * The thumb sits `THUMB_INSET` inside the track's 1px border on every side,
 * which leaves it exactly one track height of travel.
 */
const THUMB_INSET = 2;
const thumbSide = (height: number) => height - 2 * THUMB_INSET - 2;

export const SwitchFrame = styled("button", {
  name: "Switch",
  context: SwitchContext,
  defaultProps: {
    type: "button",
    role: "switch",
    position: "relative",
    boxSizing: "border-box",
    animation: "quick",
  },
  variants: {
    unstyled: {
      true: {
        borderWidth: 0,
        outlineStyle: "none",
        backgroundColor: "transparent",
        padding: 0,
      },
      false: {
        size: "$true",
        display: "inline-flex",
        alignItems: "center",
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

    size: {
      "...size": (value, { tokens }) => {
        const height = trackHeight(value, tokens);
        return { height, width: height * 2, minWidth: height * 2 };
      },
      ":number": (value: number) => {
        const height = Math.round(value * 0.65);
        return { height, width: height * 2, minWidth: height * 2 };
      },
    },

    checkedState: {
      true: {
        backgroundColor: "$color10",
        borderColor: "$color10",
        hoverStyle: {
          backgroundColor: "$color11",
          borderColor: "$color11",
        },
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const SwitchThumbFrame = styled("span", {
  name: "SwitchThumb",
  context: SwitchContext,
  defaultProps: {
    // resolveThemeName only appends component names to the parent chain, so the
    // SwitchThumb theme has to be asked for by name from inside light_Switch.
    theme: "SwitchThumb",
    position: "absolute",
    boxSizing: "border-box",
    animation: "quick",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        display: "block",
        borderRadius: 100_000,
        backgroundColor: "$background",
        pointerEvents: "none",
      },
    },

    size: {
      "...size": (value, { tokens }) => {
        const side = thumbSide(trackHeight(value, tokens));
        return { width: side, height: side, left: THUMB_INSET, top: "50%", y: "-50%" };
      },
      ":number": (value: number) => {
        const side = thumbSide(Math.round(value * 0.65));
        return { width: side, height: side, left: THUMB_INSET, top: "50%", y: "-50%" };
      },
    },

    checkedState: {
      true: (_value: boolean, { props, tokens }) => ({
        x: typeof props.size === "number" ? Math.round(props.size * 0.65) : trackHeight(props.size, tokens),
        backgroundColor: "$color",
      }),
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type SwitchThumbProps = StyledProps & {
  size?: string | number;
  unstyled?: boolean;
};

/** The sliding knob; reads `checked` and `disabled` from the Switch so it can translate itself. */
function SwitchThumbComponent(props: SwitchThumbProps): VNode {
  const { checked, disabled } = useContext(SwitchState);
  return h(SwitchThumbFrame, {
    ...(props as Record<string, unknown>),
    checkedState: checked || undefined,
    "data-state": checked ? "checked" : "unchecked",
    "data-disabled": disabled ? "" : undefined,
  });
}
SwitchThumbComponent.displayName = "Switch.Thumb";

export type SwitchProps = StyledProps & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  id?: string;
  /** Submitted with a form through a mirrored hidden checkbox input. */
  name?: string;
  value?: string;
  required?: boolean;
  children?: VChild | VChild[];
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
};

/**
 * Switch: a `role="switch"` button whose `Switch.Thumb` child slides between
 * the two ends of the track. Space and Enter toggle it natively; the arrow keys
 * set it off and on explicitly.
 */
function SwitchComponent(props: SwitchProps): VNode {
  const { defaultChecked, onCheckedChange, children, name, value, required, onClick, onKeyDown, ...frameProps } = props;
  const [checked, setChecked] = useControllableState<boolean>("checked", {
    value: props.checked,
    defaultValue: defaultChecked ?? false,
    onChange: onCheckedChange,
  });
  const on = checked === true;
  const size = props.size ?? (props.unstyled ? undefined : "$true");
  const disabled = props.disabled === true;
  const resetProps = useFormReset(() => setChecked(defaultChecked ?? false));

  const frame = h(
    SwitchFrame,
    {
      ...(frameProps as Record<string, unknown>),
      ...resetProps,
      size,
      checked: undefined,
      checkedState: on || undefined,
      "aria-checked": String(on),
      "aria-required": required || undefined,
      "data-state": on ? "checked" : "unchecked",
      "data-disabled": disabled ? "" : undefined,
      onClick: (event: MouseEvent) => {
        onClick?.(event);
        if (disabled) return;
        setChecked(!on);
      },
      onKeyDown: (event: KeyboardEvent) => {
        onKeyDown?.(event);
        if (disabled) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setChecked(event.key === "ArrowRight");
      },
    },
    h(SwitchState.Provider, { value: { checked: on, disabled } }, ...(([] as VChild[]).concat(children ?? []))),
  );
  if (name == null) return frame;

  return h(
    Fragment,
    null,
    frame,
    h("input", {
      type: "checkbox",
      name,
      value: value ?? "on",
      checked: on,
      required: required || undefined,
      disabled: disabled || undefined,
      tabIndex: -1,
      "aria-hidden": "true",
      style: { position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", margin: 0 },
    }),
  );
}
SwitchComponent.displayName = "Switch";

export const Switch = Object.assign(SwitchComponent, {
  Frame: SwitchFrame,
  Thumb: SwitchThumbComponent,
  /** Provide `size` to every Switch beneath. */
  Apply: SwitchContext.Provider,
});
