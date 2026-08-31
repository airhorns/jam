// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, setupDefaultUI, click, keydown, tick, pointerEnter, pointerLeave } from "../../testing";
import { Popover } from "../Popover";
import { Button } from "../Button";
import type { Placement } from "../../floating";
import { renderError } from "./helpers";

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

  it("closes when focus moves outside, but not when it moves within", async () => {
    const { get, query } = render(h("div", null, h(Example, {}), h("button", { "data-testid": "outside" }, "Elsewhere")));
    const trigger = get("[data-testid=trigger]");
    click(trigger);
    await tick();
    get("[data-testid=close]").focus();
    expect(query("[data-testid=content]")).not.toBeNull();
    get("[data-testid=outside]").focus();
    expect(query("[data-testid=content]")).toBeNull();
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

  it("reports parts rendered outside a Popover", () => {
    expect(renderError(h(Popover.Content, null, "Lost"))).toMatch(/Popover.Content must be rendered inside <Popover>/);
  });

  it("opens to the left or right of the trigger and keeps a caller's inline style", async () => {
    for (const placement of ["right", "left"] as const) {
      const { get } = render(
        h(
          Popover,
          { placement },
          h(Popover.Trigger, { "data-testid": "trigger" }, "Open"),
          h(Popover.Content, { "data-testid": "content", style: { zIndex: 5 } }, "hi"),
        ),
      );
      const trigger = get("[data-testid=trigger]");
      rect(trigger, 400, 300, 80, 30);
      click(trigger);
      const content = get("[data-testid=content]");
      rect(content, 0, 0, 200, 100);
      await tick();
      expect(content.dataset.placement).toBe(placement);
      expect(content.style.position).toBe("fixed");
      expect(content.style.zIndex).toBe("5");
    }
  });

  it("merges Anchor and Close onto custom elements and runs caller click handlers first", () => {
    const triggerClick = vi.fn();
    const closeClick = vi.fn();
    const { get, query } = render(
      h(
        Popover,
        null,
        h(Popover.Anchor, { asChild: true }, h("section", { "data-testid": "anchor" }, h(Popover.Trigger, { "data-testid": "trigger", onClick: triggerClick }, "Open"))),
        h(Popover.Content, { "data-testid": "content" }, h(Popover.Close, { asChild: true, onClick: closeClick }, h("a", { href: "#", "data-testid": "close" }, "Close"))),
      ),
    );
    const anchor = get("[data-testid=anchor]");
    expect(anchor.tagName).toBe("SECTION");
    expect(anchor.dataset.layerAnchor).toBe(get("[data-testid=trigger]").dataset.layerTrigger);
    click(get("[data-testid=trigger]"));
    expect(triggerClick).toHaveBeenCalledTimes(1);
    expect(get("[data-testid=close]").tagName).toBe("A");
    click(get("[data-testid=close]"));
    expect(closeClick).toHaveBeenCalledTimes(1);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("takes the hover close delay from a hoverable object and drops a pending close on unmount", async () => {
    vi.useFakeTimers();
    try {
      const onOpenChange = vi.fn();
      const hoverable = (props: Record<string, unknown>) =>
        render(h(Popover, { hoverable: props, onOpenChange }, h(Popover.Trigger, { "data-testid": "trigger" }, "Open"), h(Popover.Content, { "data-testid": "content" }, "hi")));

      const quick = hoverable({ delay: 20 });
      pointerEnter(quick.get("[data-testid=trigger]"));
      await vi.advanceTimersByTimeAsync(0);
      quick.get("[data-testid=content]");
      pointerLeave(quick.get("[data-testid=trigger]"));
      vi.advanceTimersByTime(25);
      expect(quick.query("[data-testid=content]")).toBeNull();

      const slow = hoverable({});
      pointerEnter(slow.get("[data-testid=trigger]"));
      await vi.advanceTimersByTimeAsync(0);
      pointerLeave(slow.get("[data-testid=trigger]"));
      vi.advanceTimersByTime(100);
      expect(slow.query("[data-testid=content]")).not.toBeNull();
      vi.advanceTimersByTime(60);
      expect(slow.query("[data-testid=content]")).toBeNull();

      onOpenChange.mockClear();
      const gone = hoverable({ delay: 20 });
      pointerEnter(gone.get("[data-testid=trigger]"));
      await vi.advanceTimersByTimeAsync(0);
      pointerLeave(gone.get("[data-testid=trigger]"));
      gone.unmount();
      vi.advanceTimersByTime(50);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
