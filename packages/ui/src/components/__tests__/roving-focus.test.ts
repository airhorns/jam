// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { rovingFocus, rovingItems } from "../roving-focus";
import type { RovingFocusOptions } from "../roving-focus";

function group(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

function navigate(container: HTMLElement, target: Element, key: string, options?: RovingFocusOptions): { item: HTMLElement | null; event: KeyboardEvent } {
  let result: HTMLElement | null = null;
  const handler = (event: Event) => {
    result = rovingFocus(event as KeyboardEvent, "button", options);
  };
  container.addEventListener("keydown", handler);
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  container.removeEventListener("keydown", handler);
  return { item: result, event };
}

describe("rovingFocus", () => {
  it("swaps ArrowLeft and ArrowRight in rtl", () => {
    const container = group("<button>a</button><button>b</button><button>c</button>");
    const [a, b, c] = Array.from(container.children);
    expect(navigate(container, b, "ArrowRight", { dir: "rtl" }).item).toBe(a);
    expect(navigate(container, b, "ArrowLeft", { dir: "rtl" }).item).toBe(c);
    expect(document.activeElement).toBe(c);
    expect(navigate(container, c, "Home", { dir: "rtl" }).item).toBe(a);
  });

  it("accepts every arrow key when the orientation is both", () => {
    const container = group("<button>a</button><button>b</button>");
    const [a, b] = Array.from(container.children);
    expect(navigate(container, a, "ArrowDown", { orientation: "both" }).item).toBe(b);
    expect(navigate(container, a, "ArrowRight", { orientation: "both" }).item).toBe(b);
    expect(navigate(container, a, "ArrowDown", { orientation: "horizontal" }).item).toBeNull();
    expect(navigate(container, a, "ArrowRight", { orientation: "vertical" }).item).toBeNull();
  });

  it("ignores keys that are not navigation and keydowns from outside the items", () => {
    const container = group("<button>a</button><span>text</span>");
    const [a, span] = Array.from(container.children);
    const { item, event } = navigate(container, a, "Enter");
    expect(item).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(navigate(container, span, "ArrowRight").item).toBeNull();
  });

  it("does nothing when every item is disabled", () => {
    const container = group("<button disabled>a</button><button data-disabled>b</button>");
    const { item, event } = navigate(container, container.children[0], "ArrowRight");
    expect(item).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(rovingItems(container, "button")).toEqual([]);
  });

  it("moves to the first or last enabled item when the key came from a disabled item", () => {
    const container = group("<button>a</button><button disabled>b</button><button>c</button>");
    const [a, b, c] = Array.from(container.children);
    expect(navigate(container, b, "ArrowRight").item).toBe(a);
    expect(navigate(container, b, "ArrowLeft").item).toBe(c);
  });

  it("wraps by default, clamps without loop, and reports the move", () => {
    const onMove = vi.fn();
    const container = group("<button>a</button><button>b</button>");
    const [a, b] = Array.from(container.children);
    expect(navigate(container, b, "ArrowRight", { onMove }).item).toBe(a);
    expect(onMove).toHaveBeenLastCalledWith(a, 0);
    expect(navigate(container, a, "ArrowLeft").item).toBe(b);
    expect(navigate(container, b, "ArrowRight", { loop: false }).item).toBe(b);
    expect(navigate(container, a, "ArrowLeft", { loop: false }).item).toBe(a);
    expect(navigate(container, a, "End").item).toBe(b);
    const { item, event } = navigate(container, b, "Home");
    expect(item).toBe(a);
    expect(event.defaultPrevented).toBe(true);
  });
});
