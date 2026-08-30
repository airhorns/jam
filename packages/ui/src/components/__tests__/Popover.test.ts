// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, keydown, tick, pointerEnter, pointerLeave } from "../../testing";
import { Popover } from "../Popover";
import { Button } from "../Button";
import type { Placement } from "../../floating";

beforeEach(() => {
  setupDefaultUI();
});

function rect(el: Element, x: number, y: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON() {} }) as DOMRect;
}

function Example(props: { placement?: Placement; open?: boolean; onOpenChange?: (open: boolean) => void; arrow?: boolean }) {
  return h(
    Popover,
    { placement: props.placement, open: props.open, onOpenChange: props.onOpenChange },
    h(Popover.Trigger, { "data-testid": "trigger" }, "Open"),
    h(
      Popover.Content,
      { "data-testid": "content" },
      props.arrow ? h(Popover.Arrow, { "data-testid": "arrow" }) : null,
      h("input", { "data-testid": "field" }),
      h(Popover.Close, { "data-testid": "close" }, "Close"),
    ),
  );
}

describe("Popover", () => {
  it("toggles from the trigger with aria wiring", () => {
    const { get, query } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(query("[data-testid=content]")).toBeNull();
    click(trigger);
    const content = get("[data-testid=content]");
    expect(content.getAttribute("role")).toBe("dialog");
    expect(content.id).toBe(trigger.getAttribute("aria-controls"));
    expect(content.dataset.layer).toBe(trigger.dataset.layerTrigger);
    click(trigger);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("positions the content below the trigger once measured", async () => {
    const { get } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    rect(trigger, 100, 50, 80, 30);
    click(trigger);
    const content = get("[data-testid=content]");
    rect(content, 0, 0, 200, 100);
    expect(content.style.visibility).toBe("hidden");
    await tick();
    expect(content.style.position).toBe("fixed");
    expect(content.style.top).toBe("88px");
    expect(content.style.left).toBe("40px");
    expect(content.dataset.placement).toBe("bottom");
  });

  it("honours placement and flips when there is no room", async () => {
    const { get } = render(h(Example, { placement: "top" }));
    const trigger = get("[data-testid=trigger]");
    rect(trigger, 100, 20, 80, 30);
    click(trigger);
    rect(get("[data-testid=content]"), 0, 0, 200, 100);
    await tick();
    expect(get("[data-testid=content]").dataset.placement).toBe("bottom");
  });

  it("is styled as an elevated, bordered panel with size padding", () => {
    const { get } = render(h(Example, {}));
    click(get("[data-testid=trigger]"));
    const styles = css(get("[data-testid=content]"));
    expect(styles).toMatchObject({
      "background-color": "var(--background)",
      "border-width": "1px",
      "border-color": "var(--borderColor)",
      padding: "18px",
      "border-radius": "9px",
    });
    expect(styles["box-shadow"]).toContain("var(--shadowColor)");
    expect(styles.animation).toMatch(/^enter_/);
  });

  it("renders an arrow on the edge facing the trigger", async () => {
    const { get } = render(h(Example, { arrow: true }));
    const trigger = get("[data-testid=trigger]");
    rect(trigger, 100, 50, 80, 30);
    click(trigger);
    rect(get("[data-testid=content]"), 0, 0, 200, 100);
    await tick();
    const arrow = get("[data-testid=arrow]");
    const outer = arrow.parentElement!;
    expect(outer.dataset.placement).toBe("bottom");
    expect(outer.style.top).toBe("-7px");
    expect(outer.style.left).toBe(`${100 - 8}px`);
    expect(outer.style.overflow).toBe("hidden");
    expect(arrow.style.transform).toBe("rotate(45deg)");
    expect(css(arrow)).toMatchObject({ "background-color": "var(--background)", "border-color": "var(--borderColor)" });
  });

  it("closes on Escape, outside press and Close, restoring focus", async () => {
    const { get, query } = render(h(Example, {}));
    const trigger = get("[data-testid=trigger]");
    trigger.focus();
    click(trigger);
    await tick();
    expect(document.activeElement).toBe(get("[data-testid=field]"));
    expect(document.body.style.overflow).toBe("");
    keydown(document.body, "Escape");
    await tick();
    expect(query("[data-testid=content]")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    click(trigger);
    click(document.body);
    expect(query("[data-testid=content]")).toBeNull();

    click(trigger);
    click(get("[data-testid=close]"));
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("opens on hover when hoverable, without moving focus, and closes after leaving", async () => {
    vi.useFakeTimers();
    try {
      const { get, query } = render(
        h(
          Popover,
          { hoverable: true },
          h(Popover.Trigger, { "data-testid": "trigger" }, "Open"),
          h(Popover.Content, { "data-testid": "content" }, h("input", { "data-testid": "field" })),
        ),
      );
      const trigger = get("[data-testid=trigger]");
      trigger.focus();
      pointerEnter(trigger);
      await vi.advanceTimersByTimeAsync(0);
      const content = get("[data-testid=content]");
      expect(document.activeElement).toBe(trigger);

      pointerLeave(trigger);
      vi.advanceTimersByTime(100);
      pointerEnter(content);
      vi.advanceTimersByTime(300);
      expect(query("[data-testid=content]")).not.toBeNull();

      click(trigger);
      expect(query("[data-testid=content]")).not.toBeNull();

      pointerLeave(content);
      vi.advanceTimersByTime(200);
      expect(query("[data-testid=content]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports controlled state", () => {
    const onOpenChange = vi.fn();
    const { get, query } = render(h(Example, { open: false, onOpenChange }));
    click(get("[data-testid=trigger]"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("positions against an explicit Anchor and merges triggers with asChild", async () => {
    const { get } = render(
      h(
        Popover,
        null,
        h(Popover.Anchor, { "data-testid": "anchor" }, h(Popover.Trigger, { asChild: true }, h(Button, { "data-testid": "trigger" }, "Open"))),
        h(Popover.Content, { "data-testid": "content", size: "$2" }, "hi"),
      ),
    );
    const anchor = get("[data-testid=anchor]");
    const trigger = get("[data-testid=trigger]");
    expect(anchor.dataset.layerAnchor).toBe(trigger.dataset.layerTrigger);
    rect(anchor, 0, 100, 400, 40);
    rect(trigger, 0, 100, 50, 40);
    click(trigger);
    const content = get("[data-testid=content]");
    rect(content, 0, 0, 100, 50);
    await tick();
    expect(content.style.left).toBe("150px");
    expect(css(content)).toMatchObject({ padding: "7px", "border-radius": "5px" });
  });
});
