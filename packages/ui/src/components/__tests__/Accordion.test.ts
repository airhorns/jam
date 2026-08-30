// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "@jam/core/jsx";
import { render, css, click, keydown, injectedRules, setupDefaultUI } from "../../testing";
import { Accordion } from "../Accordion";

beforeEach(() => {
  setupDefaultUI();
});

const items = [
  { value: "a", title: "First" },
  { value: "b", title: "Second" },
  { value: "c", title: "Third" },
];

const accordion = (props: Record<string, unknown> = {}, itemProps: Record<string, unknown> = {}) =>
  render(
    h(
      Accordion,
      props as never,
      ...items.map((item, i) =>
        h(
          Accordion.Item,
          { key: item.value, value: item.value, ...(i === 2 ? itemProps : {}) },
          h(
            Accordion.Header,
            null,
            h(Accordion.Trigger, null, item.title, h(Accordion.Indicator, null)),
          ),
          h(Accordion.Content, null, `Body ${item.title}`),
        ),
      ),
    ),
  );

const triggers = (r: ReturnType<typeof render>) => r.all("button[aria-expanded]");
const regions = (r: ReturnType<typeof render>) => r.all("[role=region]");

describe("Accordion", () => {
  it("wires each trigger to its content", () => {
    const r = accordion({ defaultValue: "b" });
    expect(r.root.getAttribute("data-orientation")).toBe("vertical");
    const all = triggers(r);
    expect(all).toHaveLength(3);
    expect(all[0].closest("h3")).not.toBeNull();
    expect(all[0].getAttribute("aria-expanded")).toBe("false");
    expect(all[1].getAttribute("aria-expanded")).toBe("true");
    expect(all[1].dataset.state).toBe("open");

    const open = regions(r);
    expect(open).toHaveLength(1);
    expect(open[0].textContent).toBe("Body Second");
    expect(open[0].id).toBe(all[1].getAttribute("aria-controls"));
    expect(open[0].getAttribute("aria-labelledby")).toBe(all[1].id);
  });

  it("sizes the frame, triggers and content from the tokens", () => {
    const r = accordion({ defaultValue: "a" });
    expect(css(r.root)).toMatchObject({ "border-radius": "9px", "border-width": "1px", overflow: "hidden" });
    expect(css(triggers(r)[0])).toMatchObject({ "min-height": "44px", "padding-left": "18px" });
    expect(css(triggers(r)[0])["font-size"]).toBeDefined();
    expect(css(regions(r)[0])).toMatchObject({ "padding-left": "18px", "padding-bottom": "18px", "padding-top": "0px" });

    const small = accordion({ defaultValue: "a", size: "$3" });
    expect(css(small.root)["border-radius"]).toBe("7px");
    expect(css(triggers(small)[0])["min-height"]).toBe("36px");
    expect(css(regions(small)[0])["padding-bottom"]).toBe("13px");
  });

  it("separates the items and drops the last line", () => {
    const r = accordion();
    expect(r.root.classList.contains("jam-last-borderless")).toBe(true);
    expect(injectedRules().join("\n")).toContain(".jam-last-borderless > *:last-child { border-bottom-width: 0");
    const item = r.get("[data-value=a]");
    expect(css(item)).toMatchObject({ "border-bottom-width": "1px", "border-bottom-color": "var(--borderColor)" });
  });

  it("opens one item at a time in single mode", () => {
    const onValueChange = vi.fn();
    const r = accordion({ onValueChange });
    click(triggers(r)[0]);
    expect(onValueChange).toHaveBeenCalledWith("a");
    expect(regions(r)[0].textContent).toBe("Body First");
    click(triggers(r)[2]);
    expect(regions(r)).toHaveLength(1);
    expect(regions(r)[0].textContent).toBe("Body Third");
  });

  it("only closes the open item when collapsible", () => {
    const r = accordion({ defaultValue: "a" });
    click(triggers(r)[0]);
    expect(triggers(r)[0].getAttribute("aria-expanded")).toBe("true");

    const collapsible = accordion({ defaultValue: "a", collapsible: true });
    click(triggers(collapsible)[0]);
    expect(triggers(collapsible)[0].getAttribute("aria-expanded")).toBe("false");
    expect(regions(collapsible)).toHaveLength(0);
  });

  it("keeps several open in multiple mode", () => {
    const onValueChange = vi.fn();
    const r = accordion({ type: "multiple", defaultValue: ["a"], onValueChange });
    click(triggers(r)[1]);
    expect(onValueChange).toHaveBeenCalledWith(["a", "b"]);
    expect(regions(r).map((el) => el.textContent)).toEqual(["Body First", "Body Second"]);
    click(triggers(r)[0]);
    expect(onValueChange).toHaveBeenLastCalledWith(["b"]);
    expect(regions(r)).toHaveLength(1);
  });

  it("stays controlled when a value is passed", () => {
    const onValueChange = vi.fn();
    const r = accordion({ value: "a", onValueChange });
    click(triggers(r)[1]);
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(regions(r)[0].textContent).toBe("Body First");
  });

  it("flips the indicator when its item opens", () => {
    const r = accordion({ defaultValue: "a" });
    const indicators = r.all("span[aria-hidden]");
    expect(indicators[0].querySelector("svg path")).not.toBeNull();
    expect(css(indicators[0]).transform).toBe("rotate(180deg)");
    expect(css(indicators[1]).transform).toBeUndefined();
    expect(css(indicators[1]).color).toBe("var(--color10)");
  });

  it("bolds the open trigger and reacts to hover", () => {
    const r = accordion({ defaultValue: "a" });
    expect(css(triggers(r)[0])["font-weight"]).toBe("600");
    expect(css(triggers(r)[1])["font-weight"]).toBe("400");
    expect(css(triggers(r)[1], ":hover")["background-color"]).toBe("var(--backgroundHover)");
    expect(css(triggers(r)[1])["background-color"]).toBe("transparent");
  });

  it("moves focus between the triggers with the arrow keys", () => {
    const r = accordion({ defaultValue: "a" });
    triggers(r)[0].focus();
    const event = keydown(triggers(r)[0], "ArrowDown");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(triggers(r)[1]);
    expect(triggers(r)[0].getAttribute("aria-expanded")).toBe("true");
    keydown(triggers(r)[1], "End");
    expect(document.activeElement).toBe(triggers(r)[2]);
    keydown(triggers(r)[2], "ArrowDown");
    expect(document.activeElement).toBe(triggers(r)[0]);
    keydown(triggers(r)[0], "ArrowUp");
    expect(document.activeElement).toBe(triggers(r)[2]);
    expect(keydown(triggers(r)[2], "ArrowLeft").defaultPrevented).toBe(false);
  });

  it("disables one item and the whole accordion", () => {
    const onValueChange = vi.fn();
    const one = accordion({ onValueChange }, { disabled: true });
    expect(one.get("[data-value=c]").dataset.disabled).toBe("");
    expect(triggers(one)[2].hasAttribute("disabled")).toBe(true);
    click(triggers(one)[2]);
    expect(onValueChange).not.toHaveBeenCalled();
    triggers(one)[1].focus();
    keydown(triggers(one)[1], "ArrowDown");
    expect(document.activeElement).toBe(triggers(one)[0]);

    const all = accordion({ disabled: true, onValueChange });
    expect(triggers(all).every((el) => el.hasAttribute("disabled"))).toBe(true);
    expect(css(triggers(all)[0])).toMatchObject({ opacity: "0.5", cursor: "not-allowed" });
    click(triggers(all)[0]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps content mounted when forceMount is set", () => {
    const r = render(
      h(
        Accordion,
        { defaultValue: "a" } as never,
        h(
          Accordion.Item,
          { value: "a" },
          h(Accordion.Trigger, null, "First"),
          h(Accordion.Content, { forceMount: true }, "Body First"),
        ),
        h(
          Accordion.Item,
          { value: "b" },
          h(Accordion.Trigger, null, "Second"),
          h(Accordion.Content, { forceMount: true }, "Body Second"),
        ),
      ),
    );
    const all = regions(r);
    expect(all).toHaveLength(2);
    expect(all[0].hasAttribute("hidden")).toBe(false);
    expect(all[1].hasAttribute("hidden")).toBe(true);
    expect(all[1].dataset.state).toBe("closed");
  });

  it("lays out as a row when horizontal", () => {
    const r = accordion({ orientation: "horizontal", defaultValue: "a" });
    expect(css(r.root)["flex-direction"]).toBe("row");
    triggers(r)[0].focus();
    keydown(triggers(r)[0], "ArrowRight");
    expect(document.activeElement).toBe(triggers(r)[1]);
    expect(keydown(triggers(r)[1], "ArrowDown").defaultPrevented).toBe(false);
  });

  it("strips the default look when unstyled", () => {
    const r = render(
      h(
        Accordion,
        { defaultValue: "a", unstyled: true } as never,
        h(
          Accordion.Item,
          { value: "a", unstyled: true },
          h(Accordion.Trigger, { unstyled: true }, "First"),
          h(Accordion.Content, { unstyled: true }, "Body First"),
        ),
      ),
    );
    expect(css(r.root)["border-width"]).toBeUndefined();
    expect(css(r.get("[data-value=a]"))["border-bottom-width"]).toBeUndefined();
    expect(css(triggers(r)[0])["min-height"]).toBeUndefined();
    expect(css(regions(r)[0])["padding-bottom"]).toBeUndefined();
  });
});
