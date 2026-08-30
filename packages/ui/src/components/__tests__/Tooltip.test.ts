// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, keydown, tick, pointerEnter, pointerLeave, focus, blur } from "../../testing";
import { Tooltip } from "../Tooltip";
import { Button } from "../Button";
import type { Placement } from "../../floating";

beforeEach(() => {
  setupDefaultUI();
});

function rect(el: Element, x: number, y: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON() {} }) as DOMRect;
}

function Example(props: { placement?: Placement; delay?: number; open?: boolean; onOpenChange?: (open: boolean) => void; arrow?: boolean }) {
  return h(
    Tooltip,
    { placement: props.placement, delay: props.delay ?? 0, open: props.open, onOpenChange: props.onOpenChange },
    h(Tooltip.Trigger, { "data-testid": "trigger" }, "Hover me"),
    h(Tooltip.Content, { "data-testid": "content" }, props.arrow ? h(Tooltip.Arrow, { "data-testid": "arrow" }) : null, "Helpful hint"),
  );
}

describe("Tooltip", () => {
  it("opens on hover after the delay and closes on leave", async () => {
    const { get, query } = render(h(Example, { delay: 50 }));
    const trigger = get("[data-testid=trigger]");
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.dataset.state).toBe("closed");
    pointerEnter(trigger);
    expect(query("[data-testid=content]")).toBeNull();
    await tick(80);
    const content = get("[data-testid=content]");
    expect(content.getAttribute("role")).toBe("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(content.id);
    expect(trigger.dataset.state).toBe("open");
    pointerLeave(trigger);
    expect(query("[data-testid=content]")).toBeNull();
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });

  it("cancels a pending open when the pointer leaves early", async () => {
    const { get, query } = render(h(Example, { delay: 50 }));
    const trigger = get("[data-testid=trigger]");
    pointerEnter(trigger);
    pointerLeave(trigger);
    await tick(80);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("drops a pending open when the tooltip unmounts", async () => {
    const onOpenChange = vi.fn();
    const { get, unmount } = render(h(Example, { delay: 50, onOpenChange }));
    pointerEnter(get("[data-testid=trigger]"));
    unmount();
    await tick(80);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector("[data-testid=content]")).toBeNull();
  });

  it("opens immediately on focus and closes on blur, Escape or press", async () => {
    const { get, query } = render(h(Example, { delay: 500 }));
    const trigger = get("[data-testid=trigger]");
    focus(trigger);
    expect(query("[data-testid=content]")).not.toBeNull();
    blur(trigger);
    expect(query("[data-testid=content]")).toBeNull();

    focus(trigger);
    keydown(document.body, "Escape");
    expect(query("[data-testid=content]")).toBeNull();

    focus(trigger);
    click(trigger);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("wraps text in TooltipText and styles the content as an accent chip", () => {
    const { get } = render(h(Example, {}));
    focus(get("[data-testid=trigger]"));
    const content = get("[data-testid=content]");
    const text = content.querySelector("span")!;
    expect(text.textContent).toBe("Helpful hint");
    expect(css(text)).toMatchObject({ "font-size": "13px", "text-align": "center" });
    expect(css(content)).toMatchObject({
      "background-color": "var(--background)",
      "border-width": "0px",
      "padding-left": "13px",
      "padding-right": "13px",
      "padding-top": "7px",
      "padding-bottom": "7px",
      "border-radius": "7px",
      "pointer-events": "none",
    });
    expect(content.className).toContain("t_light_Tooltip");
  });

  it("floats above the trigger by default with an arrow pointing down", async () => {
    const { get } = render(h(Example, { arrow: true }));
    const trigger = get("[data-testid=trigger]");
    rect(trigger, 100, 200, 80, 30);
    focus(trigger);
    const content = get("[data-testid=content]");
    rect(content, 0, 0, 120, 30);
    await tick();
    expect(content.dataset.placement).toBe("top");
    expect(content.style.top).toBe(`${200 - 30 - 6}px`);
    expect(content.style.left).toBe("80px");
    const outer = get("[data-testid=arrow]").parentElement!;
    expect(outer.dataset.placement).toBe("top");
    expect(outer.style.bottom).toBe("-7px");
    expect(css(get("[data-testid=arrow]"))["border-width"]).toBe("0px");
  });

  it("supports controlled state", () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { open: true, onOpenChange }));
    expect(query("[data-testid=content]")).not.toBeNull();
    pointerLeave(get("[data-testid=trigger]"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("merges onto its child with asChild", async () => {
    const { get, query } = render(
      h(
        Tooltip,
        { delay: 0 },
        h(Tooltip.Trigger, { asChild: true }, h(Button, { "data-testid": "trigger", size: "$2" }, "Save")),
        h(Tooltip.Content, { "data-testid": "content" }, "Save your work"),
      ),
    );
    const trigger = get("[data-testid=trigger]");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.className).toContain("is_Button");
    expect(trigger.dataset.layerTrigger).toBeDefined();
    pointerEnter(trigger);
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("skips the hover delay when reopening within skipDelayDuration of closing", async () => {
    vi.useFakeTimers();
    try {
      const { get, query } = render(h(Example, { delay: 100 }));
      const trigger = get("[data-testid=trigger]");
      pointerEnter(trigger);
      await vi.advanceTimersByTimeAsync(100);
      expect(query("[data-testid=content]")).not.toBeNull();
      pointerLeave(trigger);
      pointerEnter(trigger);
      expect(query("[data-testid=content]")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a pointerdown-caused focus does not reopen the tooltip it just closed", () => {
    const { get, query } = render(h(Example, { delay: 0 }));
    const trigger = get("[data-testid=trigger]");
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    focus(trigger);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("a touch pointerenter does not open the tooltip", async () => {
    const { get, query } = render(h(Example, { delay: 0 }));
    const trigger = get("[data-testid=trigger]");
    trigger.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false, pointerType: "touch" }));
    await tick();
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("preserves a caller-supplied aria-describedby and appends the content id while open", () => {
    const { get } = render(
      h(
        Tooltip,
        { delay: 0 },
        h(Tooltip.Trigger, { "data-testid": "trigger", "aria-describedby": "existing" }, "Trigger"),
        h(Tooltip.Content, { "data-testid": "content" }, "Tip"),
      ),
    );
    const trigger = get("[data-testid=trigger]");
    focus(trigger);
    const content = get("[data-testid=content]");
    expect(trigger.getAttribute("aria-describedby")).toBe(`existing ${content.id}`);
    blur(trigger);
    expect(trigger.getAttribute("aria-describedby")).toBe("existing");
  });

  it("opening a second tooltip closes an already-open first tooltip", () => {
    const { get, query } = render(
      h(
        "div",
        null,
        h(Tooltip, { delay: 0 }, h(Tooltip.Trigger, { "data-testid": "triggerA" }, "A"), h(Tooltip.Content, { "data-testid": "contentA" }, "Tip A")),
        h(Tooltip, { delay: 0 }, h(Tooltip.Trigger, { "data-testid": "triggerB" }, "B"), h(Tooltip.Content, { "data-testid": "contentB" }, "Tip B")),
      ),
    );
    pointerEnter(get("[data-testid=triggerA]"));
    expect(query("[data-testid=contentA]")).not.toBeNull();
    pointerEnter(get("[data-testid=triggerB]"));
    expect(query("[data-testid=contentA]")).toBeNull();
    expect(query("[data-testid=contentB]")).not.toBeNull();
  });
});
