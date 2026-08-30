// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI } from "../../testing";
import { ListItem } from "../ListItem";
import { YStack } from "../Stacks";

beforeEach(() => {
  setupDefaultUI();
});

describe("ListItem", () => {
  it("renders a themed list row", () => {
    const r = render(h(YStack, { role: "list" }, h(ListItem, { title: "Star" })));
    const row = r.get(".is_ListItem");
    expect(row.getAttribute("role")).toBe("listitem");
    expect(css(row)).toMatchObject({
      "flex-direction": "row",
      "align-items": "center",
      "min-height": "44px",
      "padding-left": "18px",
      "padding-top": "7px",
      "background-color": "var(--background)",
      "list-style": "none",
    });
  });

  it("sizes the row and its text together", () => {
    const r = render(h(ListItem, { size: "$2", title: "Star", subTitle: "Favourite" }));
    expect(css(r.root)).toMatchObject({ "min-height": "28px", "padding-left": "7px" });
    expect(css(r.get(".is_ListItemTitle"))["font-size"]).toBe("13px");
  });

  it("puts the title above a dimmed, smaller subtitle", () => {
    const r = render(h(ListItem, { title: "Star", subTitle: "Add to favourites" }));
    const title = r.get(".is_ListItemTitle");
    const subtitle = r.get(".is_ListItemSubtitle");
    expect(title.textContent).toBe("Star");
    expect(subtitle.textContent).toBe("Add to favourites");
    expect(css(title)["font-size"]).toBe("15px");
    expect(css(subtitle)).toMatchObject({ "font-size": "14px", opacity: "0.6" });
    expect(title.parentElement).toBe(subtitle.parentElement);
  });

  it("renders icons before and after with token spacing", () => {
    const r = render(h(ListItem, { icon: "*", iconAfter: ">", title: "Star" }));
    const icons = r.all(".is_ListItemIcon");
    expect(icons.map((i) => i.textContent)).toEqual(["*", ">"]);
    expect(css(icons[0])).toMatchObject({ "font-size": "15px", "margin-right": "7px" });
    expect(css(icons[1])["margin-left"]).toBe("7px");
    expect(r.root.firstElementChild).toBe(icons[0]);
    expect(r.root.lastElementChild).toBe(icons[1]);
  });

  it("wraps string children in ListItem.Text", () => {
    const r = render(h(ListItem, null, "Inbox"));
    const text = r.get(".is_ListItemText");
    expect(text.textContent).toBe("Inbox");
    expect(css(text)).toMatchObject({ "flex-grow": "1", "text-overflow": "ellipsis", color: "var(--color)" });
  });

  it("hover and press follow the theme", () => {
    const r = render(h(ListItem, { title: "Star" }));
    expect(css(r.root, ":hover")).toMatchObject({ "background-color": "var(--backgroundHover)", "border-color": "var(--borderColorHover)" });
    expect(css(r.root, ":active")["background-color"]).toBe("var(--backgroundPress)");
  });

  it("active and disabled states", () => {
    expect(css(render(h(ListItem, { active: true })).root)["background-color"]).toBe("var(--backgroundPress)");
    const disabled = render(h(ListItem, { disabled: true }));
    expect(css(disabled.root)).toMatchObject({ opacity: "0.5", "pointer-events": "none" });
  });

  it("the outlined variant draws a border instead of a fill", () => {
    const r = render(h(ListItem, { variant: "outlined" }));
    expect(css(r.root)).toMatchObject({ "background-color": "transparent", "border-width": "1px" });
  });

  it("parts can be composed by hand", () => {
    const r = render(
      h(
        ListItem.Frame,
        { size: "$5" },
        h(ListItem.Icon, null, "@"),
        h(YStack, null, h(ListItem.Title, null, "Inbox"), h(ListItem.Subtitle, null, "12 unread")),
      ),
    );
    expect(css(r.root)["min-height"]).toBe("52px");
    expect(css(r.get(".is_ListItemTitle"))["font-size"]).toBe("16px");
    expect(css(r.get(".is_ListItemIcon"))["font-size"]).toBe("16px");
  });

  it("unstyled drops the row chrome", () => {
    const r = render(h(ListItem, { unstyled: true, title: "Star" }));
    expect(css(r.root)["min-height"]).toBeUndefined();
    expect(css(r.root)["background-color"]).toBeUndefined();
  });
});
