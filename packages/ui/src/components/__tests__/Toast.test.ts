// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, tick, pointerEnter, pointerLeave } from "../../testing";
import { Toast, toastController } from "../Toast";
import { Button } from "../Button";

beforeEach(() => {
  setupDefaultUI();
  toastController.hideAll();
});

function Example(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; duration?: number; type?: "foreground" | "background" }) {
  return h(
    Toast,
    { ...props, "data-testid": "toast" },
    h(Toast.Title, { "data-testid": "title" }, "Saved"),
    h(Toast.Description, { "data-testid": "description" }, "Your changes are safe."),
    h(Toast.Action, { altText: "Undo the save", "data-testid": "action" }, "Undo"),
    h(Toast.Close, { "data-testid": "close" }, "×"),
  );
}

describe("Toast", () => {
  it("renders an accessible status region pinned to the default corner", () => {
    const { get, query } = render(h(Example, { open: false }));
    expect(query("[data-testid=toast]")).toBeNull();
    const opened = render(h(Example, { defaultOpen: true, duration: Infinity }));
    const toast = opened.get("[data-testid=toast]");
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.getAttribute("aria-live")).toBe("polite");
    expect(toast.getAttribute("aria-labelledby")).toBe(opened.get("[data-testid=title]").id);
    expect(toast.tabIndex).toBe(0);
    expect(toast.dataset.state).toBe("open");
    const viewport = toast.parentElement!;
    expect(viewport.dataset.toastViewport).toBe("bottom-right");
    expect(css(viewport)).toMatchObject({ position: "fixed", bottom: "0px", right: "0px", "flex-direction": "column-reverse", "pointer-events": "none" });
    expect(opened.get("[data-testid=action]").getAttribute("aria-label")).toBe("Undo the save");
    void get;
  });

  it("is styled as an elevated card with an enter animation", () => {
    const { get } = render(h(Example, { defaultOpen: true, duration: Infinity }));
    const styles = css(get("[data-testid=toast]"));
    expect(styles).toMatchObject({
      "background-color": "var(--background)",
      "border-width": "1px",
      "border-color": "var(--borderColor)",
      "border-radius": "9px",
      "padding-left": "18px",
      "padding-right": "18px",
      "padding-top": "13px",
      "padding-bottom": "13px",
      "pointer-events": "auto",
    });
    expect(styles["box-shadow"]).toContain("var(--shadowColor)");
    expect(styles.animation).toMatch(/^enter_/);
    expect(css(get("[data-testid=title]"))).toMatchObject({ "font-weight": "600" });
    expect(css(get("[data-testid=description]"))).toMatchObject({ color: "var(--color11)" });
  });

  it("announces foreground toasts assertively", () => {
    const { get } = render(h(Example, { defaultOpen: true, duration: Infinity, type: "foreground" }));
    expect(get("[data-testid=toast]").getAttribute("aria-live")).toBe("assertive");
  });

  it("auto-dismisses after its duration, pausing while hovered", async () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { defaultOpen: true, duration: 40, onOpenChange }));
    const toast = get("[data-testid=toast]");
    pointerEnter(toast);
    await tick(60);
    expect(query("[data-testid=toast]")).not.toBeNull();
    pointerLeave(toast);
    await tick(60);
    expect(query("[data-testid=toast]")).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes from the Close part and never dismisses with an infinite duration", async () => {
    const { get, query } = render(h(Example, { defaultOpen: true, duration: Infinity }));
    await tick(20);
    expect(query("[data-testid=toast]")).not.toBeNull();
    click(get("[data-testid=close]"));
    expect(query("[data-testid=toast]")).toBeNull();
  });

  it("supports controlled state", () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { open: true, duration: Infinity, onOpenChange }));
    click(get("[data-testid=close]"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(query("[data-testid=toast]")).not.toBeNull();
  });

  it("stacks imperative toasts in the viewport and hides them on close, action or timeout", async () => {
    const onPress = vi.fn();
    const { container } = render(h(Toast.Viewport, { placement: "top-center", "data-testid": "viewport" }));
    const viewport = container.querySelector<HTMLElement>("[data-testid=viewport]")!;
    expect(viewport.getAttribute("role")).toBe("region");
    expect(viewport.getAttribute("aria-label")).toBe("Notifications");
    expect(css(viewport)).toMatchObject({ top: "0px", "align-items": "center" });

    const first = toastController.show("Saved", { message: "Your changes are safe.", duration: Infinity });
    toastController.show("Deleted", { action: { label: "Undo", onPress }, duration: Infinity, theme: "red" });
    toastController.show("Quick", { duration: 30 });
    const toasts = () => Array.from(viewport.querySelectorAll<HTMLElement>("[data-toast-id]"));
    expect(toasts().map((t) => t.dataset.toastId)).toEqual([first, "toast-" + (Number(first.split("-")[1]) + 1), "toast-" + (Number(first.split("-")[1]) + 2)]);
    expect(toasts()[0].textContent).toContain("Your changes are safe.");
    expect(toasts()[1].className).toContain("t_light_red");

    await tick(50);
    expect(toasts()).toHaveLength(2);

    click(toasts()[1].querySelector<HTMLElement>("[data-toast-action]")!);
    expect(onPress).toHaveBeenCalled();
    expect(toasts()).toHaveLength(1);

    click(toasts()[0].querySelector<HTMLElement>("[aria-label=Close]")!);
    expect(toasts()).toHaveLength(0);
  });

  it("lays declarative toasts out inside the viewport when rendered there", () => {
    const { get } = render(
      h(
        Toast.Provider,
        { placement: "top-left", duration: Infinity },
        h(Toast.Viewport, { "data-testid": "viewport" }, h(Toast, { defaultOpen: true, "data-testid": "toast" }, h(Toast.Title, null, "Inline"))),
      ),
    );
    const toast = get("[data-testid=toast]");
    expect(toast.parentElement).toBe(get("[data-testid=viewport]"));
    expect(get("[data-testid=viewport]").dataset.toastViewport).toBe("top-left");
    expect(css(toast).animation).toMatch(/^enter_/);
  });

  it("merges Action and Close onto children with asChild", () => {
    const onClick = vi.fn();
    const { get, query } = render(
      h(
        Toast,
        { defaultOpen: true, duration: Infinity },
        h(Toast.Action, { altText: "Undo", asChild: true }, h(Button, { "data-testid": "action", variant: "outlined" }, "Undo")),
        h(Toast.Close, { asChild: true, onClick }, h("a", { href: "#", "data-testid": "close" }, "Dismiss")),
      ),
    );
    expect(get("[data-testid=action]").getAttribute("aria-label")).toBe("Undo");
    expect(get("[data-testid=action]").className).toContain("is_Button");
    click(get("[data-testid=close]"));
    expect(onClick).toHaveBeenCalled();
    expect(query("[data-testid=action]")).toBeNull();
  });
});
