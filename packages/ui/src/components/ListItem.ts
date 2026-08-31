import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps, VariantFunction } from "../styled";
import { getFontSized, steppedSpace, stepToken, tokenValue } from "../variants";
import { SizableText, wrapChildrenInText } from "./Text";
import type { TextParentProps } from "./Text";
import { ThemeableStack, YStack } from "./Stacks";

export type ListItemVariant = "outlined";

/** Shares size/colour between the frame and every text part. */
export const ListItemContext = createStyledContext<{
  size?: string | number;
  variant?: ListItemVariant;
  color?: unknown;
}>({
  size: undefined,
  variant: undefined,
  color: undefined,
});

const listItemSized: VariantFunction = (value, { tokens }) => {
  if (typeof value === "number") {
    return { minHeight: value, paddingHorizontal: value * 0.25, paddingVertical: value * 0.1 };
  }
  return {
    minHeight: tokenValue(tokens, "size", value) ?? tokens.size?.true,
    paddingHorizontal: tokenValue(tokens, "space", value) ?? tokens.space?.true,
    paddingVertical: steppedSpace(tokens, value, -4),
  };
};

/**
 * ListItem.Frame: the row itself, announced as a list item. Keep the rows
 * inside a container with `role="list"` (or pass `tag="li"` and use a real
 * `ul`, zeroing its browser padding).
 */
export type ListItemFrameProps = StyledProps & {
  size?: string | number;
  variant?: ListItemVariant;
  active?: boolean;
  disabled?: boolean;
  hoverTheme?: boolean;
  pressTheme?: boolean;
  unstyled?: boolean;
};

export const ListItemFrame = styled<ListItemFrameProps>(ThemeableStack, {
  name: "ListItem",
  context: ListItemContext,
  defaultProps: {
    // A `tag="button"` row must not keep the browser's outset border or centred text.
    borderWidth: 0,
    borderStyle: "solid",
    textAlign: "start",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "nowrap",
        listStyle: "none",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        backgroundColor: "$background",
        borderColor: "$borderColor",
        color: "$color",
        textDecorationLine: "none",
        cursor: "default",
        hoverStyle: {
          backgroundColor: "$backgroundHover",
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
          outlineOffset: -2,
        },
      },
    },

    variant: {
      outlined: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$borderColor",
        hoverStyle: { backgroundColor: "transparent", borderColor: "$borderColorHover" },
        pressStyle: { backgroundColor: "transparent", borderColor: "$borderColorPress" },
      },
    },

    size: {
      "...size": listItemSized,
      ":number": listItemSized,
    },

    active: {
      true: {
        backgroundColor: "$backgroundPress",
        hoverStyle: { backgroundColor: "$backgroundPress" },
      },
    },

    disabled: {
      true: {
        opacity: 0.5,
        pointerEvents: "none",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

/** ListItem.Text: the label column's text style. */
export const ListItemText = styled(SizableText, {
  name: "ListItemText",
  context: ListItemContext,
  variants: {
    unstyled: {
      false: {
        size: "$true",
        color: "$color",
        flexGrow: 1,
        flexShrink: 1,
        ellipsis: true,
        cursor: "inherit",
      },
    },
  },
});

/** ListItem.Title: the primary line. */
export const ListItemTitle = styled(ListItemText, {
  name: "ListItemTitle",
  context: ListItemContext,
});

const subtitleSized: VariantFunction = (value, extras) => {
  if (typeof value === "number") return getFontSized(Math.round(value * 0.85), extras);
  return getFontSized(stepToken(extras.tokens, "size", value, -1, { excludeHalfSteps: true }), extras);
};

/** ListItem.Subtitle: a dimmer, one-step-smaller second line. */
export const ListItemSubtitle = styled(ListItemText, {
  name: "ListItemSubtitle",
  context: ListItemContext,
  variants: {
    unstyled: {
      false: {
        opacity: 0.6,
        maxWidth: "100%",
      },
    },

    size: {
      "...size": subtitleSized,
      ":number": subtitleSized,
    },
  },
});

const iconSized: VariantFunction = (value, extras) => {
  const fontSize = typeof value === "number" ? Math.round(value * 0.4) : (getFontSized(value, extras) as { fontSize?: number }).fontSize;
  return fontSize === undefined ? null : { fontSize };
};

/** ListItem.Icon: a leading or trailing glyph, sized from the row's font size. */
export const ListItemIcon = styled<StyledProps & { size?: string | number; placement?: "before" | "after" }>("span", {
  name: "ListItemIcon",
  context: ListItemContext,
  defaultProps: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    lineHeight: 1,
    color: "$color",
  },
  variants: {
    size: {
      "...size": iconSized,
      ":number": iconSized,
    },
    placement: {
      before: { marginRight: "$2" },
      after: { marginLeft: "$2" },
    },
  },
  defaultVariants: {
    size: "$true",
  },
});

export type ListItemProps = StyledProps &
  TextParentProps & {
    size?: string | number;
    variant?: ListItemVariant;
    title?: VChild;
    subTitle?: VChild;
    icon?: VChild;
    iconAfter?: VChild;
    active?: boolean;
    disabled?: boolean;
    hoverTheme?: boolean;
    pressTheme?: boolean;
    unstyled?: boolean;
  };

/**
 * ListItem: a row with an optional leading icon, a title/subtitle column and
 * an optional trailing icon. String children are wrapped in `ListItem.Text`.
 */
function ListItemComponent(props: ListItemProps): VNode {
  const { children, title, subTitle, icon, iconAfter, noTextWrap, textProps, ...frameProps } = props;
  const size = props.size ?? (props.unstyled === true ? undefined : "$true");

  const parts: VChild[] = [];
  if (icon != null) parts.push(h(ListItemIcon, { size, placement: "before" }, icon));

  const wrapped = wrapChildrenInText(ListItemText, children, { noTextWrap, textProps, ...props }, { size });
  if (title != null || subTitle != null) {
    const column: VChild[] = [];
    if (title != null) {
      column.push(typeof title === "string" ? h(ListItemTitle, { size }, title) : title);
    }
    if (subTitle != null) {
      column.push(typeof subTitle === "string" ? h(ListItemSubtitle, { size }, subTitle) : subTitle);
    }
    column.push(...wrapped);
    parts.push(h(YStack, { flexGrow: 1, flexShrink: 1, minWidth: 0 }, ...column));
  } else {
    parts.push(...wrapped);
  }

  if (iconAfter != null) parts.push(h(ListItemIcon, { size, placement: "after" }, iconAfter));

  return h(ListItemFrameComponent, frameProps as Record<string, unknown>, ...parts);
}
ListItemComponent.displayName = "ListItem";

/** Announced as a list item unless the row is itself a button or link, which keeps its native role and gets a pointer cursor. */
function ListItemFrameComponent(props: ListItemFrameProps): VNode {
  const interactive = props.tag === "button" || props.tag === "a";
  return h(ListItemFrame, { role: interactive ? undefined : "listitem", cursor: interactive ? "pointer" : undefined, ...props });
}
ListItemFrameComponent.displayName = "ListItemFrame";

export const ListItem = Object.assign(ListItemComponent, {
  Frame: ListItemFrameComponent,
  Text: ListItemText,
  Title: ListItemTitle,
  Subtitle: ListItemSubtitle,
  Icon: ListItemIcon,
  /** Provide size/colour defaults to every ListItem part beneath. */
  Apply: ListItemContext.Provider,
});
