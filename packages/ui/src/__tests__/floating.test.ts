import { describe, it, expect, beforeEach } from "vitest";
import { resetUI } from "../testing";
import { readFloatingPosition } from "../layers";
import { arrowStyle, floatingStyle, repositionLayer, splitPlacement } from "../floating";

beforeEach(() => {
  resetUI();
});

describe("splitPlacement", () => {
  it("defaults the alignment to center", () => {
    expect(splitPlacement("top")).toEqual({ side: "top", align: "center" });
    expect(splitPlacement("left-end")).toEqual({ side: "left", align: "end" });
  });
});

describe("floatingStyle", () => {
  it("parks unmeasured content hidden at the origin", () => {
    expect(floatingStyle("nope")).toEqual({ position: undefined, style: { position: "fixed", top: 0, left: 0, visibility: "hidden" } });
  });
});

describe("arrowStyle", () => {
  const base = { x: 0, y: 0, anchorWidth: 40, anchorHeight: 20 };

  it("hides the arrow until the layer is positioned", () => {
    expect(arrowStyle(undefined)).toEqual({ outer: { display: "none" }, inner: {} });
  });

  it("hangs the arrow off the edge facing the anchor", () => {
    expect(arrowStyle({ ...base, placement: "bottom", arrowX: 30 }, 8, 1)).toEqual({
      outer: { position: "absolute", overflow: "hidden", pointerEvents: "none", width: "16px", height: "8px", top: "-7px", left: "22px" },
      inner: { position: "absolute", width: "8px", height: "8px", transform: "rotate(45deg)", left: "4px", top: "4px" },
    });
    expect(arrowStyle({ ...base, placement: "top-start", arrowX: 30 }).outer).toMatchObject({ bottom: "-7px", left: "22px" });
    expect(arrowStyle({ ...base, placement: "top-start", arrowX: 30 }).inner).toMatchObject({ top: "-4px" });
    expect(arrowStyle({ ...base, placement: "right", arrowY: 12 }, 10, 2)).toMatchObject({
      outer: { width: "10px", height: "20px", left: "-8px", top: "2px" },
      inner: { top: "5px", left: "5px" },
    });
    expect(arrowStyle({ ...base, placement: "left-end", arrowY: 12 }, 10).outer).toMatchObject({ right: "-9px", top: "2px" });
    expect(arrowStyle({ ...base, placement: "left-end", arrowY: 12 }, 10).inner).toMatchObject({ left: "-5px" });
  });

  it("treats a missing arrow coordinate as zero", () => {
    expect(arrowStyle({ ...base, placement: "bottom" }).outer.left).toBe("-8px");
    expect(arrowStyle({ ...base, placement: "left" }).outer.top).toBe("-8px");
  });
});

describe("repositionLayer", () => {
  it("does nothing without a document", () => {
    repositionLayer("pop", { placement: "bottom" });
    expect(readFloatingPosition("pop")).toBeUndefined();
  });
});
