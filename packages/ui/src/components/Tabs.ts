import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Tabs: tabbed interface.
 *
 * Usage:
 *   <Tabs value="tab1" onValueChange={setTab}>
 *     <Tabs.List>
 *       <Tabs.Tab value="tab1">Tab 1</Tabs.Tab>
 *       <Tabs.Tab value="tab2">Tab 2</Tabs.Tab>
 *     </Tabs.List>
 *     <Tabs.Content value="tab1">Content 1</Tabs.Content>
 *     <Tabs.Content value="tab2">Content 2</Tabs.Content>
 *   </Tabs>
 */
export function Tabs(props: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { value, orientation = "horizontal", children, ...rest } = props;

  return TabsFrame({
    ...rest,
    "data-orientation": orientation,
    "data-value": value,
    children,
  });
}
Tabs.displayName = "Tabs";

const TabsFrame = styled("div", {
  name: "TabsFrame",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
  },
});

Tabs.List = styled("div", {
  name: "TabsList",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
    gap: 0,
    borderBottomWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
  },
});

Tabs.Tab = styled("button", {
  name: "TabsTab",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "transparent",
    color: "$color",
    borderWidth: 0,
    borderBottomWidth: 2,
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: "500",
    userSelect: "none",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

Tabs.Content = styled("div", {
  name: "TabsContent",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    padding: 16,
  },
});
