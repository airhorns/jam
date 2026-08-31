// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h, Portal } from "@jam/core";
import { render, resetUI, keydown, tick } from "../testing";
import { useControllableState, useStableId } from "../state";
import { useDismissableLayer, isTopmostLayer, readFloatingPosition, writeFloatingPosition, type LayerOptions } from "../layers";

beforeEach(() => {
  resetUI();
});

function Modal(props: Partial<LayerOptions> & { buttons?: number }) {
  const id = useStableId();
  const [open, setOpen] = useControllableState<boolean>("open", { defaultValue: true });
  const layer = useDismissableLayer(id, open === true, { onDismiss: () => setOpen(false), modal: true, ...props });
  const buttons = Array.from({ length: props.buttons ?? 2 }, (_, i) => h("button", { "data-testid": `b${i}` }, `b${i}`));
  return open ? h(Portal, null, h("div", { ...layer, "data-testid": "content" }, ...buttons)) : h("p", null, "closed");
}

describe("modal focus trap", () => {
  it("wraps Tab and Shift+Tab around the content's focusables", async () => {
    const { get } = render(h(Modal, { buttons: 3 }));
    await tick();
    const [first, middle, last] = ["b0", "b1", "b2"].map((id) => get(`[data-testid=${id}]`));
    expect(document.activeElement).toBe(first);

    expect(keydown(first, "Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    expect(keydown(last, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    middle.focus();
    expect(keydown(middle, "Tab").defaultPrevented).toBe(false);
    expect(keydown(middle, "Tab", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(middle);
  });

  it("only restores focus to HTML elements", async () => {
    const trigger = document.createElement("button");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("tabindex", "0");
    document.body.append(trigger, svg);

    trigger.focus();
    let r = render(h(Modal, {}));
    await tick();
    keydown(r.get("[data-testid=content]"), "Escape");
    await tick();
    expect(document.activeElement).toBe(trigger);
    r.unmount();

    svg.focus();
    expect(document.activeElement).toBe(svg);
    r = render(h(Modal, {}));
    await tick();
    keydown(r.get("[data-testid=content]"), "Escape");
    await tick();
    expect(document.activeElement).not.toBe(svg);
  });

  it("pulls focus back in when it has escaped the content", async () => {
    const { get } = render(h(Modal, {}));
    await tick();
    document.body.focus();
    keydown(document.body, "Tab");
    expect(document.activeElement).toBe(get("[data-testid=b0]"));
    document.body.focus();
    keydown(document.body, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(get("[data-testid=b1]"));
  });
});

describe("outside press", () => {
  it("dismisses when the press target is not an element", () => {
    const { query } = render(h(Modal, {}));
    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(query("[data-testid=content]")).toBeNull();
  });
});

describe("layers without content in the document", () => {
  function Phantom(props: { onDismiss: () => void }) {
    const id = useStableId();
    useDismissableLayer(id, true, { onDismiss: props.onDismiss, modal: true });
    return h("i", { "data-id": id }, "no layer element");
  }

  it("are dropped on the next event instead of being dismissed", async () => {
    const onDismiss = vi.fn();
    const { get } = render(h(Phantom, { onDismiss }));
    const id = get("i").dataset.id!;
    expect(isTopmostLayer(id)).toBe(true);
    await tick();
    expect(document.body.style.overflow).toBe("hidden");
    keydown(document.body, "Escape");
    expect(onDismiss).not.toHaveBeenCalled();
    expect(isTopmostLayer(id)).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("repositioning", () => {
  it("runs every open layer's onReposition on window scroll and resize", async () => {
    const onReposition = vi.fn();
    render(h(Modal, { onReposition }));
    await tick();
    expect(onReposition).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    expect(onReposition).toHaveBeenCalledTimes(3);
  });
});

describe("floating position facts", () => {
  it("only re-renders readers when the position actually changes", () => {
    let renders = 0;
    const Probe = () => {
      renders++;
      const position = readFloatingPosition("pop");
      return h("i", null, position ? `${position.x},${position.y}` : "unmeasured");
    };
    const { get } = render(h(Probe, null));
    expect(get("i").textContent).toBe("unmeasured");
    const position = { x: 10, y: 20, placement: "bottom", anchorWidth: 5, anchorHeight: 5 };
    writeFloatingPosition("pop", position);
    expect(get("i").textContent).toBe("10,20");
    expect(renders).toBe(2);
    writeFloatingPosition("pop", { ...position });
    expect(renders).toBe(2);
    writeFloatingPosition("pop", { ...position, x: 11 });
    expect(get("i").textContent).toBe("11,20");
    expect(renders).toBe(3);
  });
});
