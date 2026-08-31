import { createContext, Fragment, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps, VariantExtras } from "../styled";
import { tokenValue } from "../variants";
import { useControllableState } from "../state";
import { useFormReset } from "../form";

export type CheckedState = boolean | "indeterminate";

/** Size flows from the Checkbox to its Indicator so the glyph scales with the box. */
export const CheckboxContext = createStyledContext<{ size?: string | number }>({ size: undefined });

const CheckboxState = createContext<{ checked: CheckedState }>({ checked: false });

/** tamagui sizes the box at 45% of the size token; the `...size` spread only runs for tokens that exist. */
const boxSize = (value: unknown, tokens: VariantExtras["tokens"]) => Math.round(tokenValue(tokens, "size", value)! * 0.45);

export const CheckboxFrame = styled("button", {
  name: "Checkbox",
  context: CheckboxContext,
  defaultProps: {
    type: "button",
    role: "checkbox",
    position: "relative",
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
        justifyContent: "center",
        flexShrink: 0,
        padding: 0,
        backgroundColor: "$background",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        color: "$color",
        cursor: "pointer",
        userSelect: "none",
        hoverStyle: {
          borderColor: "$borderColorHover",
        },
        pressStyle: {
          backgroundColor: "$backgroundPress",
          borderColor: "$borderColorPress",
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
        const side = boxSize(value, tokens);
        return { width: side, height: side, borderRadius: Math.round(side / 4) };
      },
      ":number": (value: number) => ({ width: value, height: value, borderRadius: Math.round(value / 4) }),
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const CheckboxIndicatorFrame = styled("span", {
  name: "CheckboxIndicator",
  context: CheckboxContext,
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    pointerEvents: "none",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        color: "$color",
        fontFamily: "$body",
        fontWeight: "700",
      },
    },
    size: {
      "...size": (value, { tokens }) => ({ fontSize: Math.round(boxSize(value, tokens) * 0.75) }),
      ":number": (value: number) => ({ fontSize: Math.round(value * 0.75) }),
    },
    indeterminate: {
      true: {
        width: "60%",
        height: 2,
        borderRadius: 100_000,
        backgroundColor: "$color",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type CheckboxIndicatorProps = StyledProps & {
  size?: string | number;
  /** Render even when the checkbox is unchecked. */
  forceMount?: boolean;
  children?: VChild | VChild[];
};

/** Shown only while the checkbox is checked or indeterminate; defaults to a check glyph. */
function CheckboxIndicatorComponent(props: CheckboxIndicatorProps): VNode | null {
  const { forceMount, children, ...rest } = props;
  const { checked } = useContext(CheckboxState);
  if (!forceMount && checked === false) return null;
  const indeterminate = checked === "indeterminate";
  const content: VChild[] = children != null ? ([] as VChild[]).concat(children) : [];
  return h(
    CheckboxIndicatorFrame,
    { "aria-hidden": "true", ...(rest as Record<string, unknown>), indeterminate: indeterminate || undefined },
    ...(indeterminate ? [] : content.length > 0 ? content : ["✓"]),
  );
}
CheckboxIndicatorComponent.displayName = "Checkbox.Indicator";

export type CheckboxProps = StyledProps & {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  /** Submitted with a form through a mirrored hidden input. */
  name?: string;
  value?: string;
  required?: boolean;
  id?: string;
  children?: VChild | VChild[];
  onClick?: (event: MouseEvent) => void;
};

/**
 * Checkbox: a `role="checkbox"` button holding its own state, with an optional
 * `Checkbox.Indicator` child. `checked` may be `"indeterminate"`, which renders
 * `aria-checked="mixed"` and a dash instead of a check.
 */
function CheckboxComponent(props: CheckboxProps): VNode {
  const { defaultChecked, onCheckedChange, children, name, value, required, onClick, ...frameProps } = props;
  const [checked, setChecked] = useControllableState<CheckedState>("checked", {
    value: props.checked,
    defaultValue: defaultChecked ?? false,
    onChange: onCheckedChange,
  });
  const state: CheckedState = checked ?? false;
  const resetProps = useFormReset(() => setChecked(defaultChecked ?? false));

  const frame = h(
    CheckboxFrame,
    {
      ...(frameProps as Record<string, unknown>),
      checked: undefined,
      "aria-checked": state === "indeterminate" ? "mixed" : String(state),
      "aria-required": required || undefined,
      "data-state": state === "indeterminate" ? "indeterminate" : state ? "checked" : "unchecked",
      "data-disabled": props.disabled ? "" : undefined,
      onClick: (event: MouseEvent) => {
        onClick?.(event);
        if (props.disabled) return;
        setChecked(state === true ? false : true);
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Enter") event.preventDefault();
      },
    },
    h(CheckboxState.Provider, { value: { checked: state } }, ...(([] as VChild[]).concat(children ?? []))),
  );
  if (name == null) return frame;

  return h(
    Fragment,
    null,
    frame,
    h("input", {
      ...resetProps,
      type: "checkbox",
      name,
      value: value ?? "on",
      checked: state === true,
      required: required || undefined,
      disabled: props.disabled || undefined,
      tabIndex: -1,
      "aria-hidden": "true",
      style: { position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", margin: 0 },
    }),
  );
}
CheckboxComponent.displayName = "Checkbox";

export const Checkbox = Object.assign(CheckboxComponent, {
  Frame: CheckboxFrame,
  Indicator: CheckboxIndicatorComponent,
  /** Provide `size` to every Checkbox beneath. */
  Apply: CheckboxContext.Provider,
});
