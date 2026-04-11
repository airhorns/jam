import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Checkbox: toggleable checkbox control.
 *
 * Usage:
 *   <Checkbox checked={isChecked} onCheckedChange={(v) => setChecked(v)}>
 *     <Checkbox.Indicator>✓</Checkbox.Indicator>
 *   </Checkbox>
 */
export function Checkbox(props: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: string;
  id?: string;
  children?: VChild | VChild[];
  class?: string;
  [key: string]: unknown;
}): VNode | null {
  const {
    checked,
    onCheckedChange,
    disabled = false,
    size = "3",
    children,
    ...rest
  } = props;

  const sizeMap: Record<string, number> = {
    "1": 16, "2": 20, "3": 24, "4": 28, "5": 32,
  };
  const dim = sizeMap[size] ?? 24;

  return CheckboxFrame({
    ...rest,
    role: "checkbox",
    "aria-checked": checked ? "true" : "false",
    "aria-disabled": disabled ? "true" : undefined,
    width: dim,
    height: dim,
    onClick: disabled ? undefined : () => onCheckedChange?.(!checked),
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    children: checked ? children : undefined,
  });
}
Checkbox.displayName = "Checkbox";

const CheckboxFrame = styled("div", {
  name: "CheckboxFrame",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.2",
    backgroundColor: "$background",
    userSelect: "none",
    hoverStyle: {
      borderColor: "$borderColorHover",
    },
  },
});

/**
 * Checkbox.Indicator: visual indicator shown when checkbox is checked.
 */
Checkbox.Indicator = styled("span", {
  name: "CheckboxIndicator",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "$color",
  },
});
