import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * ListItem: row layout with icon, title, subtitle, and trailing content.
 */
export const ListItem = styled("div", {
  name: "ListItem",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "$background",
    cursor: "pointer",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
    pressStyle: {
      backgroundColor: "$backgroundPress",
    },
  },
  variants: {
    size: {
      "1": { paddingVertical: 6, paddingHorizontal: 8, gap: 6, fontSize: 12 },
      "2": { paddingVertical: 8, paddingHorizontal: 12, gap: 8, fontSize: 13 },
      "3": { paddingVertical: 12, paddingHorizontal: 16, gap: 12, fontSize: 14 },
      "4": { paddingVertical: 16, paddingHorizontal: 20, gap: 16, fontSize: 16 },
    },
  },
  defaultVariants: {
    size: "3",
  },
}) as ReturnType<typeof styled> & {
  Text: ReturnType<typeof styled>;
  Title: ReturnType<typeof styled>;
  Subtitle: ReturnType<typeof styled>;
  Icon: ReturnType<typeof styled>;
};

(ListItem as any).Text = styled("span", {
  name: "ListItemText",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    gap: 2,
  },
});

(ListItem as any).Title = styled("span", {
  name: "ListItemTitle",
  defaultProps: {
    color: "$color",
    fontWeight: "500",
  },
});

(ListItem as any).Subtitle = styled("span", {
  name: "ListItemSubtitle",
  defaultProps: {
    color: "$color",
    opacity: 0.6,
    fontSize: 12,
  },
});

(ListItem as any).Icon = styled("span", {
  name: "ListItemIcon",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});
