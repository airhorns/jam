// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { describeUI, drive } from "@jam/core";
import type { UINode } from "@jam/core";
import { h } from "@jam/core/jsx";
import { render, css, keydown, setupDefaultUI, resetUI } from "../../testing";
import { Slider } from "../Slider";

beforeEach(() => {
  setupDefaultUI();
});

const flatten = (nodes: UINode[]): UINode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
const driveValue = (value: string | number | boolean) => {
  const node = flatten(describeUI()).find((n) => n.drive && "value" in n.drive.keys)!;
  drive(node.drive!.id, "value", value);
};

const slider = (props: Record<string, unknown> = {}, thumbs = 1) =>
  render(
    h(
      Slider,
      props as never,
      h(
        Slider.Track,
        { key: "track", "data-testid": "track" },
        h(Slider.TrackActive, { key: "active", "data-testid": "active" }),
      ),
      ...Array.from({ length: thumbs }, (_, i) => h(Slider.Thumb, { key: i, index: i, "aria-label": `Thumb ${i}` })),
    ),
  );

const parts = (r: ReturnType<typeof render>) => ({
  frame: r.root,
  track: r.get("[data-testid=track]"),
  active: r.get("[data-testid=active]"),
  thumbs: r.all("[role=slider]"),
});

/** Give the frame a 200x20 box so pointer maths is deterministic. */
function stubRect(el: HTMLElement, box: Partial<DOMRect> = {}) {
  const rect = { x: 0, y: 0, left: 0, top: 0, width: 200, height: 20, right: 200, bottom: 20, ...box };
  el.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
}

const pointer = (target: Element | Document, type: string, clientX: number, clientY = 10) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));

const style = (el: Element) => el.getAttribute("style") ?? "";

