// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, keydown, setupDefaultUI } from "../../testing";
import { Slider } from "../Slider";

beforeEach(() => {
  setupDefaultUI();
});

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

  it("does nothing when disabled", () => {
    const onValueChange = vi.fn();
    const r = slider({ defaultValue: 50, disabled: true, onValueChange });
    const { frame, thumbs } = parts(r);
    expect(frame.getAttribute("data-disabled")).toBe("true");
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
});
