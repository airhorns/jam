// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, h, Portal, replace, when } from "@jam/core";
import { render, resetUI, click, keydown, tick } from "../testing";
import { useControllableState, useControllableList, useStableId } from "../state";
import { useDismissableLayer, isTopmostLayer } from "../layers";
import { computePosition, floatingStyle, repositionLayer } from "../floating";

beforeEach(() => {
  resetUI();
});

describe("useControllableState", () => {
  function Toggle(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (v: boolean) => void }) {
    const [open, setOpen] = useControllableState("open", {
      value: props.open,
      defaultValue: props.defaultOpen ?? false,
      onChange: props.onOpenChange,
    });
    return h("button", { "data-open": String(open), onClick: () => setOpen(!open) }, "toggle");
  }

  it("stores uncontrolled state across re-renders", () => {
    const { get } = render(h(Toggle, { defaultOpen: false }));
    expect(get("button").dataset.open).toBe("false");
    click(get("button"));
    expect(get("button").dataset.open).toBe("true");
    click(get("button"));
    expect(get("button").dataset.open).toBe("false");
  });

  it("stays controlled when a value is passed and reports changes", () => {
    const onOpenChange = vi.fn();
    const { get } = render(h(Toggle, { open: false, onOpenChange }));
    click(get("button"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(get("button").dataset.open).toBe("false");
  });

  it("does not report unchanged values", () => {
    const onChange = vi.fn();
    function Same() {
      const [value, setValue] = useControllableState("v", { defaultValue: "a", onChange });
      return h("button", { onClick: () => setValue(value!) }, value);
    }
    const { get } = render(h(Same, {}));
    click(get("button"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps lists as JSON", () => {
    function Multi() {
      const [items, setItems] = useControllableList("items", { defaultValue: ["a"] });
      return h("button", { onClick: () => setItems([...items, "b"]) }, items.join(","));
    }
    const { get } = render(h(Multi, {}));
    expect(get("button").textContent).toBe("a");
    click(get("button"));
    expect(get("button").textContent).toBe("a,b");
  });

  it("forgets uncontrolled state when the component leaves the tree", () => {
    replace("ui", "show", true);
    function Host() {
      const show = when(["ui", "show", true]).length > 0;
      return h("div", null, show ? h(Toggle, { defaultOpen: false }) : null);
    }
    const { get, query } = render(h(Host, {}));
    click(get("button"));
    expect(get("button").dataset.open).toBe("true");
    replace("ui", "show", false);
    expect(query("button")).toBeNull();
    replace("ui", "show", true);
    expect(get("button").dataset.open).toBe("false");
  });

  it("ignores a setter invoked after the component has unmounted", () => {
    replace("ui", "show", true);
    const onOpenChange = vi.fn();
    let lateSetOpen: ((open: boolean) => void) | undefined;
    function Late() {
      const [open, setOpen] = useControllableState<boolean>("open", { defaultValue: false, onChange: onOpenChange });
      lateSetOpen = setOpen;
      return h("button", { "data-open": String(open) }, "late");
    }
    function Host() {
      const show = when(["ui", "show", true]).length > 0;
      return h("div", null, show ? h(Late, {}) : null);
    }
    const { get, query } = render(h(Host, {}));
    const before = db.facts.size;
    replace("ui", "show", false);
    expect(query("button")).toBeNull();
    lateSetOpen!(true);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(db.facts.size).toBeLessThan(before);
    replace("ui", "show", true);
    expect(get("button").dataset.open).toBe("false");
  });

  it("derives DOM-safe stable ids", () => {
    function Ids() {
      return h("div", { id: useStableId("content") });
    }
    const { root } = render(h(Ids, {}));
    expect(root.id).toMatch(/^[a-zA-Z0-9_-]+-content$/);
  });
});

describe("useDismissableLayer", () => {
  function Layer(props: { modal?: boolean; dismissOnOutsidePress?: boolean; dismissOnEscape?: boolean }) {
    const [open, setOpen] = useControllableState<boolean>("open", { defaultValue: false });
    const layer = useDismissableLayer(useStableId(), open === true, {
      onDismiss: () => setOpen(false),
      modal: props.modal,
      dismissOnOutsidePress: props.dismissOnOutsidePress,
      dismissOnEscape: props.dismissOnEscape,
    });
    return h(
      "div",
      null,
      h("button", { "data-layer-anchor": layer["data-layer"], "data-testid": "trigger", onClick: () => setOpen(!open) }, "open"),
      open ? h(Portal, null, h("div", { ...layer, "data-testid": "content" }, h("button", { "data-testid": "inner" }, "inner"))) : null,
    );
  }

  it("closes on Escape", () => {
    const { get, query } = render(h(Layer, {}));
    click(get("[data-testid=trigger]"));
    expect(query("[data-testid=content]")).not.toBeNull();
    keydown(document.body, "Escape");
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("closes on outside press but not inside or on the anchor", () => {
    const { get, query } = render(h(Layer, {}));
    click(get("[data-testid=trigger]"));
    click(get("[data-testid=inner]"));
    expect(query("[data-testid=content]")).not.toBeNull();
    click(document.body);
    expect(query("[data-testid=content]")).toBeNull();
  });

  it("respects dismissOnOutsidePress and dismissOnEscape", () => {
    const { get, query } = render(h(Layer, { dismissOnOutsidePress: false, dismissOnEscape: false }));
    click(get("[data-testid=trigger]"));
    click(document.body);
    keydown(document.body, "Escape");
    expect(query("[data-testid=content]")).not.toBeNull();
  });

  it("moves focus into modal content and restores it on close", async () => {
    const { get, query } = render(h(Layer, { modal: true }));
    const trigger = get("[data-testid=trigger]");
    trigger.focus();
    click(trigger);
    await tick();
    expect(document.activeElement).toBe(get("[data-testid=inner]"));
    expect(document.body.style.overflow).toBe("hidden");
    keydown(document.body, "Escape");
    await tick();
    expect(query("[data-testid=content]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("reports the topmost layer", () => {
    const { get } = render(h(Layer, {}));
    click(get("[data-testid=trigger]"));
    const id = get("[data-testid=content]").dataset.layer!;
    expect(isTopmostLayer(id)).toBe(true);
  });
});

describe("computePosition", () => {
  const viewport = { width: 1000, height: 800 };
  const anchor = { x: 400, y: 300, width: 100, height: 40 };
  const floating = { x: 0, y: 0, width: 200, height: 100 };

  it("centres below the anchor by default", () => {
    const pos = computePosition(anchor, floating, { viewport, offset: 8 });
    expect(pos).toMatchObject({ x: 350, y: 348, placement: "bottom", arrowX: 100 });
  });

  it("supports every side and alignment", () => {
    expect(computePosition(anchor, floating, { viewport, placement: "top" })).toMatchObject({ x: 350, y: 200, placement: "top" });
    expect(computePosition(anchor, floating, { viewport, placement: "left" })).toMatchObject({ x: 200, y: 270, placement: "left", arrowY: 50 });
    expect(computePosition(anchor, floating, { viewport, placement: "right-start" })).toMatchObject({ x: 500, y: 300, placement: "right-start" });
    expect(computePosition(anchor, floating, { viewport, placement: "bottom-end" })).toMatchObject({ x: 300, y: 340, placement: "bottom-end" });
  });

  it("flips when the preferred side overflows", () => {
    const low = { ...anchor, y: 750 };
    const pos = computePosition(low, floating, { viewport, placement: "bottom", offset: 4 });
    expect(pos.placement).toBe("top");
    expect(pos.y).toBe(750 - 100 - 4);
  });

  it("shifts to stay inside the viewport and keeps the arrow on the anchor", () => {
    const edge = { ...anchor, x: 950 };
    const pos = computePosition(edge, floating, { viewport, placement: "bottom" });
    expect(pos.x).toBe(1000 - 8 - 200);
    expect(pos.arrowX).toBe(192);
  });
});

describe("layer lifecycle", () => {
  function ModalHost() {
    const show = when(["ui", "show", true]).length > 0;
    return h("div", null, show ? h(Modal, {}) : h("p", null, "gone"));
  }
  function Modal() {
    const id = useStableId();
    useDismissableLayer(id, true, { onDismiss: () => {}, modal: true });
    return h("div", { "data-layer": id, "data-testid": "modal" }, "modal");
  }

  it("closes a layer whose component is conditionally unmounted while open", () => {
    replace("ui", "show", true);
    render(h(ModalHost, {}));
    expect(document.body.style.overflow).toBe("hidden");
    replace("ui", "show", false);
    expect(document.body.style.overflow).toBe("");
    replace("ui", "show", true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("releases the scroll lock when the whole tree unmounts", () => {
    replace("ui", "show", true);
    const { unmount } = render(h(ModalHost, {}));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("floating layers", () => {
  it("parks content hidden until measured, then positions it", async () => {
    function Pop() {
      const id = useStableId();
      const [open, setOpen] = useControllableState<boolean>("open", { defaultValue: false });
      useDismissableLayer(id, open === true, {
        onDismiss: () => setOpen(false),
        onReposition: () => repositionLayer(id, { placement: "bottom", offset: 4 }),
      });
      const { style } = floatingStyle(id);
      return h(
        "div",
        null,
        h("button", { "data-layer-anchor": id, onClick: () => setOpen(true) }, "open"),
        open ? h("div", { "data-layer": id, "data-testid": "content", style }) : null,
      );
    }
    const { get } = render(h(Pop, {}));
    const anchor = get("button");
    anchor.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 30, right: 180, bottom: 80, x: 100, y: 50, toJSON() {} }) as DOMRect;
    click(anchor);
    expect(get("[data-testid=content]").style.visibility).toBe("hidden");
    await tick();
    const content = get("[data-testid=content]");
    expect(content.style.visibility).toBe("");
    expect(content.style.top).toBe("84px");
    expect(content.style.position).toBe("fixed");
  });
});
