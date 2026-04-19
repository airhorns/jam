import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * ToggleGroup: group of toggle buttons, single or multi-select.
 *
 * Usage:
 *   <ToggleGroup type="single" value="a" onValueChange={setVal}>
 *     <ToggleGroup.Item value="a">A</ToggleGroup.Item>
 *     <ToggleGroup.Item value="b">B</ToggleGroup.Item>
 *   </ToggleGroup>
 */
export function ToggleGroup(props: {
  type?: "single" | "multiple";
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const {
    type = "single",
    orientation = "horizontal",
    disabled,
    children,
    ...rest
  } = props;

  return ToggleGroupFrame({
    ...rest,
    role: "group",
    "data-orientation": orientation,
    "data-disabled": disabled ? "true" : undefined,
    flexDirection: orientation === "horizontal" ? "row" : "column",
    children,
  });
}
ToggleGroup.displayName = "ToggleGroup";

const ToggleGroupFrame = styled("div", {
  name: "ToggleGroupFrame",
  defaultProps: {
    display: "flex",
    borderRadius: "$radius.3",
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
  },
});

/**
 * ToggleGroup.Item: individual toggle button.
 */
ToggleGroup.Item = styled("button", {
  name: "ToggleGroupItem",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "$background",
    color: "$color",
    cursor: "pointer",
    borderWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    userSelect: "none",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
    pressStyle: {
      backgroundColor: "$backgroundPress",
    },
  },
});