describe("Slider", () => {
  it("renders a track, a fill and a thumb with slider semantics", () => {
    const r = slider({ defaultValue: 40 });
    const { frame, thumbs } = parts(r);
    expect(frame.getAttribute("data-orientation")).toBe("horizontal");
    expect(css(frame)).toMatchObject({ position: "relative", "touch-action": "none", cursor: "pointer" });
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0].tagName).toBe("BUTTON");
    expect(thumbs[0].getAttribute("type")).toBe("button");
    expect(thumbs[0].getAttribute("aria-valuemin")).toBe("0");
    expect(thumbs[0].getAttribute("aria-valuemax")).toBe("100");
    expect(thumbs[0].getAttribute("aria-valuenow")).toBe("40");
    expect(thumbs[0].getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("takes the rail, knob and frame height from the size token", () => {
    const { frame, track, thumbs } = parts(slider());
    expect(css(frame)).toMatchObject({ height: "20px", "min-height": "20px" });
    expect(css(track)).toMatchObject({ height: "7px", width: "100%", "border-radius": "100000px" });
    expect(css(thumbs[0])).toMatchObject({ width: "20px", height: "20px", "border-radius": "100000px" });

    const big = parts(slider({ size: "$6" }));
    expect(css(big.frame).height).toBe("29px");
    expect(css(big.track).height).toBe("11px");
    expect(css(big.thumbs[0]).width).toBe("29px");
  });

  it("resolves theme values to variables", () => {
    const { track, active, thumbs } = parts(slider({ defaultValue: 50 }));
    expect(css(track)["background-color"]).toBe("var(--background)");
    expect(css(active)["background-color"]).toBe("var(--color10)");
    expect(css(thumbs[0])).toMatchObject({ "border-color": "var(--color8)", "background-color": "var(--background)" });
    expect(css(thumbs[0], ":hover")["border-color"]).toBe("var(--color10)");
  });

  it("positions the fill and the thumb from the value", () => {
    const { active, thumbs } = parts(slider({ defaultValue: 25 }));
    expect(style(active)).toBe("left: 0%; width: 25%");
    expect(style(thumbs[0])).toBe("left: calc(25% - 5px); top: 50%");
    expect(css(thumbs[0]).transform).toBe("translateY(-50%)");
  });

  it("maps min/max onto the track", () => {
    const { active, thumbs } = parts(slider({ min: 10, max: 20, defaultValue: 15 }));
    expect(style(active)).toBe("left: 0%; width: 50%");
    expect(thumbs[0].getAttribute("aria-valuenow")).toBe("15");
  });

  it("fills between the thumbs of a range", () => {
    const { active, thumbs } = parts(slider({ defaultValue: [20, 60] }, 2));
    expect(thumbs.map((t) => t.getAttribute("aria-valuenow"))).toEqual(["20", "60"]);
    expect(style(active)).toBe("left: 20%; width: 40%");
    expect(style(thumbs[1])).toBe("left: calc(60% - 12px); top: 50%");
  });

  it("moves the focused thumb with the keyboard", () => {
    const onValueChange = vi.fn();
    const onSlideEnd = vi.fn();
    const r = slider({ defaultValue: 50, onValueChange, onSlideEnd });
    const thumb = () => parts(r).thumbs[0];

    expect(keydown(thumb(), "ArrowRight").defaultPrevented).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith([51]);
    expect(onSlideEnd).toHaveBeenCalledWith([51]);
    keydown(thumb(), "ArrowLeft");
    keydown(thumb(), "ArrowLeft");
    expect(thumb().getAttribute("aria-valuenow")).toBe("49");
    keydown(thumb(), "PageUp");
    expect(thumb().getAttribute("aria-valuenow")).toBe("59");
    keydown(thumb(), "Home");
    expect(thumb().getAttribute("aria-valuenow")).toBe("0");
    keydown(thumb(), "End");
    expect(thumb().getAttribute("aria-valuenow")).toBe("100");
    expect(keydown(thumb(), "Enter").defaultPrevented).toBe(false);
  });

  it("steps by the step size and snaps", () => {
    const r = slider({ defaultValue: 0, step: 25 });
    const thumb = () => parts(r).thumbs[0];
    keydown(thumb(), "ArrowUp");
    expect(thumb().getAttribute("aria-valuenow")).toBe("25");
    stubRect(parts(r).frame);
    pointer(parts(r).frame, "pointerdown", 84);
    expect(thumb().getAttribute("aria-valuenow")).toBe("50");
  });

  it("keeps a fractional step exact", () => {
    const r = slider({ defaultValue: 0, min: 0, max: 1, step: 0.1 });
    const thumb = () => parts(r).thumbs[0];
    keydown(thumb(), "ArrowRight");
    keydown(thumb(), "ArrowRight");
    expect(thumb().getAttribute("aria-valuenow")).toBe("0.2");
  });

  it("stays controlled when a value is passed", () => {
    const onValueChange = vi.fn();
    const r = slider({ value: 30, onValueChange });
    keydown(parts(r).thumbs[0], "ArrowRight");
    expect(onValueChange).toHaveBeenCalledWith([31]);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("30");
  });

  it("presses to a value, drags, and reports the end of the slide", () => {
    const onValueChange = vi.fn();
    const onSlideEnd = vi.fn();
    const r = slider({ defaultValue: 0, onValueChange, onSlideEnd });
    const frame = parts(r).frame;
    stubRect(frame);

    pointer(frame, "pointerdown", 50);
    expect(onValueChange).toHaveBeenLastCalledWith([25]);
    pointer(document, "pointermove", 150);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("75");
    pointer(document, "pointermove", 400);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("100");
    pointer(document, "pointerup", 400);
    expect(onSlideEnd).toHaveBeenCalledWith([100]);

    onValueChange.mockClear();
    pointer(document, "pointermove", 0);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("drags the thumb nearest the press and clamps it to its neighbour", () => {
    const onValueChange = vi.fn();
    const r = slider({ defaultValue: [20, 60], onValueChange }, 2);
    const frame = parts(r).frame;
    stubRect(frame);

    pointer(frame, "pointerdown", 180);
    expect(onValueChange).toHaveBeenLastCalledWith([20, 90]);
    pointer(document, "pointermove", 10);
    expect(parts(r).thumbs.map((t) => t.getAttribute("aria-valuenow"))).toEqual(["20", "20"]);
    pointer(document, "pointerup", 10);

    pointer(frame, "pointerdown", 4);
    expect(onValueChange).toHaveBeenLastCalledWith([2, 20]);
    pointer(document, "pointerup", 4);
  });

  it("steps by 10x with Shift+Arrow or Page keys, and flips direction for dir=\"rtl\" or inverted", () => {
    const r = slider({ defaultValue: 50 });
    keydown(parts(r).thumbs[0], "ArrowRight", { shiftKey: true });
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("60");

    const rtl = slider({ defaultValue: 50, dir: "rtl" });
    expect(parts(rtl).frame.getAttribute("dir")).toBe("rtl");
    keydown(parts(rtl).thumbs[0], "ArrowLeft");
    expect(parts(rtl).thumbs[0].getAttribute("aria-valuenow")).toBe("51");

    const inverted = slider({ defaultValue: 50, inverted: true });
    keydown(parts(inverted).thumbs[0], "ArrowRight");
    expect(parts(inverted).thumbs[0].getAttribute("aria-valuenow")).toBe("49");
  });

  it("blocks a move that would close the gap set by minStepsBetweenThumbs", () => {
    const r = slider({ defaultValue: [20, 25], minStepsBetweenThumbs: 5 }, 2);
    keydown(parts(r).thumbs[0], "ArrowRight");
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("20");
  });

  it("contributes a hidden input per value to the owning form and restores the default on reset", () => {
    const r = render(
      h("form", {}, h(Slider, { name: "volume", defaultValue: 40 } as never, h(Slider.Thumb, { "aria-label": "Volume" }))),
    );
    const thumb = r.get("[role=slider]");
    keydown(thumb, "ArrowRight");
    expect(new FormData(r.get<HTMLFormElement>("form")).get("volume")).toBe("41");
    r.get<HTMLFormElement>("form").dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    expect(r.get("[role=slider]").getAttribute("aria-valuenow")).toBe("40");
  });

  it("does nothing when disabled", () => {
    const onValueChange = vi.fn();
    const r = slider({ defaultValue: 50, disabled: true, onValueChange });
    const { frame, thumbs } = parts(r);
    expect(frame.getAttribute("data-disabled")).toBe("");
    expect(css(frame)).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    expect(thumbs[0].hasAttribute("disabled")).toBe(true);
    stubRect(frame);
    pointer(frame, "pointerdown", 150);
    expect(keydown(thumbs[0], "ArrowRight").defaultPrevented).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("50");
  });

  it("runs bottom-to-top when vertical", () => {
    const r = slider({ orientation: "vertical", defaultValue: 25 });
    const { frame, track, active, thumbs } = parts(r);
    expect(frame.getAttribute("aria-orientation")).toBe("vertical");
    expect(css(frame)).toMatchObject({ "flex-direction": "column", height: "144px", width: "20px" });
    expect(css(track)).toMatchObject({ width: "7px", height: "100%" });
    expect(css(active)).toMatchObject({ left: "0px", width: "100%" });
    expect(style(active)).toBe("bottom: 0%; height: 25%");
    expect(style(thumbs[0])).toBe("bottom: calc(25% - 5px); left: 50%");
    expect(css(thumbs[0]).transform).toBe("translateX(-50%)");

    stubRect(frame, { width: 20, height: 200, right: 20, bottom: 200 });
    pointer(frame, "pointerdown", 10, 50);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("75");
  });

  it("strips the default look when unstyled", () => {
    const bare = render(
      h(
        Slider,
        { unstyled: true } as never,
        h(
          Slider.Track,
          { unstyled: true, "data-testid": "track" },
          h(Slider.TrackActive, { unstyled: true }),
        ),
        h(Slider.Thumb, { unstyled: true }),
      ),
    );
    expect(css(bare.root).cursor).toBeUndefined();
    expect(css(bare.get("[data-testid=track]"))["background-color"]).toBeUndefined();
    expect(css(bare.get("[role=slider]"))["background-color"]).toBe("transparent");
  });

  it("sizes the rail and knob from a literal pixel size", () => {
    const { frame, track, thumbs } = parts(slider({ size: 40 }));
    expect(css(frame)).toMatchObject({ height: "18px", "min-height": "18px" });
    expect(css(track).height).toBe("7px");
    expect(css(thumbs[0])).toMatchObject({ width: "18px", height: "18px" });
    const vertical = parts(slider({ size: 40, orientation: "vertical" }));
    expect(css(vertical.frame)).toMatchObject({ width: "18px", "min-width": "18px" });
    expect(css(vertical.frame).height).not.toBe("18px");
    expect(css(vertical.track).width).toBe("7px");
  });

  it("falls back to the default knob size for an unknown size token, and to 44px with no tokens at all", () => {
    const r = slider({ defaultValue: 50, size: "$nonexistent" });
    expect(style(parts(r).thumbs[0])).toBe("left: calc(50% - 10px); top: 50%");
    resetUI();
    const tokenless = slider({ defaultValue: 50 });
    expect(style(parts(tokenless).thumbs[0])).toBe("left: calc(50% - 10px); top: 50%");
  });

  it("renders inert parts outside a Slider", () => {
    const r = render(h("div", null, h(Slider.Track, { "data-testid": "track" }, h(Slider.TrackActive, { "data-testid": "active" })), h(Slider.Thumb, { "aria-label": "Lone" })));
    const thumb = r.get("[role=slider]");
    expect(thumb.getAttribute("aria-valuenow")).toBe("0");
    expect(style(r.get("[data-testid=active]"))).toBe("left: 0%; width: 0%");
    keydown(thumb, "ArrowRight");
    expect(r.get("[role=slider]").getAttribute("aria-valuenow")).toBe("0");
    r.get("[data-testid=track]").dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });

  it("calls a thumb's own onKeyDown before moving", () => {
    const onKeyDown = vi.fn();
    const r = render(h(Slider, { defaultValue: 10 } as never, h(Slider.Thumb, { "aria-label": "Volume", onKeyDown })));
    keydown(r.get("[role=slider]"), "ArrowRight");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(r.get("[role=slider]").getAttribute("aria-valuenow")).toBe("11");
  });

  it("treats a thumb with no value as sitting at the minimum, and clamps it to its neighbour when moved", () => {
    const r = slider({ defaultValue: 30, min: 5 }, 2);
    expect(parts(r).thumbs[1].getAttribute("aria-valuenow")).toBe("5");
    keydown(parts(r).thumbs[1], "ArrowRight");
    expect(parts(r).thumbs.map((t) => t.getAttribute("aria-valuenow"))).toEqual(["30", "30"]);
  });

  it("runs top-to-bottom when vertical and inverted", () => {
    const r = slider({ orientation: "vertical", inverted: true, defaultValue: 25 });
    const { frame, active, thumbs } = parts(r);
    expect(style(active)).toBe("top: 0%; height: 25%");
    expect(style(thumbs[0])).toBe("top: calc(25% - 5px); left: 50%");
    keydown(thumbs[0], "ArrowUp");
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("24");
    stubRect(frame, { width: 20, height: 200, right: 20, bottom: 200 });
    pointer(frame, "pointerdown", 10, 50);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("25");
  });

  it("puts every thumb at the same spot when min equals max", () => {
    const r = slider({ min: 10, max: 10, defaultValue: 10 });
    expect(style(parts(r).active)).toBe("left: 0%; width: 0%");
    stubRect(parts(r).frame);
    pointer(parts(r).frame, "pointerdown", 150);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("10");
  });

  it("presses to the minimum when the frame has no size yet", () => {
    const r = slider({ defaultValue: 50 });
    stubRect(parts(r).frame, { width: 0, right: 0 });
    pointer(parts(r).frame, "pointerdown", 20);
    expect(parts(r).thumbs[0].getAttribute("aria-valuenow")).toBe("0");
  });

  it("renders with no children and posts a range as an array field", () => {
    expect(render(h(Slider, { defaultValue: 5 } as never)).root.getAttribute("role")).toBeNull();
    const r = render(h("form", {}, h(Slider, { name: "range", defaultValue: [10, 20] } as never)));
    expect(new FormData(r.get<HTMLFormElement>("form")).getAll("range[]")).toEqual(["10", "20"]);
  });

  it("is driven with numbers, numeric strings, JSON arrays and relative strings", () => {
    const onValueChange = vi.fn();
    slider({ defaultValue: [10, 90], onValueChange }, 2);
    driveValue("42");
    expect(onValueChange).toHaveBeenLastCalledWith([42, 90]);
    driveValue(7);
    expect(onValueChange).toHaveBeenLastCalledWith([7, 90]);
    driveValue("[20, 30]");
    expect(onValueChange).toHaveBeenLastCalledWith([20, 30]);
    driveValue("+5");
    expect(onValueChange).toHaveBeenLastCalledWith([5, 30]);
    expect(() => driveValue("abc")).toThrow(/2 thumbs; got 0/);
    expect(() => driveValue(true)).toThrow(/2 thumbs; got 0/);
  });

  it("ignores being driven while disabled", () => {
    const onValueChange = vi.fn();
    slider({ defaultValue: 50, disabled: true, onValueChange });
    driveValue(10);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
