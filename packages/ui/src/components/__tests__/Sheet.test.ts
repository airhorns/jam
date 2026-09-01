// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, keydown, tick, injectedRules } from "../../testing";
import { Sheet } from "../Sheet";
import { Button } from "../Button";
import { renderError } from "./helpers";

beforeEach(() => {
  setupDefaultUI();
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
});

function Example(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; snapPoints?: number[]; onPositionChange?: (p: number) => void; dismissOnSnapToBottom?: boolean; modal?: boolean }) {
  return h(
    Sheet,
    { ...props, "data-testid": "sheet" },
    h(Sheet.Overlay, { "data-testid": "overlay" }),
    h(Sheet.Handle, { "data-testid": "handle" }),
    h(Sheet.Frame, { "data-testid": "frame", padding: "$4" }, h(Button, { "data-testid": "inner" }, "Inside")),
  );
}

function pointer(type: string, target: EventTarget, clientY: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 }) as unknown as PointerEvent);
}

function drag(handle: Element, from: number, to: number) {
  pointer("pointerdown", handle, from);
  pointer("pointermove", document, (from + to) / 2);
  pointer("pointermove", document, to);
  pointer("pointerup", document, to);
}

describe("Sheet", () => {
  it("renders nothing while closed and a portalled dialog while open", () => {
    const closed = render(h(Example, { open: false }));
    expect(closed.query("[data-testid=sheet]")).toBeNull();
    const { get, container } = render(h(Example, { defaultOpen: true }));
    const sheet = get("[data-testid=sheet]");
    expect(sheet.parentElement!.parentElement).toBe(container);
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.dataset.state).toBe("open");
    expect(sheet.dataset.layer).toBeDefined();
    const portal = sheet.parentElement!;
    expect(portal.contains(get("[data-testid=overlay]"))).toBe(true);
    expect(portal.firstElementChild).toBe(get("[data-testid=overlay]"));
    expect(sheet.contains(get("[data-testid=handle]"))).toBe(true);
    expect(sheet.contains(get("[data-testid=frame]"))).toBe(true);
  });

  it("sizes the sheet to the current snap point", () => {
    const { get } = render(h(Example, { defaultOpen: true, snapPoints: [85, 50] }));
    const sheet = get("[data-testid=sheet]");
    expect(sheet.style.height).toBe("85%");
    expect(sheet.dataset.position).toBe("0");
    expect(css(sheet)).toMatchObject({ position: "absolute", bottom: "0px", left: "0px", right: "0px", "pointer-events": "auto" });
    expect(css(sheet).animation).toMatch(/^enter_/);
    expect(injectedRules().some((rule) => rule.includes("@keyframes enter_") && rule.includes("translateY(100%)"))).toBe(true);
  });

  it("styles the overlay, frame and handle", () => {
    const { get } = render(h(Example, { defaultOpen: true }));
    expect(css(get("[data-testid=overlay]"))).toMatchObject({ position: "absolute", top: "0px", bottom: "0px", "background-color": "var(--shadow6)" });
    const frame = css(get("[data-testid=frame]"));
    expect(frame).toMatchObject({
      "background-color": "var(--background)",
      "border-top-left-radius": "16px",
      "border-top-right-radius": "16px",
      padding: "18px",
      "flex-grow": "1",
    });
    expect(frame["box-shadow"]).toContain("var(--shadowColor)");
    expect(css(get("[data-testid=handle]"))).toMatchObject({ height: "8px", width: "30%", "border-radius": "100px", cursor: "grab", "touch-action": "none" });
  });

  it("traps focus, locks scroll and dismisses on Escape", async () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { defaultOpen: true, onOpenChange }));
    await tick();
    expect(document.activeElement).toBe(get("[data-testid=inner]"));
    expect(document.body.style.overflow).toBe("hidden");
    keydown(document.body, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(query("[data-testid=sheet]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("dismisses on overlay press but not on presses inside", () => {
    const { get, query } = render(h(Example, { defaultOpen: true }));
    click(get("[data-testid=frame]"));
    expect(query("[data-testid=sheet]")).not.toBeNull();
    click(get("[data-testid=overlay]"));
    expect(query("[data-testid=sheet]")).toBeNull();
  });

  it("does not lock scroll when non-modal", () => {
    const { get } = render(h(Example, { defaultOpen: true, modal: false }));
    expect(get("[data-testid=sheet]").hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("follows the handle while dragging and snaps to the nearest point on release", () => {
    const onPositionChange = vi.fn();
    const { get } = render(h(Example, { defaultOpen: true, snapPoints: [80, 40], onPositionChange }));
    const handle = get("[data-testid=handle]");
    pointer("pointerdown", handle, 200);
    pointer("pointermove", document, 350);
    let sheet = get("[data-testid=sheet]");
    expect(sheet.style.transform).toBe("translateY(150px)");
    expect(sheet.style.transition).toBe("none");
    pointer("pointerup", document, 550);
    sheet = get("[data-testid=sheet]");
    expect(sheet.style.transform).toBe("");
    expect(onPositionChange).toHaveBeenCalledWith(1);
    expect(sheet.style.height).toBe("40%");
    expect(sheet.dataset.position).toBe("1");
  });

  it("closes when dragged below the smallest snap point", () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { defaultOpen: true, snapPoints: [80, 40], onOpenChange }));
    drag(get("[data-testid=handle]"), 200, 900);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(query("[data-testid=sheet]")).toBeNull();
  });

  it("stays at the smallest snap point when dismissOnSnapToBottom is off", () => {
    const { get } = render(h(Example, { defaultOpen: true, snapPoints: [80, 40], dismissOnSnapToBottom: false }));
    drag(get("[data-testid=handle]"), 200, 900);
    const sheet = get("[data-testid=sheet]");
    expect(sheet.style.height).toBe("40%");
  });

  it("drags up to a taller snap point but never past the tallest", () => {
    const { get } = render(h(Example, { defaultOpen: true, snapPoints: [80, 40], defaultPosition: 1 } as never));
    expect(get("[data-testid=sheet]").style.height).toBe("40%");
    const handle = get("[data-testid=handle]");
    pointer("pointerdown", handle, 600);
    pointer("pointermove", document, 0);
    expect(get("[data-testid=sheet]").style.transform).toBe("translateY(-400px)");
    pointer("pointerup", document, 300);
    expect(get("[data-testid=sheet]").style.height).toBe("80%");
  });

  it("supports a controlled position", () => {
    const onPositionChange = vi.fn();
    const { get } = render(h(Sheet, { defaultOpen: true, snapPoints: [80, 40], position: 1, onPositionChange, "data-testid": "sheet" }, h(Sheet.Handle, { "data-testid": "handle" }), h(Sheet.Frame, null)));
    expect(get("[data-testid=sheet]").style.height).toBe("40%");
    drag(get("[data-testid=handle]"), 600, 100);
    expect(onPositionChange).toHaveBeenCalledWith(0);
    expect(get("[data-testid=sheet]").style.height).toBe("40%");
  });

  it("reports parts rendered outside a Sheet", () => {
    expect(renderError(h(Sheet.Handle, null))).toMatch(/Sheet.Handle must be rendered inside <Sheet>/);
  });

  it("keeps a caller's inline style and runs a caller onPointerDown before starting a drag", () => {
    const onPointerDown = vi.fn();
    const onPositionChange = vi.fn();
    const { get } = render(
      h(
        Sheet,
        { defaultOpen: true, snapPoints: [80, 40], onPositionChange, style: { zIndex: 7 }, "data-testid": "sheet" },
        h(Sheet.Handle, { "data-testid": "handle", onPointerDown }),
        h(Sheet.Frame, null),
      ),
    );
    const sheet = get("[data-testid=sheet]");
    expect(sheet.style.height).toBe("80%");
    expect(sheet.style.zIndex).toBe("7");
    drag(get("[data-testid=handle]"), 200, 600);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenCalledWith(1);
  });
});
