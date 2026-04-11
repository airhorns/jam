import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * RadioGroup: single-selection group of radio items.
 *
 * Usage:
 *   <RadioGroup value={selected} onValueChange={setSelected}>
 *     <RadioGroup.Item value="a"><RadioGroup.Indicator /></RadioGroup.Item>
 *     <RadioGroup.Item value="b"><RadioGroup.Indicator /></RadioGroup.Item>
 *   </RadioGroup>
 */
export function RadioGroup(props: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const {
    value,
    onValueChange,
    orientation = "vertical",
    disabled = false,
    children,
    ...rest
  } = props;

  return RadioGroupFrame({
    ...rest,
    role: "radiogroup",
    "aria-orientation": orientation,
    flexDirection: orientation === "horizontal" ? "row" : "column",
    children,
    // Pass context via data attributes (since we don't have React context)
    "data-value": value,
    "data-disabled": disabled ? "true" : undefined,
  });
}
RadioGroup.displayName = "RadioGroup";

const RadioGroupFrame = styled("div", {
  name: "RadioGroupFrame",
  defaultProps: {
    display: "flex",
    gap: 8,
  },
});

/**
 * RadioGroup.Item: individual radio button.
 */
const RadioGroupItem = function RadioGroupItem(props: {
  value: string;
  disabled?: boolean;
  children?: VChild | VChild[];
  onSelect?: () => void;
  checked?: boolean;
  [key: string]: unknown;
}): VNode | null {
  const { value, disabled = false, children, onSelect, checked = false, ...rest } = props;

  return RadioItemFrame({
    ...rest,
    role: "radio",
    "aria-checked": checked ? "true" : "false",
    "aria-disabled": disabled ? "true" : undefined,
    onClick: disabled ? undefined : () => onSelect?.(),
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    children,
  });
};
RadioGroupItem.displayName = "RadioGroupItem";
RadioGroup.Item = RadioGroupItem;

const RadioItemFrame = styled("div", {
  name: "RadioItemFrame",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: 100000,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "$borderColor",
    backgroundColor: "$background",
    userSelect: "none",
    hoverStyle: {
      borderColor: "$borderColorHover",
    },
  },
});

/**
 * RadioGroup.Indicator: visual dot for selected radio.
 */
RadioGroup.Indicator = styled("div", {
  name: "RadioGroupIndicator",
  defaultProps: {
    width: 10,
    height: 10,
    borderRadius: 100000,
    backgroundColor: "$color",
  },
});
