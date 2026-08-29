import { styled } from "../styled";

type GroupComponent = ReturnType<typeof styled> & { Item: ReturnType<typeof styled> };

/**
 * Group: groups child components together, typically with shared border radius.
 * Use with Button, Input, etc. to create connected component groups.
 */
export const Group = styled("div", {
  name: "Group",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
  },
  variants: {
    orientation: {
      horizontal: { flexDirection: "row" },
      vertical: { flexDirection: "column" },
    },
    size: {
      "1": { borderRadius: "$radius.1" },
      "2": { borderRadius: "$radius.2" },
      "3": { borderRadius: "$radius.3" },
      "4": { borderRadius: "$radius.4" },
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
}) as GroupComponent;

export const XGroup = styled("div", {
  name: "XGroup",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
  },
}) as GroupComponent;

export const YGroup = styled("div", {
  name: "YGroup",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
}) as GroupComponent;

const GroupItem = styled("div", {
  name: "GroupItem",
  defaultProps: {
    display: "flex",
  },
});

(Group as any).Item = GroupItem;
(XGroup as any).Item = GroupItem;
(YGroup as any).Item = GroupItem;
