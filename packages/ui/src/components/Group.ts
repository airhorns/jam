import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledProps } from "../styled";
import { injectRule } from "../css";
import { getRadiusSized } from "../variants";
import { ThemeableStack } from "./Stacks";

export type GroupOrientation = "horizontal" | "vertical";

export type GroupProps = StyledProps & {
  orientation?: GroupOrientation;
  size?: string | number;
  bordered?: boolean | number;
  /** Rendered between every pair of items. */
  separator?: VChild;
  /** Keep each item's own border radius instead of passing the group's. */
  disablePassBorderRadius?: boolean;
  unstyled?: boolean;
};

/**
 * The group's box: its `size` picks the radius token that the first and last
 * items inherit.
 */
export const GroupFrame = styled<GroupProps>(ThemeableStack, {
  name: "Group",
  variants: {
    unstyled: {
      false: {
        size: "$true",
        flexDirection: "row",
        alignItems: "stretch",
      },
    },

    orientation: {
      horizontal: { flexDirection: "row" },
      vertical: { flexDirection: "column" },
    },

    size: {
      "...size": getRadiusSized,
      ":number": getRadiusSized,
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** Wraps one child of a group so its position in the row/column is known. */
export const GroupItem = styled("div", {
  name: "GroupItem",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    boxSizing: "border-box",
    minWidth: 0,
  },
});

const HORIZONTAL = "_jui_grp_h";
const VERTICAL = "_jui_grp_v";
const PASS_RADIUS = "_jui_grp_r";
const BORDERED = "_jui_grp_b";

// The group's radius reaches the first/last item (and that item's child) with
// `border-radius: inherit`, so a plain CSS rule can pass a token-derived
// radius it cannot know the value of. Interior corners are squared off, and
// adjacent borders in a bordered group collapse into one line.
function injectGroupRules(): void {
  const edge = (marker: string, first: [string, string], last: [string, string]) => {
    const item = `.${PASS_RADIUS}.${marker} > .is_GroupItem`;
    injectRule(`jamagui-group-${marker}-reset`, `${item}, ${item} > * { border-radius: 0 }`);
    injectRule(
      `jamagui-group-${marker}-first`,
      `${item}:first-child, ${item}:first-child > * { border-${first[0]}-radius: inherit; border-${first[1]}-radius: inherit }`,
    );
    injectRule(
      `jamagui-group-${marker}-last`,
      `${item}:last-child, ${item}:last-child > * { border-${last[0]}-radius: inherit; border-${last[1]}-radius: inherit }`,
    );
  };
  edge(HORIZONTAL, ["top-left", "bottom-left"], ["top-right", "bottom-right"]);
  edge(VERTICAL, ["top-left", "top-right"], ["bottom-left", "bottom-right"]);

  for (const [marker, side] of [
    [HORIZONTAL, "left"],
    [VERTICAL, "top"],
  ] as const) {
    const inner = `.${BORDERED}.${marker} > .is_GroupItem:not(:first-child)`;
    injectRule(`jamagui-group-${marker}-collapse`, `${inner}, ${inner} > * { border-${side}-width: 0 }`);
  }
}

const toArray = (children: VChild | VChild[] | undefined): VChild[] =>
  children == null ? [] : Array.isArray(children) ? children : [children];

function createGroup(defaultOrientation: GroupOrientation) {
  function GroupComponent(props: GroupProps): VNode {
    injectGroupRules();
    const {
      children,
      separator,
      orientation = defaultOrientation,
      disablePassBorderRadius,
      class: className,
      ...frameProps
    } = props;

    const markers = [orientation === "vertical" ? VERTICAL : HORIZONTAL];
    if (!disablePassBorderRadius) markers.push(PASS_RADIUS);
    if (props.bordered) markers.push(BORDERED);

    const items = toArray(children).filter((child) => child != null && child !== false);
    const laidOut: VChild[] = [];
    for (const [index, item] of items.entries()) {
      if (index > 0 && separator != null) laidOut.push(separator);
      laidOut.push(item);
    }

    return h(
      GroupFrame,
      {
        ...(frameProps as Record<string, unknown>),
        orientation,
        class: [className, ...markers].filter(Boolean).join(" "),
      },
      ...laidOut,
    );
  }
  GroupComponent.displayName = defaultOrientation === "vertical" ? "YGroup" : "XGroup";
  return Object.assign(GroupComponent, { Item: GroupItem, Frame: GroupFrame });
}

/** Vertical group (tamagui's `Group`/`YGroup`). */
export const YGroup = createGroup("vertical");

/** Horizontal group: buttons and inputs joined into one segmented control. */
export const XGroup = createGroup("horizontal");

/**
 * Group: joins its items into one control, squaring off the interior corners
 * and collapsing adjacent borders. Wrap each child in `Group.Item`.
 */
export const Group = YGroup;
