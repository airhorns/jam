import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Select: dropdown selection control.
 *
 * Usage:
 *   <Select value={val} onValueChange={setVal}>
 *     <Select.Trigger>
 *       <Select.Value placeholder="Choose..." />
 *     </Select.Trigger>
 *     <Select.Content>
 *       <Select.Item value="a"><Select.ItemText>Option A</Select.ItemText></Select.Item>
 *       <Select.Item value="b"><Select.ItemText>Option B</Select.ItemText></Select.Item>
 *     </Select.Content>
 *   </Select>
 */
export function Select(props: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { value, onValueChange, disabled, children, ...rest } = props;
  return SelectFrame({
    ...rest,
    "data-value": value,
    "data-disabled": disabled ? "true" : undefined,
    children,
  });
}
Select.displayName = "Select";

const SelectFrame = styled("div", {
  name: "SelectFrame",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
});

Select.Trigger = styled("button", {
  name: "SelectTrigger",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    backgroundColor: "$background",
    color: "$color",
    cursor: "pointer",
    fontSize: 14,
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

Select.Value = styled("span", {
  name: "SelectValue",
  defaultProps: {
    color: "$color",
  },
});

Select.Content = styled("div", {
  name: "SelectContent",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    backgroundColor: "$background",
    overflow: "hidden",
    zIndex: 50,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
});

Select.Viewport = styled("div", {
  name: "SelectViewport",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
    maxHeight: 300,
  },
});

Select.Item = styled("div", {
  name: "SelectItem",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    cursor: "pointer",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

Select.ItemText = styled("span", {
  name: "SelectItemText",
  defaultProps: {
    color: "$color",
    fontSize: 14,
  },
});

Select.ItemIndicator = styled("span", {
  name: "SelectItemIndicator",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
  },
});

Select.Group = styled("div", {
  name: "SelectGroup",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
  },
});

Select.Label = styled("span", {
  name: "SelectLabel",
  defaultProps: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "$color",
    opacity: 0.6,
  },
});
